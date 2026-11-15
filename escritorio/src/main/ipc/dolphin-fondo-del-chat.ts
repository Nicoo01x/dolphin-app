import { BrowserWindow, ipcMain } from 'electron'
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join, normalize, sep } from 'node:path'
import { z } from 'zod'
import {
  getDolphinProfileDirectory,
  getDolphinProfileIndexPath
} from '../dolphin-profiles/profile-storage-paths'
import { readProfileIndex } from '../dolphin-profiles/profile-index-store'
import { nombreDeFondoPropioValido } from '../../shared/fondo-del-chat'
import type { FondoPropioElegido } from '../../shared/fondo-del-chat-ipc'
import { showSingleFlightOpenDialog } from './single-flight-open-dialog'
import { isTrustedUIRenderer } from './ui'
import { translateMain } from '../i18n/main-i18n'

/**
 * «Elegir una imagen…» de Ajustes → Apariencia → Fondo del chat.
 *
 * La imagen se COPIA adentro del perfil activo (`profiles/<id>/fondos/`) y no se guarda la ruta
 * original: el fondo no se rompe si la persona mueve o borra el archivo, y cada perfil tiene el
 * suyo, igual que el resto de sus ajustes. El renderer la pide por nombre y recibe los bytes: no hay
 * protocolo nuevo ni ruta del disco que viaje a la página.
 */

const EXTENSIONES = ['webp', 'png', 'jpg', 'jpeg', 'avif'] as const
/** Una foto de 6000 px pesa unos 15 MB; más que esto es un RAW o un error. */
const MAXIMO_DE_BYTES = 25 * 1024 * 1024
const LeerSchema = z.object({ nombre: z.string().min(1).max(160) })

function carpetaDeFondos(): string | null {
  const indice = readProfileIndex(getDolphinProfileIndexPath())
  return indice ? join(getDolphinProfileDirectory(indice.activeProfileId), 'fondos') : null
}

/** La ruta del archivo, sólo si el nombre es uno de los nuestros y cae adentro de la carpeta. */
function rutaDeFondo(nombre: string): string | null {
  const carpeta = carpetaDeFondos()
  if (!carpeta || !nombreDeFondoPropioValido(nombre)) {
    return null
  }
  const raiz = normalize(carpeta)
  const ruta = normalize(join(raiz, nombre))
  return ruta.startsWith(raiz + sep) ? ruta : null
}

async function elegir(event: Electron.IpcMainInvokeEvent): Promise<FondoPropioElegido> {
  const ventana = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
  const eleccion = await showSingleFlightOpenDialog(
    {
      title: translateMain('native.dialog.pickChatBackground', 'Pick the chat background'),
      properties: ['openFile'],
      filters: [
        {
          name: translateMain('native.dialog.chatBackgroundImage', 'Image'),
          extensions: [...EXTENSIONES]
        }
      ]
    },
    ventana
  )
  const origen = eleccion.filePaths[0]
  if (eleccion.canceled || !origen) {
    return { ok: false, motivo: 'cancelado' }
  }
  const extension = extname(origen).slice(1).toLowerCase()
  if (!EXTENSIONES.includes(extension as (typeof EXTENSIONES)[number])) {
    return { ok: false, motivo: 'formato' }
  }
  const datos = await stat(origen).catch(() => null)
  if (!datos?.isFile()) {
    return { ok: false, motivo: 'ilegible' }
  }
  if (datos.size > MAXIMO_DE_BYTES) {
    return { ok: false, motivo: 'pesada' }
  }
  const carpeta = carpetaDeFondos()
  if (!carpeta) {
    return { ok: false, motivo: 'ilegible' }
  }
  await mkdir(carpeta, { recursive: true })
  const nombre = `${randomUUID()}.${extension}`
  const destino = join(carpeta, nombre)
  try {
    await copyFile(origen, destino)
  } catch {
    await rm(destino, { force: true }).catch(() => {})
    return { ok: false, motivo: 'ilegible' }
  }
  return { ok: true, nombre }
}

export function registerDolphinFondoDelChatHandlers(): void {
  ipcMain.handle('dolphin:fondo:elegir', (event): Promise<FondoPropioElegido> => {
    if (!isTrustedUIRenderer(event.sender)) {
      return Promise.resolve({ ok: false, motivo: 'ilegible' })
    }
    return elegir(event)
  })

  ipcMain.handle(
    'dolphin:fondo:leer',
    async (event, pedido: unknown): Promise<ArrayBuffer | null> => {
      const parsed = LeerSchema.safeParse(pedido)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return null
      }
      const ruta = rutaDeFondo(parsed.data.nombre)
      if (!ruta) {
        return null
      }
      try {
        const buf = await readFile(ruta)
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      } catch {
        return null
      }
    }
  )
}
