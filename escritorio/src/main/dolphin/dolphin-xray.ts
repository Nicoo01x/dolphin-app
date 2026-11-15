/**
 * Dolphin X-ray: con Ctrl+Alt+X se prende una capa sobre todas las pantallas; el mouse va
 * señalando el control de cualquier app que tiene abajo, un clic lo elige (la app no lo recibe),
 * se escribe qué hacer con él y le llega al agente activo de la ventana principal con todo lo que
 * hace falta para encontrarlo: app, ventana, tipo, nombre, camino, posición y un recorte.
 *
 * El que lee los controles es native/xray-windows/xray.ps1 (UI Automation + un gancho de mouse de
 * bajo nivel). La capa no recibe el mouse mientras se señala (setIgnoreMouseEvents), así que el
 * ayudante ve la app de abajo y no a Dolphin; y no sale en los recortes (setContentProtection).
 */
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { app, clipboard, globalShortcut, ipcMain } from 'electron'
import { forceTerminateProcessTree } from '@dolphin/process-host/process-tree-termination'
import {
  FALLBACK_WINDOWS_EXECUTION_POLICY,
  PREFERRED_WINDOWS_EXECUTION_POLICY
} from '../computer/windows-powershell-execution-policy'
import {
  etiquetaXray,
  promptDeXray,
  referenciaDeXray,
  type XrayEvent,
  type XrayTarget
} from '../../shared/dolphin-xray-types'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from '../ipc/ui'
import { XRAY_CONSOLE_PREFIX } from './dolphin-xray-overlay-page'
import { lanzarAyudante, rutaDelAyudanteXray } from './dolphin-xray-ayudante'
import { crearCapas, enLaCapa, llamar, type Capa } from './dolphin-xray-capas'
import { registrarDolphinBug } from './dolphin-bug'

export const ATAJO_XRAY = 'CommandOrControl+Alt+X'
// Lo que tarda la ventana principal en confirmar que le llegó al agente.
const ESPERA_DE_ENVIO_MS = 10_000
const AVISO_FINAL_MS = 1400

type Sesion = {
  ayudante: ChildProcess
  capas: Capa[]
  fase: 'senalando' | 'elegido' | 'cerrando'
  elegido: XrayTarget | null
}

let sesion: Sesion | null = null
const enviosPendientes = new Map<string, (ok: boolean) => void>()

function mandarAlAyudante(comando: 'pause' | 'resume' | 'stop'): void {
  const entrada = sesion?.ayudante.stdin
  if (entrada && !entrada.destroyed) {
    entrada.write(`${comando}\n`)
  }
}

function alEventoDelAyudante(evento: XrayEvent): void {
  const actual = sesion
  if (!actual || actual.fase === 'cerrando') {
    return
  }
  if (evento.type === 'cancel' || evento.type === 'error') {
    terminarXray()
    return
  }
  if (evento.type === 'hover' && actual.fase === 'senalando') {
    const rect = evento.element?.rect
    const lugar = rect && rect.width > 0 ? enLaCapa(rect, actual.capas) : null
    for (const capa of actual.capas) {
      if (lugar && capa === lugar.capa) {
        llamar(capa, 'hover', {
          rect: lugar.rect,
          label: etiquetaXray(evento),
          app: evento.app?.own ? 'Dolphin' : (evento.app?.process ?? '')
        })
      } else {
        llamar(capa, 'clear')
      }
    }
    return
  }
  if (evento.type === 'pick' && actual.fase === 'senalando') {
    const rect = evento.element?.rect ?? {
      x: evento.point.x - 20,
      y: evento.point.y - 12,
      width: 40,
      height: 24
    }
    const lugar = enLaCapa(rect, actual.capas)
    if (!lugar) {
      return
    }
    actual.fase = 'elegido'
    actual.elegido = evento
    // Why pausa: ahora los clics tienen que llegar a la tarjeta para escribir el pedido.
    mandarAlAyudante('pause')
    for (const capa of actual.capas) {
      if (capa !== lugar.capa) {
        llamar(capa, 'clear')
      }
    }
    lugar.capa.ventana.setIgnoreMouseEvents(false)
    lugar.capa.ventana.focus()
    llamar(lugar.capa, 'pick', {
      rect: lugar.rect,
      label: etiquetaXray(evento),
      app: evento.app?.own ? 'Dolphin' : evento.app?.window || evento.app?.process || ''
    })
  }
}

function recibirDeLaCapa(mensaje: string): void {
  if (!mensaje.startsWith(XRAY_CONSOLE_PREFIX)) {
    return
  }
  let datos: { type?: unknown; text?: unknown }
  try {
    datos = JSON.parse(mensaje.slice(XRAY_CONSOLE_PREFIX.length))
  } catch {
    return
  }
  const actual = sesion
  if (!actual) {
    return
  }
  if (datos.type === 'cancel') {
    terminarXray()
    return
  }
  if (datos.type === 'submit' && actual.fase === 'elegido' && actual.elegido) {
    const pedido = typeof datos.text === 'string' ? datos.text : ''
    void enviarAlAgente(promptDeXray(actual.elegido, pedido))
    return
  }
  if (datos.type === 'bug' && actual.fase === 'elegido' && actual.elegido) {
    const que = typeof datos.text === 'string' ? datos.text.trim() : ''
    if (!que) {
      return
    }
    actual.fase = 'cerrando'
    const principal = getTrustedUIRendererWebContents()
    const id = randomUUID()
    if (principal && !principal.isDestroyed()) {
      principal.send('ui:dolphinXrayBug', {
        id,
        que,
        elemento: referenciaDeXray(actual.elegido)
      })
    } else {
      clipboard.writeText(`${que}\n\n${referenciaDeXray(actual.elegido)}`)
    }
    for (const capa of actual.capas) {
      llamar(capa, 'reportDone', !principal || principal.isDestroyed())
    }
    setTimeout(() => terminarXray(), AVISO_FINAL_MS)
  }
}

