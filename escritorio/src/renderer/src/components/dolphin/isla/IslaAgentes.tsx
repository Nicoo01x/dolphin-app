import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Reply, X } from 'lucide-react'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { cn } from '@/lib/class-names'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { translate } from '@/i18n/i18n'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import {
  LARGO_MAXIMO_DESDE_ISLA,
  type ResultadoDeEscritura
} from '../../../../../shared/dolphin-isla-types'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { countOrchestrationTasks } from '../../../../../shared/orchestration-dashboard'
import { AvisoDeIsla, BOTON_REDONDO, Punto, detalleDe, estadoDe, irAlAgente } from './isla-piezas'

type Envio = { estado: 'escribiendo' | 'mandando' } | ResultadoDeEscritura

function mensajeDe(envio: Envio, destino: string): string {
  if (!('ok' in envio)) {
    return ''
  }
  if (envio.ok) {
    return translate('auto.components.dolphin.isla.sent', 'Sent to {{value0}}', { value0: destino })
  }
  if (envio.motivo === 'aprobacion') {
    return translate(
      'auto.components.dolphin.isla.notSentPrompt',
      'It is waiting for you to approve or choose something: answer it in the app.'
    )
  }
  if (envio.motivo === 'no-esta') {
    return translate(
      'auto.components.dolphin.isla.notSent',
      "Couldn't send it: that agent is no longer on the board."
    )
  }
  if (envio.motivo === 'sin-confirmar') {
    return translate(
      'auto.components.dolphin.isla.notConfirmed',
      'It may have arrived, but nobody confirmed it: check the chat before sending it again.'
    )
  }
  return translate(
    'auto.components.dolphin.isla.notDelivered',
    "It didn't get through: the terminal didn't take it. Try again."
  )
}

/**
 * Escribirle al agente sin ir a la app: lo tipea la ventana principal, como el chat, y dice si la
 * terminal lo aceptó. Queda abierta para seguir escribiendo: se cierra con Esc o con la cruz.
 */
function Respuesta({
  card,
  onCerrar
}: {
  card: DashboardCard
  onCerrar: () => void
}): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const [envio, setEnvio] = useState<Envio>({ estado: 'escribiendo' })
  const mandando = 'estado' in envio && envio.estado === 'mandando'
  const destino = card.worktreeName
  // Si mientras escribís pasa a esperar una aprobación, no se manda (la respuesta la contestaría):
  // el texto queda y se dice por qué.
  const espera = card.bucket === 'attention'
  const visible: Envio = espera && !mandando ? { ok: false, motivo: 'aprobacion' } : envio

  const mandar = async (): Promise<void> => {
    if (!texto.trim() || mandando || espera) {
      return
    }
    if (!card.ptyId) {
      setEnvio({ ok: false, motivo: 'no-esta' })
      return
    }
    setEnvio({ estado: 'mandando' })
    const enviado = texto
    const resultado: ResultadoDeEscritura = (await window.api.dolphin.escribirDesdeIsla?.({
      paneKey: card.paneKey,
      ptyId: card.ptyId,
      texto: enviado
    })) ?? { ok: false, motivo: 'no-llego' }
    if (resultado.ok) {
      // Se saca lo mandado y queda lo que se siguió escribiendo mientras viajaba; si se editó lo
      // mandado, no se adivina: queda todo.
      setTexto((actual) =>
        actual.startsWith(enviado) ? actual.slice(enviado.length).trimStart() : actual
      )
    }
    setEnvio(resultado)
  }

  const etiqueta = translate('auto.components.dolphin.isla.writeTo', 'Write to {{value0}}…', {
    value0: destino
  })
  const fallo = 'ok' in visible && !visible.ok
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void mandar()
      }}
      className="mx-2 mt-0.5 mb-2"
    >
      <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] py-1 pr-1 pl-3 transition-colors duration-150 ease-out focus-within:bg-white/[0.09]">
        <input
          autoFocus
          value={texto}
          maxLength={LARGO_MAXIMO_DESDE_ISLA}
          onChange={(event) => {
            setTexto(event.target.value)
            if (!mandando) {
              setEnvio({ estado: 'escribiendo' })
            }
          }}
          onKeyDown={(event) => {
            // Esc cierra la respuesta y nada más: la isla sigue abierta.
            if (event.key === 'Escape') {
              event.stopPropagation()
              onCerrar()
            }
          }}
          placeholder={etiqueta}
          aria-label={etiqueta}
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-white outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={!texto.trim() || mandando || espera}
          aria-label={translate('auto.components.dolphin.isla.send', 'Send')}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-black transition-[transform,opacity] duration-150 ease-out active:scale-[.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:opacity-30"
        >
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={translate('auto.components.dolphin.isla.closeReply', 'Close the reply')}
          className={cn(BOTON_REDONDO, 'size-7')}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p
        role="status"
        className={cn(
          'px-3 pt-1 text-xs',
          fallo ? 'text-rose-300' : 'text-white/50',
          !('ok' in visible) && 'sr-only'
        )}
      >
        {mensajeDe(visible, destino)}
      </p>
    </form>
  )
}

