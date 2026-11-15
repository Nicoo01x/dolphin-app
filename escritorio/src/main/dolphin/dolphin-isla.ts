import { join } from 'node:path'
import { app, globalShortcut, ipcMain, screen, type BrowserWindow, type Rectangle } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import {
  closeDashboardPopout,
  createOrFocusDashboardPopout,
  getDashboardPopoutWindow,
  isDashboardPopoutRenderer
} from '../window/dashboard-popout-window'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from '../ipc/ui'
import { getLastDashboardSnapshot } from '../ipc/dashboard-popout'
import { getLocalRepos } from '../ipc/filesystem/access/filesystem-allowed-roots'
import {
  esEscrituraDesdeIsla,
  esPreferenciasDeIsla,
  esRespuestaDeEscritura,
  esRespuestaDeEstudio,
  type ResultadoDeEscritura
} from '../../shared/dolphin-isla-types'
import { tamanoDeIsla } from './dolphin-isla-ventana'
import { acotarPosicionDeIsla, posicionDeIsla, type AreaDePantalla } from './dolphin-isla-posicion'
import { leerBandejasDeIsla } from './dolphin-isla-bandeja'
import { islaAbiertaAhora, marcarIslaAbierta } from './dolphin-isla-estado'
import { pedirEscritura, recibirRespuestaDeEscritura } from './dolphin-isla-escritura'
import { pedirEstudio, recibirRespuestaDeEstudio } from './dolphin-isla-estudio'
import { crearPreferenciasDeIsla, type GuardaDePreferencias } from './dolphin-isla-preferencias'

/** El atajo de la isla, desde cualquier app: D de Dolphin. */
export const ATAJO_ISLA = 'CommandOrControl+Alt+D'
let aperturaEnCurso: Promise<void> | null = null

/**
 * Abre la isla o la cierra si ya está. Es el pop-out del dashboard en modo isla: si estaba abierto
 * el pop-out normal, se cierra antes (es una sola ventana).
 */
export async function alternarIsla(store: Store, guarda?: GuardaDePreferencias): Promise<void> {
  if (aperturaEnCurso) {
    return aperturaEnCurso
  }
  aperturaEnCurso = (async () => {
    const abierta = getDashboardPopoutWindow()
    if (abierta && islaAbiertaAhora()) {
      abierta.close()
      return
    }
    if (abierta) {
      closeDashboardPopout()
    }
    marcarIslaAbierta(true)
    const guardadas = await guarda?.leer()
    const ventana = createOrFocusDashboardPopout(store, {
      isla: true,
      posicionDeIsla: guardadas?.posicion
    })
    ventana.once('closed', () => {
      marcarIslaAbierta(false)
    })
  })().finally(() => {
    aperturaEnCurso = null
  })
  return aperturaEnCurso
}

/** Lo que pide la isla solo lo atiende la isla: el pop-out normal y otras ventanas, no. */
const esLaIsla = (sender: Electron.WebContents): boolean =>
  islaAbiertaAhora() && isDashboardPopoutRenderer(sender)

/**
 * Escribirle a un agente desde la isla: lo tipea la ventana principal, con el mismo camino que el
 * chat, y contesta si la terminal lo aceptó. Solo a un agente del último tablero que vio la isla, y
 * nunca a uno que espera que apruebes o elijas algo: el Enter contestaría esa pregunta.
 */
function escribirDesdeLaIsla(
  pedido: unknown
): Promise<ResultadoDeEscritura> | ResultadoDeEscritura {
  if (!esEscrituraDesdeIsla(pedido)) {
    return { ok: false, motivo: 'no-esta' }
  }
  const tarjeta = getLastDashboardSnapshot()?.cards.find(
    (card) => card.paneKey === pedido.paneKey && card.ptyId === pedido.ptyId
  )
  if (!tarjeta) {
    return { ok: false, motivo: 'no-esta' }
  }
  if (tarjeta.bucket === 'attention') {
    return { ok: false, motivo: 'aprobacion' }
  }
  return pedirEscritura((conId) => {
    const principal = getTrustedUIRendererWebContents()
    principal?.send('ui:dolphinIslaEscribir', conId)
    return principal !== null
  }, pedido)
}

