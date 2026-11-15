import { translate } from '@/i18n/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { getLeftmostLeafId } from '../terminal-pane/layout/terminal-layout-leaf-traversal'
import type { PanelLod } from './canvas'
import { ponerDestino, sacarDestino } from './portales-del-lienzo'

/**
 * Una terminal de verdad adentro de una ventana del lienzo.
 *
 * Es la misma terminal del resto de la app —el mismo PTY, los mismos links, el mismo seguimiento
 * de cuándo termina un agente—, no una imitación: en el lienzo, poner a correr un agente es abrir
 * una de estas y escribirle.
 *
 * **Acá no se monta ninguna `TerminalPane`.** Este componente abre una pestaña y después ofrece
 * su hueco como destino: la pane de verdad vive en el árbol del workspace (oculto mientras estás
 * en el lienzo) y se PORTEA hasta acá. El porqué está en `portales-del-lienzo.ts`, y es lo único
 * que hace que la terminal pinte: con una pane propia, el proceso arrancaba y corría pero la
 * ventana se quedaba perfectamente vacía, porque el proceso principal corta la entrega de bytes
 * de todo PTY que ninguna vista visible consuma.
 *
 * Y una advertencia para el próximo que la vea negra: **el texto de la terminal NO está en el
 * DOM.** Con el renderizador WebGL —el de siempre acá— xterm pinta en un canvas y `.xterm-rows`
 * queda vacío. Un detector de «esto no dibujó nada» que mire ese elemento da positivo con la
 * terminal andando perfecta: hubo uno acá y tapó con un cartel la salida que sí estaba. Para
 * saber si llegan bytes se mira `window.__dolphinTerminalFreezeReport()`, que trae el contador por
 * PTY del proceso principal y el del watchdog del renderer.
 *
 * Tres cosas más que conviene no deshacer:
 *
 * 0. **El hueco se dibuja del tamaño que tiene en el PLANO y se achica con `transform`**, en vez
 *    de medir lo que ocupa en la pantalla. Es la única parte del lienzo que no se posiciona ya
 *    escalada, y es a propósito: xterm mide su hueco en píxeles y le avisa al PTY cuántas
 *    columnas y filas hay. Dibujado a tamaño de pantalla, alejar el zoom le achicaba la consola
 *    al proceso de verdad —PowerShell contestaba «the current window size of the console is too
 *    small», y un agente trabajando ahí adentro veía su ventana cambiar en cada rueda del
 *    mouse—. Con el transform, el proceso siempre ve la misma ventana y lo único que cambia es
 *    de qué tamaño la ves vos. Es lo que hace Deska con su plano entero.
 *
 * 1. **El hueco no se desmonta por estar lejos.** El cleanup cierra la pestaña, y cerrar la
 *    pestaña mata el proceso: si al alejar el zoom se desmontara, alejarte te mataría el agente
 *    que está trabajando. Cuando el detalle baja se le pone un cartel encima y listo.
 * 2. **La del frente reclama ser la pestaña activa del worktree.** Con varias terminales en el
 *    plano, el worktree tiene una sola activa; traer una al frente es también pedir que sea esa.
 */
export function VentanaDeTerminal({
  worktreeId,
  zoom,
  enElPlano,
  detalle,
  titulo,
  alFrente,
  alCerrar
}: {
  worktreeId: string | null
  zoom: number
  /** El hueco en coordenadas del plano: de ese tamaño se dibuja el xterm, pase lo que pase con el zoom. */
  enElPlano: { width: number; height: number }
  detalle: PanelLod
  titulo: string
  /** Si esta es la ventana de arriba del todo: la que reclama los bytes. */
  alFrente: boolean
  alCerrar: () => void
}): React.JSX.Element {
  const createTab = useAppStore((s) => s.createTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const setTabCustomTitle = useAppStore((s) => s.setTabCustomTitle)
  const setActiveTabForWorktree = useAppStore((s) => s.setActiveTabForWorktree)
  const [tabId, setTabId] = useState<string | null>(null)
  const hueco = useRef<HTMLDivElement>(null)
  const id = useId()
  // El cierre se lee del ref: ponerlo en las dependencias volvería a crear la pestaña —y a matar
  // el proceso— cada vez que el padre vuelve a dibujar con una función nueva.
  const cerrar = useRef(alCerrar)
  cerrar.current = alCerrar

  // El leaf de la pestaña, que es la otra mitad del `paneKey`. Se mira del layout y no se guarda:
  // una división de la terminal lo cambia, y el destino tiene que seguir al leaf de la izquierda.
  const leafId = useAppStore((s) => {
    const raiz = tabId ? s.terminalLayoutsByTabId[tabId]?.root : null
    return raiz ? getLeftmostLeafId(raiz) : null
  })

  useEffect(() => {
    if (!worktreeId) {
      return
    }
    const tab = createTab(worktreeId, undefined, undefined, {
      activate: false,
      recordInteraction: false
    })
    setTabCustomTitle(tab.id, titulo, { recordInteraction: false })
    setActiveTabForWorktree(worktreeId, tab.id)
    setTabId(tab.id)
    return () => {
      closeTab(tab.id, { recordInteraction: false, reason: 'cleanup' })
      setTabId(null)
    }
    // `titulo` a propósito afuera: renombrar la ventana no tiene que reiniciar la terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreeId, createTab, closeTab, setTabCustomTitle, setActiveTabForWorktree])

  useEffect(() => {
    if (alFrente && worktreeId && tabId) {
      setActiveTabForWorktree(worktreeId, tabId)
    }
  }, [alFrente, worktreeId, tabId, setActiveTabForWorktree])

  // Acá se ofrece el hueco. Mientras la ventana está lejos no se pide la pane: traer un xterm
  // vivo a un rectángulo de cien píxeles es pagar un `fit` de mil columnas para no leer nada.
  useEffect(() => {
    const caja = hueco.current
    if (!caja || !worktreeId || !tabId || !leafId || detalle !== 'live') {
      sacarDestino(id)
      return
    }
    ponerDestino(id, {
      worktreeId,
      tabId,
      paneKey: makePaneKey(tabId, leafId),
      target: caja,
      activa: alFrente
    })
    return () => sacarDestino(id)
  }, [id, worktreeId, tabId, leafId, detalle, alFrente])

  if (!worktreeId) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-[13px] text-muted-foreground">
        {translate(
          'canvas.pickProjectTerminal',
          'Pick a project in the left bar and a terminal opens here.'
        )}
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      {/* El hueco donde aterriza la pane porteada. Sin alto propio no hay dónde aterrizar: el
          `fit` de xterm mide este rectángulo. Los `data-` de abajo no son decoración: son lo que
          deja ver, desde el DOM, por qué una ventana no reclamó su pane (sin pestaña todavía, sin
          leaf en el layout, o lejos). */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: enElPlano.width, height: enElPlano.height, transform: `scale(${zoom})` }}
      >
        <div
          ref={hueco}
          className="absolute inset-0 min-h-0 min-w-0"
          data-lienzo-terminal={tabId ?? 'sin-pestaña'}
          data-lienzo-leaf={leafId ?? 'sin-leaf'}
          data-lienzo-detalle={detalle}
        />
      </div>
      {!tabId && (
        <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
          {translate('canvas.terminalOpening', 'Opening the terminal…')}
        </div>
      )}
      {detalle !== 'live' && (
        <div className="absolute inset-0 grid place-items-center bg-muted/20 text-center text-muted-foreground">
          <span style={{ fontSize: Math.max(10, 13 * zoom) }}>{titulo}</span>
        </div>
      )}
    </div>
  )
}
