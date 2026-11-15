import { useRef, useState } from 'react'
import { GripHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import {
  moverVentana,
  POSICION_INICIAL,
  type LimitesDelPanel,
  type PosicionDeVentana
} from './arrastre-de-ventana'
import { useAppStore } from '@/store'
import { delegarEnTrabajos, irAlTrabajo, type TrabajoDelegado } from './delegar-en-trabajos'
import { useDelegacionAutomatica } from './use-delegacion-automatica'
import { firmaDeLaPropuesta } from './propuesta-de-delegacion'
import { usePropuestaDeDelegacion } from './use-propuesta-de-delegacion'

/** Lo que la ventana necesita del chat para proponer; sin worktree no hay dónde abrir los trabajos. */
export type DatosDeDelegacion = {
  readonly messages: readonly NativeChatMessage[]
  readonly trabajando: boolean
  readonly worktreeId: string | null
}

function limitesDe(ventana: HTMLElement | null): LimitesDelPanel | null {
  const panel = ventana?.offsetParent
  if (!ventana || !(panel instanceof HTMLElement)) {
    return null
  }
  return {
    ancho: panel.clientWidth,
    alto: panel.clientHeight,
    anchoVentana: ventana.offsetWidth,
    altoVentana: ventana.offsetHeight
  }
}

/** El gesto: la cabecera agarra la ventana y la suelta donde la dejaste, sin salirse del panel. */
function useArrastreDeVentana(): {
  posicion: PosicionDeVentana
  ventanaRef: React.RefObject<HTMLDivElement | null>
  agarre: React.HTMLAttributes<HTMLElement>
} {
  const [posicion, setPosicion] = useState<PosicionDeVentana>(POSICION_INICIAL)
  const ventanaRef = useRef<HTMLDivElement | null>(null)
  const anterior = useRef<{ x: number; y: number } | null>(null)
  const limites = useRef<LimitesDelPanel | null>(null)
  const capturado = useRef<{ elemento: HTMLElement; puntero: number } | null>(null)

  const terminar = (): void => {
    const captura = capturado.current
    if (captura?.elemento.hasPointerCapture(captura.puntero)) {
      captura.elemento.releasePointerCapture(captura.puntero)
    }
    capturado.current = null
    anterior.current = null
    limites.current = null
  }

  return {
    posicion,
    ventanaRef,
    agarre: {
      onPointerDown: (event) => {
        if (event.button !== 0) {
          return
        }
        // Se miden al agarrar: el panel se parte y la ventana crece con las filas que tenga.
        limites.current = limitesDe(ventanaRef.current)
        anterior.current = { x: event.screenX, y: event.screenY }
        capturado.current = { elemento: event.currentTarget, puntero: event.pointerId }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event) => {
        const previo = anterior.current
        const dentro = limites.current
        if (!previo || !dentro) {
          return
        }
        const delta = { x: event.screenX - previo.x, y: event.screenY - previo.y }
        anterior.current = { x: event.screenX, y: event.screenY }
        event.preventDefault()
        setPosicion((actual) => moverVentana(actual, delta, dentro))
      },
      onPointerUp: terminar,
      onPointerCancel: terminar,
      onLostPointerCapture: terminar
    }
  }
}

const FILA =
  'flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-foreground/[0.05]'

/**
 * La ventana flotante que, cuando el líder termina de pensar, propone delegar cada parte del plan en
 * un compañero: se eligen las que van, y cada una se abre como un trabajo del proyecto al que se
 * entra con su botón.
 *
 * Flota sobre la conversación y no la corta: el plan se sigue leyendo debajo mientras decidís. Se
 * mueve de la cabecera, porque anclada abajo a la derecha tapa el compositor de un panel angosto.
 */
export function VentanaDeDelegacion({
  agente,
  messages,
  trabajando,
  worktreeId
}: DatosDeDelegacion & { readonly agente: AgentType }): React.JSX.Element | null {
  const { propuesta, descartar } = usePropuestaDeDelegacion(messages, { trabajando })
  const [eleccion, setEleccion] = useState<{ firma: string; ids: ReadonlySet<string> } | null>(null)
  const [creados, setCreados] = useState<{
    firma: string
    trabajos: readonly TrabajoDelegado[]
  } | null>(null)
  const { posicion, ventanaRef, agarre } = useArrastreDeVentana()
  const delegacionAutomatica = useAppStore((state) => state.settings?.autoDelegation === true)
  // Antes del retorno temprano: un hook no puede quedar atrás de un `return`, y además así la
  // delegación automática sigue andando aunque la ventana todavía no tenga nada que dibujar.
  useDelegacionAutomatica({
    prendida: delegacionAutomatica,
    propuesta,
    agente,
    worktreeId,
    alDelegar: (firma, trabajos) => setCreados({ firma, trabajos })
  })

  // Con Intelligent Orchestration apagado no se propone nada: hasta el 09/11/2026 la ventana
  // saltaba igual y sólo el reparto automático dependía del interruptor, así que apagarlo no
  // sacaba de encima lo único que se ve (Nico: «me saltan modelos y no sé qué»).
  if (!delegacionAutomatica || !propuesta || worktreeId === null || !isTuiAgent(agente)) {
    return null
  }
  const firma = firmaDeLaPropuesta(propuesta)
  // Sin tocar nada van todas: el plan ya es lo que el líder decidió hacer.
  const elegidas =
    eleccion?.firma === firma ? eleccion.ids : new Set(propuesta.tareas.map((tarea) => tarea.id))
  const trabajos = creados?.firma === firma ? creados.trabajos : []
  const aDelegar = propuesta.tareas.filter((tarea) => elegidas.has(tarea.id))

  const alternar = (id: string): void => {
    const siguientes = new Set(elegidas)
    if (siguientes.has(id)) {
      siguientes.delete(id)
    } else {
      siguientes.add(id)
    }
    setEleccion({ firma, ids: siguientes })
  }

  const delegar = (): void => {
    setCreados({ firma, trabajos: delegarEnTrabajos({ agente, worktreeId, tareas: aDelegar }) })
  }

  return (
    <div
      ref={ventanaRef}
      role="group"
      aria-label={translate(
        'components.dolphin.chat.delegacion.titulo',
        'Hand out the parts of the plan'
      )}
      style={{ right: posicion.derecha, bottom: posicion.abajo }}
      className="absolute z-20 flex w-[min(22rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
    >
      <header
        {...agarre}
        className="flex cursor-grab touch-none items-center gap-2 px-3 py-2 active:cursor-grabbing"
      >
        <GripHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <AgentIcon agent={agente} size={13} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {trabajos.length > 0
            ? translate('components.dolphin.chat.delegacion.abiertos', 'Open jobs')
            : translate(
                'components.dolphin.chat.delegacion.titulo',
                'Hand out the parts of the plan'
              )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          aria-label={translate('components.dolphin.chat.delegacion.cerrar', 'Close')}
          onClick={descartar}
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      {trabajos.length > 0 ? (
        <ul className="scrollbar-sleek flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5">
          {trabajos.map((trabajo) => (
            <li key={trabajo.tareaId} className={FILA}>
              <span className="min-w-0 flex-1 text-[13px] leading-snug">{trabajo.titulo}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-xs"
                onClick={() => irAlTrabajo(worktreeId, trabajo.tabId)}
              >
                {translate('components.dolphin.chat.delegacion.ir', 'Go')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="px-3 pb-2 text-xs leading-relaxed text-muted-foreground">
            {translate(
              'components.dolphin.chat.delegacion.ayuda',
              'Each part opens as a job in this project, on the same engine.'
            )}
          </p>
          <ul className="scrollbar-sleek flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1.5">
            {propuesta.tareas.map((tarea) => (
              <li key={tarea.id}>
                <label className={cn(FILA, 'w-full cursor-pointer')}>
                  <Checkbox
                    className="mt-0.5"
                    checked={elegidas.has(tarea.id)}
                    onCheckedChange={() => alternar(tarea.id)}
                  />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">{tarea.titulo}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-1.5 px-3 py-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={descartar}>
              {translate('components.dolphin.chat.delegacion.no', 'No thanks')}
            </Button>
            <Button type="button" size="sm" disabled={aDelegar.length === 0} onClick={delegar}>
              {translate('components.dolphin.chat.delegacion.delegar', 'Hand it to {{value0}}', {
                value0: String(aDelegar.length)
              })}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