// El centro de cada ventana de la isla, sin redondear, desde la primera vez que pide tamaño.
// Calcularlo en cada pedido a partir de la ventana la corría medio píxel a la derecha cada vez que
// el ancho cambiaba de par a impar: cien avisos, cien píxeles. Se guarda también dónde se la dejó:
// si la ventana ya no está ahí (Windows la movió al cambiar de pantalla o de escala), el centro se
// vuelve a tomar de donde quedó, o la devolvería a un lugar que quizás ya no existe.
const anclajesDeIsla = new WeakMap<BrowserWindow, { centro: number; dejada: Rectangle }>()

// Windows puede ajustar un píxel lo que se le pide (escalas fraccionarias): eso no es moverla.
const dondeLaDejo = (dejada: Rectangle, actual: Rectangle): boolean =>
  Math.abs(dejada.x - actual.x) <= 2 &&
  Math.abs(dejada.y - actual.y) <= 2 &&
  Math.abs(dejada.width - actual.width) <= 2 &&
  Math.abs(dejada.height - actual.height) <= 2

export function registrarIsla(store: Store): void {
  // Cómo arma cada uno su isla y su nota: en un archivo, porque la ventana usa una sesión en memoria.
  let preferencias: GuardaDePreferencias | null = null
  const guarda = (): GuardaDePreferencias =>
    (preferencias ??= crearPreferenciasDeIsla(join(app.getPath('userData'), 'dolphin-isla.json')))

  const guardarPosicion = async (bounds: Rectangle): Promise<void> => {
    const pantalla = screen.getDisplayNearestPoint({
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    })
    await guarda().guardar({
      posicion: posicionDeIsla(bounds.x, bounds.y, bounds.width, {
        id: pantalla.id,
        ...pantalla.workArea
      })
    })
  }

  ipcMain.removeHandler('dolphin:isla:alternar')
  ipcMain.handle('dolphin:isla:alternar', (event): void => {
    if (isTrustedUIRenderer(event.sender)) {
      void alternarIsla(store, guarda())
    }
  })
  ipcMain.removeHandler('dolphin:isla:mover')
  ipcMain.handle('dolphin:isla:mover', (event, pedido: unknown): void => {
    const ventana = getDashboardPopoutWindow()
    if (
      !ventana ||
      ventana.isDestroyed() ||
      !esLaIsla(event.sender) ||
      !pedido ||
      typeof pedido !== 'object'
    ) {
      return
    }
    const { deltaX, deltaY, soltar } = pedido as Record<string, unknown>
    if (
      typeof deltaX !== 'number' ||
      !Number.isFinite(deltaX) ||
      typeof deltaY !== 'number' ||
      !Number.isFinite(deltaY) ||
      typeof soltar !== 'boolean'
    ) {
      return
    }
    const actual = ventana.getBounds()
    const x = actual.x + deltaX
    const y = actual.y + deltaY
    const destino = { x, y }
    if (soltar) {
      const display = screen.getDisplayNearestPoint({
        x: Math.round(x + actual.width / 2),
        y: Math.round(y + actual.height / 2)
      })
      const area: AreaDePantalla = { id: display.id, ...display.workArea }
      Object.assign(destino, acotarPosicionDeIsla(x, y, actual.width, actual.height, area))
    }
    ventana.setPosition(destino.x, destino.y)
    const dejada = { ...actual, x: destino.x, y: destino.y }
    anclajesDeIsla.set(ventana, { centro: destino.x + actual.width / 2, dejada })
    if (soltar) {
      void guardarPosicion(dejada)
    }
  })
  ipcMain.removeHandler('dolphin:isla:volver-arriba')
  ipcMain.handle('dolphin:isla:volver-arriba', (event): void => {
    const ventana = getDashboardPopoutWindow()
    if (!ventana || ventana.isDestroyed() || !esLaIsla(event.sender)) {
      return
    }
    const area = screen.getPrimaryDisplay().workArea
    const x = Math.round(area.x + (area.width - ventana.getBounds().width) / 2)
    const y = area.y + 8
    ventana.setPosition(x, y)
    const bounds = { ...ventana.getBounds(), x, y }
    anclajesDeIsla.set(ventana, { centro: x + bounds.width / 2, dejada: bounds })
    void guardarPosicion(bounds)
  })
  // La página pide lo que mide su forma, en píxeles suyos (con zoom, la ventana necesita otros
  // tantos). Crece y se achica alrededor del mismo centro: la isla no se corre de lugar.
  ipcMain.removeHandler('dolphin:isla:tamano')
  ipcMain.handle('dolphin:isla:tamano', (event, pedido: unknown): void => {
    const ventana = getDashboardPopoutWindow()
    const tamano = tamanoDeIsla(pedido, event.sender.getZoomFactor())
    if (!ventana || tamano === null || !esLaIsla(event.sender)) {
      return
    }
    const actual = ventana.getBounds()
    const anclaje = anclajesDeIsla.get(ventana)
    const centro =
      anclaje && dondeLaDejo(anclaje.dejada, actual) ? anclaje.centro : actual.x + actual.width / 2
    const dejada = {
      x: Math.round(centro - tamano.ancho / 2),
      y: actual.y,
      width: tamano.ancho,
      height: tamano.alto
    }
    ventana.setBounds(dejada)
    anclajesDeIsla.set(ventana, { centro, dejada })
  })
  // La ventana mide siempre lo que la forma más grande (ver useFormaDeIsla): lo transparente deja
  // pasar el mouse a lo que hay abajo, y la isla lo toma solo con el puntero encima de la forma.
  ipcMain.removeHandler('dolphin:isla:raton')
  ipcMain.handle('dolphin:isla:raton', (event, encima: unknown): void => {
    const ventana = getDashboardPopoutWindow()
    if (
      !ventana ||
      ventana.isDestroyed() ||
      !esLaIsla(event.sender) ||
      typeof encima !== 'boolean'
    ) {
      return
    }
    ventana.setIgnoreMouseEvents(!encima, { forward: true })
  })
  ipcMain.removeHandler('dolphin:isla:escribir')
  ipcMain.handle(
    'dolphin:isla:escribir',
    async (event, pedido: unknown): Promise<ResultadoDeEscritura> =>
      esLaIsla(event.sender) ? escribirDesdeLaIsla(pedido) : { ok: false, motivo: 'no-esta' }
  )
  ipcMain.removeHandler('dolphin:isla:escrito')
  ipcMain.handle('dolphin:isla:escrito', (event, respuesta: unknown): void => {
    if (isTrustedUIRenderer(event.sender) && esRespuestaDeEscritura(respuesta)) {
      recibirRespuestaDeEscritura(respuesta)
    }
  })
  ipcMain.removeHandler('dolphin:isla:bandeja')
  ipcMain.handle('dolphin:isla:bandeja', (event) =>
    esLaIsla(event.sender) ? leerBandejasDeIsla(getLocalRepos(store)) : []
  )
  ipcMain.removeHandler('dolphin:isla:estudio')
  ipcMain.handle('dolphin:isla:estudio', (event) =>
    esLaIsla(event.sender)
      ? pedirEstudio(
          (pedido) => {
            const principal = getTrustedUIRendererWebContents()
            principal?.send('ui:dolphinIslaEstudio', pedido)
            return principal !== null
          },
          getLastDashboardSnapshot()?.cards.map((card) => card.paneKey) ?? []
        )
      : { disponible: false, agentes: [] }
  )
  ipcMain.removeHandler('dolphin:isla:estudio:respuesta')
  ipcMain.handle('dolphin:isla:estudio:respuesta', (event, respuesta: unknown): void => {
    if (isTrustedUIRenderer(event.sender) && esRespuestaDeEstudio(respuesta)) {
      recibirRespuestaDeEstudio(respuesta)
    }
  })
  ipcMain.removeHandler('dolphin:isla:preferencias')
  ipcMain.handle('dolphin:isla:preferencias', (event) =>
    esLaIsla(event.sender) ? guarda().leer() : {}
  )
  ipcMain.removeHandler('dolphin:isla:guardar')
  ipcMain.handle('dolphin:isla:guardar', async (event, parcial: unknown): Promise<void> => {
    if (esLaIsla(event.sender) && esPreferenciasDeIsla(parcial)) {
      await guarda().guardar(parcial)
    }
  })
  void app.whenReady().then(() => {
    // Why sin reintento: si otra app ya tiene el atajo, la isla se abre desde la app igual.
    if (!globalShortcut.register(ATAJO_ISLA, () => void alternarIsla(store, guarda()))) {
      console.warn(`[dolphin] ${ATAJO_ISLA} ya lo usa otra app: la isla queda sin atajo global`)
    }
  })
  app.once('will-quit', () => globalShortcut.unregister(ATAJO_ISLA))
}
