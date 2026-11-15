import { GitMerge, X } from 'lucide-react'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import type { Aviso } from './avisos-isla'
import { BOTON_REDONDO, detalleDeAviso, tituloDeAviso } from './isla-piezas'

const BOTON =
  'inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold transition-[transform,background-color] duration-150 ease-out active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60'

/**
 * Un aviso de la isla, como una actividad de la Dynamic Island: qué pasó, con quién, lo último que
 * dijo, y qué podés hacer. «Responder» solo a uno que terminó: a uno que espera una aprobación se le
 * contesta en la app (un Enter desde acá elegiría la primera opción). Y solo si la sección Agentes
 * está a la vista, que es donde se responde. Lo lee el lector de pantalla desde la isla (una región
 * que ya existe): esta capa nace o se prende con el texto adentro y ahí no se anunciaría.
 */
export function IslaAviso({
  aviso,
  cuantosMas,
  puedeResponder,
  onAbrir,
  onResponder,
  onDescartar
}: {
  aviso: Aviso
  cuantosMas: number
  puedeResponder: boolean
  onAbrir: () => void
  onResponder: () => void
  onDescartar: () => void
}): React.JSX.Element {
  const titulo = tituloDeAviso(aviso)
  const detalle = detalleDeAviso(aviso)
  return (
    <div className="flex items-start gap-3 py-3 pr-3 pl-4">
      <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08]">
        {aviso.tipo === 'choque' ? (
          <GitMerge className="size-4" aria-hidden="true" />
        ) : (
          <AgentIcon
            agent={isTuiAgent(aviso.card.agentType) ? aviso.card.agentType : null}
            size={15}
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[#0b0b0b]',
            aviso.tipo === 'termino' ? 'bg-emerald-400' : 'bg-amber-400'
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[13px] leading-tight font-semibold">
          <span className="truncate">{titulo}</span>
          {cuantosMas > 0 ? (
            <span className="shrink-0 text-xs font-normal text-white/45">+{cuantosMas}</span>
          ) : null}
        </p>
        {detalle ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">{detalle}</p>
        ) : null}
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={onAbrir} className={cn(BOTON, 'bg-white text-black')}>
            {aviso.tipo === 'choque'
              ? translate('auto.components.dolphin.isla.noticeViewConflict', 'View')
              : translate('auto.components.dolphin.isla.noticeOpen', 'Open')}
          </button>
          {puedeResponder && aviso.tipo === 'termino' && aviso.card.ptyId ? (
            <button
              type="button"
              onClick={onResponder}
              className={cn(BOTON, 'bg-white/10 text-white hover:bg-white/[0.16]')}
            >
              {translate('auto.components.dolphin.isla.noticeReply', 'Reply')}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onDescartar}
        aria-label={translate('auto.components.dolphin.isla.noticeDismiss', 'Dismiss')}
        title={translate('auto.components.dolphin.isla.noticeDismiss', 'Dismiss')}
        className={cn(BOTON_REDONDO, 'size-7')}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
