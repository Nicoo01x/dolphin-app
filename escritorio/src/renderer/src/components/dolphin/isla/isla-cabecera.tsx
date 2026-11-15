import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { translate } from '@/i18n/i18n'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { DolphinMark } from '../DolphinMark'
import { Punto, estadoDe } from './isla-piezas'
import type { ResumenIsla } from './resumen-isla'

type GestosDeIsla = Pick<
  React.HTMLAttributes<HTMLElement>,
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onClickCapture'
  | 'onLostPointerCapture'
>

function Contador({
  bucket,
  cuantos,
  etiqueta
}: {
  bucket: DashboardCard['bucket']
  cuantos: number
  etiqueta: string
}): React.JSX.Element | null {
  if (cuantos === 0) {
    return null
  }
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={etiqueta}>
      <Punto bucket={bucket} />
      <span aria-hidden="true">{cuantos}</span>
      <span className="sr-only">{etiqueta}</span>
    </span>
  )
}

/**
 * La línea de la isla: el delfín, lo que más importa ahora (el agente que te espera, o el que
 * trabaja) y cuántos hay en cada estado. Compacta, abre la isla; abierta, la cierra.
 */
export function CabeceraIsla({
  resumen,
  abierta,
  onAlternar,
  ...gestos
}: {
  resumen: ResumenIsla
  abierta: boolean
  onAlternar: () => void
} & GestosDeIsla): React.JSX.Element {
  const destacado = resumen.destacado
  return (
    <button
      type="button"
      aria-expanded={abierta}
      onClick={onAlternar}
      {...gestos}
      className="flex h-11 w-full items-center gap-2.5 rounded-[22px] px-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white/50"
    >
      <DolphinMark className="h-3.5 w-4 shrink-0 text-white" />
      {destacado ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
          <AgentIcon
            agent={isTuiAgent(destacado.agentType) ? destacado.agentType : null}
            size={13}
          />
          <span className="shrink-0 font-semibold">{estadoDe(destacado)}</span>
          <span className="truncate text-white/60">{destacado.worktreeName}</span>
        </span>
      ) : (
        <span className="flex-1 truncate text-[13px] text-white/60">
          {translate('auto.components.dolphin.isla.empty', 'No agents running')}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-3 text-xs text-white/80">
        <Contador
          bucket="attention"
          cuantos={resumen.esperan}
          etiqueta={translate('auto.components.dolphin.isla.waitingCount', '{{value0}} need you', {
            value0: String(resumen.esperan)
          })}
        />
        <Contador
          bucket="working"
          cuantos={resumen.trabajan}
          etiqueta={translate('auto.components.dolphin.isla.workingCount', '{{value0}} working', {
            value0: String(resumen.trabajan)
          })}
        />
        <Contador
          bucket="done"
          cuantos={resumen.listos}
          etiqueta={translate('auto.components.dolphin.isla.doneCount', '{{value0}} done', {
            value0: String(resumen.listos)
          })}
        />
      </span>
    </button>
  )
}