async function enviarAlAgente(prompt: string): Promise<void> {
  const actual = sesion
  if (!actual) {
    return
  }
  actual.fase = 'cerrando'
  const principal = getTrustedUIRendererWebContents()
  let ok = false
  if (principal) {
    const id = randomUUID()
    ok = await new Promise<boolean>((resolver) => {
      const tope = setTimeout(() => {
        enviosPendientes.delete(id)
        resolver(false)
      }, ESPERA_DE_ENVIO_MS)
      enviosPendientes.set(id, (llego) => {
        clearTimeout(tope)
        enviosPendientes.delete(id)
        resolver(llego)
      })
      principal.send('ui:dolphinXrayEnviar', { id, prompt })
    })
  }
  if (!ok) {
    // Why: lo que escribiste no se pierde aunque no haya a quién mandárselo.
    clipboard.writeText(prompt)
  }
  for (const capa of actual.capas) {
    llamar(capa, 'done', ok)
  }
  setTimeout(() => terminarXray(), AVISO_FINAL_MS)
}

export function xrayActivo(): boolean {
  return sesion !== null
}

/** Se está buscando el ayudante en el disco: un segundo atajo en ese rato no arranca otro. */
let xrayArrancando = false

export async function empezarXray(): Promise<boolean> {
  if (sesion || xrayArrancando || process.platform !== 'win32') {
    return false
  }
  xrayArrancando = true
  let script: string | null
  try {
    script = await rutaDelAyudanteXray()
  } finally {
    xrayArrancando = false
  }
  if (!script) {
    console.warn('[dolphin] X-ray: no está native/xray-windows/xray.ps1')
    return false
  }
  const capas = crearCapas(recibirDeLaCapa)
  const reintentarConBypass = (): void => {
    const actual = sesion
    if (!actual || actual.fase !== 'senalando') {
      return
    }
    void forceTerminateProcessTree(actual.ayudante).catch(() => false)
    actual.ayudante = lanzarAyudante(
      script,
      FALLBACK_WINDOWS_EXECUTION_POLICY,
      alEventoDelAyudante,
      () => undefined
    )
  }
  sesion = {
    ayudante: lanzarAyudante(
      script,
      PREFERRED_WINDOWS_EXECUTION_POLICY,
      alEventoDelAyudante,
      reintentarConBypass
    ),
    capas,
    fase: 'senalando',
    elegido: null
  }
  // Why Esc global solo mientras dura: la capa no tiene el foco mientras se señala.
  globalShortcut.register('Escape', () => terminarXray())
  return true
}

export function terminarXray(): void {
  const actual = sesion
  if (!actual) {
    return
  }
  sesion = null
  globalShortcut.unregister('Escape')
  mandarAlAyudante('stop')
  const ayudante = actual.ayudante
  ayudante.stdin?.end()
  // Why la red: si el ayudante no lee el stop, el gancho de mouse no puede quedar vivo.
  setTimeout(() => {
    if (ayudante.exitCode === null && ayudante.signalCode === null) {
      void forceTerminateProcessTree(ayudante).catch(() => false)
    }
  }, 1500)
  for (const capa of actual.capas) {
    if (!capa.ventana.isDestroyed()) {
      capa.ventana.destroy()
    }
  }
}

export function alternarXray(): void {
  if (sesion) {
    terminarXray()
  } else {
    empezarXray().catch((error: unknown) => {
      console.warn('[dolphin] X-ray no arrancó', error)
    })
  }
}

export function registrarXray(): void {
  registrarDolphinBug()
  ipcMain.removeHandler('dolphin:xray:alternar')
  ipcMain.handle('dolphin:xray:alternar', (event): void => {
    if (isTrustedUIRenderer(event.sender)) {
      alternarXray()
    }
  })
  ipcMain.removeHandler('dolphin:xray:resultado')
  ipcMain.handle('dolphin:xray:resultado', (event, respuesta: unknown): void => {
    if (!isTrustedUIRenderer(event.sender) || !respuesta || typeof respuesta !== 'object') {
      return
    }
    const { id, ok } = respuesta as Record<string, unknown>
    if (typeof id === 'string') {
      enviosPendientes.get(id)?.(ok === true)
    }
  })
  if (process.platform !== 'win32') {
    return
  }
  void app.whenReady().then(() => {
    // Why sin reintento: si otra app ya tiene el atajo, X-ray se prende desde la app igual.
    if (!globalShortcut.register(ATAJO_XRAY, () => alternarXray())) {
      console.warn(`[dolphin] ${ATAJO_XRAY} ya lo usa otra app: X-ray queda sin atajo global`)
    }
  })
  app.once('will-quit', () => {
    terminarXray()
    globalShortcut.unregister(ATAJO_XRAY)
  })
}
