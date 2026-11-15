import {
  setActivityTerminalPortals,
  type ActivityTerminalPortalTarget
} from '../activity/activity-terminal-portal'

/**
 * Dónde van a parar las terminales del lienzo.
 *
 * Una terminal del lienzo NO monta su propia `TerminalPane`: la que existe vive en el árbol del
 * workspace —oculto mientras estás en el lienzo— y lo que se hace es PORTEARLA a la ventana.
 *
 * Por qué, que es lo que costó descubrir: el proceso principal corta la entrega de bytes de todo
 * PTY que ninguna vista visible esté consumiendo (`main/ipc/pty-hidden-delivery-gate.ts`; el
 * modelo los sigue procesando y al revelarse se restaura del snapshot). Montando un pane nuevo
 * acá, el proceso arrancaba y corría, pero la ventana se dibujaba del tamaño justo y
 * PERFECTAMENTE VACÍA, para siempre. Porteando el que ya existe, la app lo ve visible y la
 * salida llega. Es el mismo camino que usan Activity y el panel flotante.
 *
 * El canal es el de Activity (`activity-terminal-portal`) y es uno solo para toda la app, así que
 * acá se junta lo de todas las ventanas y se publica de una sola vez: publicar por ventana haría
 * que la última pisara a las anteriores. Las dos vistas no conviven —o estás en Activity o estás
 * en el lienzo—, y al salir se limpia.
 */

type Destino = {
  readonly worktreeId: string
  readonly tabId: string
  readonly paneKey: string
  readonly target: HTMLElement
  readonly activa: boolean
}

const porVentana = new Map<string, Destino>()

function publicar(): void {
  const targets: ActivityTerminalPortalTarget[] = [...porVentana.entries()].map(
    ([id, destino]) => ({
      slotId: `lienzo:${id}`,
      // El token cambia con el destino y con quién está al frente: es lo que le dice a la vista
      // de terminal que tiene que volver a enganchar el pane.
      requestToken: `${destino.paneKey}|${destino.activa ? 'frente' : 'atras'}`,
      target: destino.target,
      worktreeId: destino.worktreeId,
      tabId: destino.tabId,
      paneKey: destino.paneKey,
      active: destino.activa
    })
  )
  setActivityTerminalPortals(targets)
}

/** Registra (o actualiza) el destino de una ventana del lienzo. */
export function ponerDestino(id: string, destino: Destino): void {
  const antes = porVentana.get(id)
  if (
    antes &&
    antes.target === destino.target &&
    antes.paneKey === destino.paneKey &&
    antes.activa === destino.activa &&
    antes.tabId === destino.tabId &&
    antes.worktreeId === destino.worktreeId
  ) {
    return
  }
  porVentana.set(id, destino)
  publicar()
}

/** Saca el destino de una ventana que se cerró o se desmontó. */
export function sacarDestino(id: string): void {
  if (porVentana.delete(id)) {
    publicar()
  }
}

/** Al salir del lienzo: ninguna ventana reclama nada y el workspace vuelve a pintar lo suyo. */
export function limpiarDestinos(): void {
  if (porVentana.size === 0) {
    return
  }
  porVentana.clear()
  publicar()
}

/** Para los tests. */
export function _destinosDelLienzoParaTest(): ReadonlyMap<string, Destino> {
  return porVentana
}
