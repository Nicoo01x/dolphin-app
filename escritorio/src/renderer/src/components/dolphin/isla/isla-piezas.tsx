import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { parseInteractivePrompt } from '../../../../../shared/native-chat/input/native-chat-interactive-prompt'
import { formatAgentTypeLabel } from '../../../../../shared/agent-status/presentation/agent-type-label'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { Aviso } from './avisos-isla'
import type { SeccionDeIsla } from './secciones-isla'

/** Qué pasó, con quién: lo que dice un aviso arriba de todo (y lo que lee el lector de pantalla). */
export function tituloDeAviso(aviso: Aviso): string {
  if (aviso.tipo === 'choque') {
    return translate(
      'auto.components.dolphin.isla.noticeConflict',
      '{{value0}} and {{value1}} will conflict in {{value2}} files',
      {
        value0: aviso.choque.a,
        value1: aviso.choque.b,
        value2: String(aviso.choque.archivos.length)
      }
    )
  }
  if (aviso.tipo === 'bucle') {
    return translate(
      'auto.components.dolphin.isla.noticeLoopTitle',
      '{{value0}} in {{value1}} looks stuck',
      {
        value0: formatAgentTypeLabel(aviso.card.agentType),
        value1: aviso.card.worktreeName
      }
    )
  }
  return aviso.tipo === 'termino'
    ? translate('auto.components.dolphin.isla.noticeFinished', '{{value0}} finished', {
        value0: aviso.card.worktreeName
      })
    : translate('auto.components.dolphin.isla.noticeNeedsYou', '{{value0}} needs you', {
        value0: aviso.card.worktreeName
      })
}

/**
 * Lo que va debajo del nombre de un agente. Del que te necesita, lo que pregunta (o qué pide
 * permiso para hacer), leído como lo lee el chat: el tablero lo trae crudo, en JSON.
 */
export function detalleDe(card: DashboardCard): string {
  const pedido = parseInteractivePrompt(card.askSummary)
  if (pedido?.kind === 'question') {
    return pedido.prompt.questions.map((pregunta) => pregunta.question).join(' · ')
  }
  if (pedido?.kind === 'approval') {
    const { title, detail } = pedido.approval
    return detail ? `${title} ${detail}` : title
  }
  return card.lastAgentMessage || card.task
}

export function detalleDeAviso(aviso: Aviso): string {
  if (aviso.tipo === 'choque') {
    return aviso.choque.archivos.join(' · ')
  }
  if (aviso.tipo === 'bucle') {
    return translate(
      'auto.components.dolphin.isla.noticeLoopDetail',
      'repeated {{value0}} times: {{value1}}',
      { value0: String(aviso.bucle.repeticiones), value1: aviso.bucle.herramienta }
    )
  }
  return detalleDe(aviso.card)
}

export function estadoDe(card: DashboardCard): string {
  if (card.bucket === 'attention') {
    return translate('auto.components.dolphin.isla.needsYou', 'needs you')
  }
  if (card.bucket === 'working') {
    return translate('auto.components.dolphin.isla.working', 'working')
  }
  return translate('auto.components.dolphin.isla.done', 'done')
}

export function nombreDeSeccion(seccion: SeccionDeIsla): string {
  if (seccion === 'agentes') {
    return translate('auto.components.dolphin.isla.sectionAgents', 'Agents')
  }
  if (seccion === 'bandeja') {
    return translate('auto.components.dolphin.isla.sectionInbox', 'Inbox')
  }
  if (seccion === 'estudio') {
    return translate('auto.components.dolphin.isla.sectionStudio', 'Studio')
  }
  return translate('auto.components.dolphin.isla.sectionNotes', 'Notes')
}

export function Punto({ bucket }: { bucket: DashboardCard['bucket'] }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        bucket === 'attention' && 'bg-amber-400',
        bucket === 'working' && 'animate-pulse bg-white motion-reduce:animate-none',
        bucket === 'done' && 'bg-emerald-400',
        bucket === 'idle' && 'bg-white/30'
      )}
    />
  )
}

export function irAlAgente(card: DashboardCard): void {
  void window.api.dashboard.revealAgent?.({
    repoId: card.repoId,
    worktreeId: card.worktreeId,
    tabId: card.tabId,
    leafId: card.leafId,
    ...(card.executionHostId ? { executionHostId: card.executionHostId } : {})
  })
}

/** El aviso de una lista vacía o que todavía carga, con el mismo aire que una fila. */
export function AvisoDeIsla({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-3 py-4 text-[13px] leading-relaxed text-white/60">{children}</p>
}

/** Botón redondo chico de la isla: tono que sube al pasar y se hunde al apretar. */
export const BOTON_REDONDO =
  'grid size-8 shrink-0 place-items-center rounded-full text-white/60 transition-[transform,background-color,color] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[.94] focus-visible:outline-2 focus-visible:outline-white/60 disabled:pointer-events-none disabled:opacity-30'
