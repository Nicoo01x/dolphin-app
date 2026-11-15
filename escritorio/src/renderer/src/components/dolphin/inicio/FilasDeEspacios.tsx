import { translate } from '@/i18n/i18n'
import { uiDateTimeFormat } from '@/i18n/ui-intl-formatters'
import { cn } from '@/lib/class-names'
import { getWorktreeStatusLabel } from '@/lib/workspace/activity/worktree-status'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import StatusIndicator from '@/components/sidebar/workspace-card/surface/StatusIndicator'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import { inicioDelDia, type EspacioConEstado } from './estado-del-inicio'

// Constantes de módulo: los formateadores de la UI se cachean por identidad de las opciones.
const HORA: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
const DIA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

/** Cuántas filas se ven por sección: el inicio es un vistazo, la lista entera está en la barra. */
const FILAS_A_LA_VISTA = 6

export const ANILLO_DE_FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * El encabezado de cada sección del inicio (Te necesita, Tablero, Hoy): Satoshi, el mismo tamaño y
 * el mismo peso, a la misma distancia de lo suyo (gap-3). Es lo que da el ritmo de la pantalla.
 */
export const TITULO_DE_SECCION =
  'flex min-w-0 items-baseline gap-2 font-display text-[15px] font-semibold leading-5'

/** «Para revisar» y no «Listo»: acá lo que importa de un agente que terminó es que te espera. */
function etiquetaDelEstado(estado: WorktreeStatus): string {
  return estado === 'done'
    ? translate('auto.components.dolphin.inicio.readyToReview', 'Ready to review')
    : getWorktreeStatusLabel(estado)
}

function cuando(epoch: number, ahora: number): string {
  if (!epoch) {
    return ''
  }
  return uiDateTimeFormat(epoch >= inicioDelDia(ahora) ? HORA : DIA).format(new Date(epoch))
}

function FilaDeEspacio({
  item,
  ahora
}: {
  item: EspacioConEstado
  ahora: number
}): React.JSX.Element {
  const { espacio, estado } = item
  const detalle = [espacio.proyecto, estado === 'inactive' ? null : etiquetaDelEstado(estado)]
    .filter(Boolean)
    .join(' · ')
  return (
    <li>
      <button
        type="button"
        onClick={() => activateAndRevealWorktree(espacio.id, { sidebarRevealBehavior: 'auto' })}
        className={cn(
          // Sin fondo en reposo: la fila es texto sobre el lienzo y sólo el hover la vuelve
          // superficie (radio 8, el de las filas).
          'flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left',
          'transition-[background-color,transform] duration-100 ease-out',
          'hover:bg-accent active:scale-[0.99]',
          ANILLO_DE_FOCO
        )}
      >
        <StatusIndicator status={estado} showTooltip={false} aria-hidden="true" />
        <span className="min-w-0 shrink truncate text-[13px]" title={espacio.nombre}>
          {espacio.nombre}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={detalle}>
          {detalle}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {cuando(espacio.ultimaActividad, ahora)}
        </span>
      </button>
    </li>
  )
}

/**
 * Una lista corta de espacios con su punto de estado, para «te necesita» y «hoy». Tocar una fila
 * abre ese espacio, igual que en la barra lateral. Sin filas no dibuja nada: una sección vacía con
 * su título sería otra cosa que leer para nada.
 */
export function SeccionDeEspacios({
  id,
  titulo,
  items,
  ahora,
  className,
  filas = FILAS_A_LA_VISTA
}: {
  id: string
  titulo: string
  items: readonly EspacioConEstado[]
  ahora: number
  className?: string
  /** Cuántas filas se ven; el resto se cuenta. */
  filas?: number
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  const resto = items.length - filas
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 id={id} className={TITULO_DE_SECCION}>
        {titulo}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </h2>
      <ul className="-mx-2 flex flex-col">
        {items.slice(0, filas).map((item) => (
          <FilaDeEspacio key={item.espacio.id} item={item} ahora={ahora} />
        ))}
      </ul>
      {resto > 0 ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          {translate(
            'auto.components.dolphin.inicio.moreInSidebar',
            '{{value0}} more in the sidebar',
            {
              value0: resto
            }
          )}
        </p>
      ) : null}
    </section>
  )
}
