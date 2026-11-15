/** Las capas de X-ray: una ventana transparente por pantalla, y cómo se les habla. */
import { app, BrowserWindow, screen } from 'electron'
import type { XrayRect } from '../../shared/dolphin-xray-types'
import { paginaDeCapaXray } from './dolphin-xray-overlay-page'

const PARTICION_XRAY = 'dolphin-xray'

// Why sin catálogos: el proceso principal no tiene i18n; la capa habla el idioma del sistema.
function textosDeCapa(): Parameters<typeof paginaDeCapaXray>[0] {
  if (app.getLocale().toLowerCase().startsWith('es')) {
    return {
      placeholder: '¿Qué querés que haga con esto?',
      ayuda: 'Enter se lo manda al agente · Shift+Enter, otra línea · Esc sale',
      bug: 'Esto está mal',
      bugPlaceholder: '¿Qué viste?',
      bugAyuda: 'Enter manda el reporte · Esc sale',
      enviado: 'Listo: se lo mandé al agente',
      sinAgente: 'No hay un agente abierto: lo copié al portapapeles',
      reportado: 'Reporte enviado a Dolphin',
      copiado: 'Copiado al portapapeles'
    }
  }
  return {
    placeholder: 'What should the agent do with this?',
    ayuda: 'Enter sends it to the agent · Shift+Enter for a new line · Esc exits',
    bug: 'This is wrong',
    bugPlaceholder: 'What did you see?',
    bugAyuda: 'Enter sends the report · Esc exits',
    enviado: 'Sent to the agent',
    sinAgente: 'No agent is open: copied to the clipboard',
    reportado: 'Report sent to Dolphin',
    copiado: 'Copied to the clipboard'
  }
}

export type Capa = { displayId: number; origen: { x: number; y: number }; ventana: BrowserWindow }

/** Un rectángulo del ayudante (píxeles físicos) en la capa de la pantalla donde cae. */
export function enLaCapa(rect: XrayRect, capas: Capa[]): { capa: Capa; rect: XrayRect } | null {
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, rect) : { ...rect }
  const pantalla = screen.getDisplayMatching(dip)
  const capa = capas.find((c) => c.displayId === pantalla.id)
  if (!capa) {
    return null
  }
  return {
    capa,
    rect: {
      x: Math.round(dip.x - capa.origen.x),
      y: Math.round(dip.y - capa.origen.y),
      width: Math.round(dip.width),
      height: Math.round(dip.height)
    }
  }
}

function enCapa(capa: Capa, codigo: string): void {
  if (!capa.ventana.isDestroyed()) {
    void capa.ventana.webContents.executeJavaScript(codigo, true).catch(() => undefined)
  }
}

export function llamar(capa: Capa, metodo: string, datos?: unknown): void {
  enCapa(
    capa,
    `window.__xray && window.__xray.${metodo}(${datos === undefined ? '' : JSON.stringify(datos)})`
  )
}

export function crearCapas(alMensaje: (mensaje: string) => void): Capa[] {
  const pagina = paginaDeCapaXray(textosDeCapa())
  return screen.getAllDisplays().map((display) => {
    const { x, y, width, height } = display.bounds
    const ventana = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      show: false,
      title: 'Dolphin X-ray',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        // Why en memoria y aparte: es una página nuestra sin preload; no comparte nada con la app.
        partition: PARTICION_XRAY
      }
    })
    ventana.setAlwaysOnTop(true, 'screen-saver')
    // Why: mientras se señala, el mouse pasa de largo y el ayudante ve la app que está abajo.
    ventana.setIgnoreMouseEvents(true)
    // Why: el anillo y la tarjeta no salen en el recorte que se le manda al agente.
    ventana.setContentProtection(true)
    ventana.webContents.on('console-message', ({ message }) => alMensaje(message))
    ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    ventana.webContents.on('will-navigate', (event) => event.preventDefault())
    ventana.once('ready-to-show', () => ventana.showInactive())
    void ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pagina)}`)
    return { displayId: display.id, origen: { x, y }, ventana }
  })
}