/** Se le puede responder a un agente con terminal que no está esperando una aprobación. */
const sePuedeResponder = (card: DashboardCard): boolean =>
  Boolean(card.ptyId) && card.bucket !== 'attention'

/** Abrir desde afuera la respuesta a un agente: el «Responder» de un aviso. `vez` lo hace nuevo. */
export type PedidoDeRespuesta = { paneKey: string; vez: number }

/**
 * Los agentes, primero el que te espera; cada fila lleva a su agente, y a uno que trabaja o terminó
 * se le puede responder desde acá. Al que espera una aprobación no: la respuesta la contestaría, así
 * que su fila lleva a la app.
 */
export function IslaAgentes({
  lista,
  onIr,
  responderA = null,
  onPedidoAtendido
}: {
  lista: readonly DashboardCard[]
  onIr: () => void
  responderA?: PedidoDeRespuesta | null
  /** Ya se abrió la respuesta pedida: quien la pidió la suelta. */
  onPedidoAtendido?: () => void
}): React.JSX.Element {
  // Mientras se responde, el orden queda quieto: mover la fila le saca el foco al campo. Las que se
  // van salen, salvo la que se está respondiendo (con el texto adentro); las nuevas van al final.
  const [respuesta, setRespuesta] = useState<{ card: DashboardCard; orden: string[] } | null>(null)
  const [pedidoAtendido, setPedidoAtendido] = useState<number | null>(null)
  const [orquestacion, setOrquestacion] = useState<{
    running: number
    waiting: number
    done: number
    failed: number
  } | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = async (): Promise<void> => {
      const tablero = await window.api.dolphin
        .orquestacionTablero()
        .catch(() => ({ disponible: false as const }))
      if (vivo) {
        if (!tablero.disponible) {
          setOrquestacion(null)
          return
        }
        const runs = tablero.runs.filter(
          (run) =>
            run.gates.length > 0 ||
            run.tasks.some((task) => !['completed', 'failed'].includes(task.status))
        )
        if (!runs.length) {
          setOrquestacion(null)
          return
        }
        const cuentas = countOrchestrationTasks(runs.flatMap((run) => run.tasks))
        // Un gate pendiente también te espera a vos.
        setOrquestacion({
          ...cuentas,
          waiting: cuentas.waiting + runs.flatMap((run) => run.gates).length
        })
      }
    }
    // Why: la orquestación no avisa cuando cambia; con la isla oculta no se lee, y al volver se lee ya.
    const desinstalar = installWindowVisibilityInterval({
      run: () => void leer(),
      intervalMs: 2000
    })
    return () => {
      vivo = false
      desinstalar()
    }
  }, [])
  // Un pedido nuevo de responder (desde un aviso) abre la respuesta de ese agente, una sola vez.
  if (responderA && responderA.vez !== pedidoAtendido) {
    setPedidoAtendido(responderA.vez)
    const card = lista.find((fila) => fila.paneKey === responderA.paneKey)
    if (card && sePuedeResponder(card)) {
      setRespuesta({ card, orden: lista.map((fila) => fila.paneKey) })
    }
  }
  // El pedido se usa una sola vez: si la lista se vuelve a montar (otra pestaña, «Armar»), no
  // reabre una respuesta que ya cerraste.
  useEffect(() => {
    if (responderA) {
      onPedidoAtendido?.()
    }
  }, [responderA, onPedidoAtendido])
  const filas = useMemo(() => {
    if (!respuesta) {
      return lista
    }
    const actuales = new Map(lista.map((card) => [card.paneKey, card]))
    const quietas = respuesta.orden.flatMap((paneKey) => {
      const card = actuales.get(paneKey)
      if (card) {
        return [card]
      }
      return paneKey === respuesta.card.paneKey ? [respuesta.card] : []
    })
    const nuevas = lista.filter((card) => !respuesta.orden.includes(card.paneKey))
    return [...quietas, ...nuevas]
  }, [lista, respuesta])

  // Al cerrar la respuesta, el foco vuelve a su fila (al botón de responder, o a la fila si ya no
  // se le puede responder): con el teclado, si no, caía en la nada.
  const listaRef = useRef<HTMLUListElement>(null)
  const volverA = useRef<string | null>(null)
  useLayoutEffect(() => {
    const paneKey = volverA.current
    if (respuesta || paneKey === null) {
      return
    }
    volverA.current = null
    const con = (atributo: 'responder' | 'fila'): HTMLElement | undefined =>
      [...(listaRef.current?.querySelectorAll<HTMLElement>(`[data-${atributo}]`) ?? [])].find(
        (elemento) => elemento.dataset[atributo] === paneKey
      )
    ;(con('responder') ?? con('fila'))?.focus()
  }, [respuesta])
  const cerrar = (paneKey: string): void => {
    volverA.current = paneKey
    setRespuesta(null)
  }

  if (filas.length === 0) {
    return (
      <AvisoDeIsla>
        {translate(
          'auto.components.dolphin.isla.emptyOpen',
          'When an agent starts working it shows up here.'
        )}
      </AvisoDeIsla>
    )
  }
  return (
    <div>
      {orquestacion ? (
        <button
          type="button"
          onClick={() => void window.api.dolphin.orquestacionAbrir()}
          className="mb-1.5 flex w-full items-center rounded-xl bg-white/[0.06] px-3 py-2 text-left text-xs text-white/70 active:scale-[.99]"
        >
          <span className="size-2 rounded-full bg-sky-400" />{' '}
          <span className="ml-2">
            {translate('auto.components.dolphin.isla.orchestration', 'Orchestration')}
            {(['running', 'waiting', 'done', 'failed'] as const).map((bucket) => {
              const count = orquestacion[bucket]
              if (count === 0) {
                return null
              }
              const label =
                bucket === 'running'
                  ? translate('auto.components.orchestration.running', 'running')
                  : bucket === 'waiting'
                    ? translate('auto.components.orchestration.waiting', 'waiting')
                    : bucket === 'done'
                      ? translate('auto.components.orchestration.done', 'done')
                      : translate('auto.components.orchestration.failed', 'failed')
              return (
                <span key={bucket}>
                  {' '}
                  · {count} {label}
                </span>
              )
            })}
          </span>
        </button>
      ) : null}
      <ul ref={listaRef} className="space-y-0.5">
        {filas.map((card) => {
          const respondiendo = respuesta?.card.paneKey === card.paneKey
          const nombre = card.worktreeName
          return (
            <li key={card.paneKey}>
              <div
                className={cn(
                  'flex items-center rounded-2xl transition-colors duration-150 ease-out hover:bg-white/[0.07]',
                  respondiendo && 'bg-white/[0.05]'
                )}
              >
                <button
                  type="button"
                  data-fila={card.paneKey}
                  onClick={() => {
                    irAlAgente(card)
                    onIr()
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  <Punto bucket={card.bucket} />
                  <AgentIcon agent={isTuiAgent(card.agentType) ? card.agentType : null} size={14} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {nombre}
                      <span className="font-normal text-white/50"> · {estadoDe(card)}</span>
                    </span>
                    <span className="block truncate text-xs text-white/55">{detalleDe(card)}</span>
                  </span>
                </button>
                {sePuedeResponder(card) && !respondiendo ? (
                  <button
                    type="button"
                    data-responder={card.paneKey}
                    aria-label={translate(
                      'auto.components.dolphin.isla.reply',
                      'Reply to {{value0}}',
                      { value0: nombre }
                    )}
                    title={translate('auto.components.dolphin.isla.reply', 'Reply to {{value0}}', {
                      value0: nombre
                    })}
                    onClick={() => setRespuesta({ card, orden: filas.map((fila) => fila.paneKey) })}
                    className={cn(BOTON_REDONDO, 'mr-1.5')}
                  >
                    <Reply className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {respondiendo ? (
                <Respuesta card={card} onCerrar={() => cerrar(card.paneKey)} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
