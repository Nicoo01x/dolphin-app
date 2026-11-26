import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import { lineasDelControl, type LineasDelControl } from '../../shared/winforms/winforms-controls'
import {
  analizarFuenteWinForms,
  rutaDelDesigner
} from '../../shared/winforms/winforms-form-detection'
import type { WinFormsAnalisis } from '../../shared/winforms/winforms-preview-types'
import { memoriaEnArchivo, type MemoriaDeBuilds } from '../winforms/winforms-memoria'
import { SesionWinForms } from '../winforms/winforms-session'
import { isTrustedUIRenderer } from './ui'

/**
 * El IPC de la vista previa de formularios WinForms. Una sesión por pestaña: el host corre mientras la
 * pestaña se ve y muere con ella, con la ventana o con la app.
 */

const Ruta = z
  .string()
  .min(3)
  .max(1000)
  .refine((r) => isAbsolute(r), 'ruta absoluta')
const RutaCs = Ruta.refine((r) => /\.cs$/i.test(r), '.cs')
const Sesion = z.string().regex(/^[\w-]{1,80}$/)

const AbrirSchema = z.object({
  sesion: Sesion,
  archivo: RutaCs,
  raiz: Ruta.nullable(),
  ensamblado: Ruta.refine((r) => /\.(dll|exe)$/i.test(r), '.dll o .exe').nullish()
})
const OrdenSchema = z.object({ sesion: Sesion, orden: z.enum(['refrescar', 'cerrar-dialogos']) })
const CerrarSchema = z.object({ sesion: Sesion })
const ClasificarSchema = z.array(RutaCs).max(200)
const UbicarSchema = z.object({ designer: RutaCs, nombre: z.string().max(200) })

async function analizar(archivo: string): Promise<WinFormsAnalisis> {
  const designer = rutaDelDesigner(archivo)
  const [codigo, codigoDesigner] = await Promise.all([
    readFile(archivo, 'utf8').catch(() => null),
    designer ? readFile(designer, 'utf8').catch(() => null) : Promise.resolve(null)
  ])
  if (codigo === null) {
    return null
  }
  const fuente = analizarFuenteWinForms(codigo, codigoDesigner, basename(archivo))
  return fuente
    ? {
        tipo: fuente.tipo,
        clase: fuente.clase,
        nombreCompleto: fuente.nombreCompleto,
        designer: codigoDesigner === null ? null : designer
      }
    : null
}

export function registrarWinForms(): void {
  if (process.platform !== 'win32') {
    return
  }
  let memoria: MemoriaDeBuilds | null = null
  const memoriaDeBuilds = (): MemoriaDeBuilds => {
    memoria ??= memoriaEnArchivo(join(app.getPath('userData'), 'winforms-builds.json'))
    return memoria
  }
  const sesiones = new Map<string, { sesion: SesionWinForms; ventana: WebContents }>()
  const cerrar = (id: string): void => {
    sesiones.get(id)?.sesion.cerrar()
    sesiones.delete(id)
  }
  // Un solo oyente por ventana: al cerrarse mueren todas sus sesiones.
  const ventanasVigiladas = new WeakSet<WebContents>()
  const vigilar = (ventana: WebContents): void => {
    if (ventanasVigiladas.has(ventana)) {
      return
    }
    ventanasVigiladas.add(ventana)
    ventana.once('destroyed', () => {
      for (const [id, { ventana: duena }] of sesiones) {
        if (duena === ventana) {
          cerrar(id)
        }
      }
    })
  }
  app.on('before-quit', () => {
    for (const id of sesiones.keys()) {
      cerrar(id)
    }
  })

  ipcMain.handle('winforms:analizar', (event, archivo: unknown) => {
    const parsed = RutaCs.safeParse(archivo)
    return isTrustedUIRenderer(event.sender) && parsed.success ? analizar(parsed.data) : null
  })

  ipcMain.handle('winforms:clasificar', async (event, archivos: unknown) => {
    const parsed = ClasificarSchema.safeParse(archivos)
    if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
      return {}
    }
    const resultados = await Promise.all(
      parsed.data.map(async (a) => [a, await analizar(a)] as const)
    )
    return Object.fromEntries(resultados.map(([a, r]) => [a, r?.tipo ?? null]))
  })

  ipcMain.handle('winforms:abrir', (event, pedido: unknown) => {
    const parsed = AbrirSchema.safeParse(pedido)
    if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
      return false
    }
    const { sesion: id, ...resto } = parsed.data
    cerrar(id)
    const ventana = event.sender
    const sesion = new SesionWinForms(
      resto,
      (evento) => {
        if (!ventana.isDestroyed() && sesiones.get(id)?.sesion === sesion) {
          ventana.send('winforms:evento', { sesion: id, evento })
        }
      },
      memoriaDeBuilds()
    )
    sesiones.set(id, { sesion, ventana })
    vigilar(ventana)
    void sesion.iniciar()
    return true
  })

  ipcMain.handle('winforms:ordenar', (event, pedido: unknown) => {
    const parsed = OrdenSchema.safeParse(pedido)
    if (isTrustedUIRenderer(event.sender) && parsed.success) {
      sesiones.get(parsed.data.sesion)?.sesion.ordenar(parsed.data.orden)
    }
  })

  ipcMain.handle('winforms:cerrar', (event, pedido: unknown) => {
    const parsed = CerrarSchema.safeParse(pedido)
    if (isTrustedUIRenderer(event.sender) && parsed.success) {
      cerrar(parsed.data.sesion)
    }
  })

  ipcMain.handle('winforms:elegirEnsamblado', async (event, desde: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      return null
    }
    const carpeta = Ruta.safeParse(desde)
    const ventana = BrowserWindow.fromWebContents(event.sender)
    const opciones = {
      title: 'Elegí el ensamblado que contiene el formulario',
      properties: ['openFile' as const],
      filters: [{ name: 'Ensamblados .NET', extensions: ['dll', 'exe'] }],
      ...(carpeta.success ? { defaultPath: carpeta.data } : {})
    }
    const elegido = ventana
      ? await dialog.showOpenDialog(ventana, opciones)
      : await dialog.showOpenDialog(opciones)
    return elegido.canceled ? null : (elegido.filePaths[0] ?? null)
  })

  ipcMain.handle(
    'winforms:ubicar',
    async (event, pedido: unknown): Promise<LineasDelControl | null> => {
      const parsed = UbicarSchema.safeParse(pedido)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return null
      }
      const texto = await readFile(parsed.data.designer, 'utf8').catch(() => null)
      return texto === null ? null : lineasDelControl(texto, parsed.data.nombre)
    }
  )
}
