import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import StatusIndicator from '@/components/sidebar/workspace-card/surface/StatusIndicator'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import { sePuedeEmpezar, type TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import { FASES_DE_EJEMPLO } from './ciclo-de-ejemplo'
import { TiraDelPorton } from './TiraDelPorton'

/** En qué anda el espacio de trabajo que tiene la tarjeta: el punto y su nombre. */
export type EstadoDeTarjeta = { estado: WorktreeStatus; etiqueta: string }

/** Lo que hace falta para mover una tarjeta: el arrastre con el puntero y el teclado. */
export type Movimiento = {
  alApretar: (evento: React.PointerEvent<HTMLElement>, tarjeta: TarjetaDelTablero) => void
  alHacerClic: (evento: React.MouseEvent) => void
  conTeclado: (tarjeta: TarjetaDelTablero, paso: -1 | 1) => void
}

/** La tarjeta de ejemplo: cuántas fases de su portón ya corrieron y si está a la vista. */
export type Ejemplo = { id: string; llenas: number; visible: boolean }

// El anillo de foco en tinta entera (3:1 sobre los tres tonos), no al 50 %: tiene que verse.
const ANILLO_DE_FOCO =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0'

// La tarjeta es la única superficie del tablero: un tono sobre el lienzo (el del panel), radio 12.
// En hover sube un tono más hacia la tinta. Mezcla y no velo: un velo transparente dejaría ver la
// zona de destino de abajo durante un arrastre.
const TARJETA = 'block w-full rounded-xl bg-card px-3 py-2 text-left'
const TOCABLE =
  'transition-[background-color,transform] duration-100 ease-out hover:bg-[color-mix(in_srgb,var(--card)_94%,var(--foreground))] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100'

function Contenido({
  tarjeta,
  estado,
  ejemplo
}: {
  tarjeta: TarjetaDelTablero
  estado?: EstadoDeTarjeta
  ejemplo?: Ejemplo
}): React.JSX.Element {
  // Quién la tiene y en qué anda; sin un espacio que la trabaje, la rama dice dónde va a caer.
  const detalle = [tarjeta.quien, estado?.etiqueta ?? tarjeta.rama].filter(Boolean).join(' · ')
  const fases = ejemplo ? FASES_DE_EJEMPLO : tarjeta.porton
  return (
    <>
      {ejemplo ? (
        <span className="mb-0.5 block text-[11px] leading-4 text-muted-foreground">
          {translate('auto.components.dolphin.tablero.example', 'Example')}
        </span>
      ) : null}
      <span className="line-clamp-2 break-words text-[13px] leading-[18px]" title={tarjeta.titulo}>
        {tarjeta.titulo}
      </span>
      {detalle || estado ? (
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {estado ? (
            <StatusIndicator status={estado.estado} showTooltip={false} aria-hidden="true" />
          ) : null}
          <span className="min-w-0 truncate" title={detalle}>
            {detalle}
          </span>
        </span>
      ) : null}
      {/* La tira sólo cuando hay rama: sin rama no cruzó nada todavía. */}
      {fases && tarjeta.rama ? (
        <TiraDelPorton fases={fases} llenas={ejemplo?.llenas} crece={!ejemplo} />
      ) : null}
    </>
  )
}

/**
 * Una tarjeta del tablero. Se puede tocar (Ideas y Para hacer van al prompt), arrastrar a otra
 * columna y mover con Alt+flecha. La de ejemplo es sólo para mirar.
 */
export function PiezaDeTarjeta({
  tarjeta,
  estado,
  onElegir,
  movimiento,
  arrastrando = false,
  guardando = false,
  ejemplo
}: {
  tarjeta: TarjetaDelTablero
  estado?: EstadoDeTarjeta
  /** Sin esto —o en una columna que ya empezó— la tarjeta no carga el prompt. */
  onElegir?: (tarjeta: TarjetaDelTablero) => void
  movimiento?: Movimiento
  arrastrando?: boolean
  /** Ya está en su columna nueva pero el núcleo todavía no la guardó: late, atenuada. */
  guardando?: boolean
  ejemplo?: Ejemplo
}): React.JSX.Element {
  const contenido = <Contenido tarjeta={tarjeta} estado={estado} ejemplo={ejemplo} />
  const elegible = onElegir && !ejemplo && sePuedeEmpezar(tarjeta)
  const movible = movimiento && !ejemplo
  const alApretarTecla = (evento: React.KeyboardEvent): void => {
    if (!movible || !evento.altKey) {
      return
    }
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0
    if (paso !== 0) {
      evento.preventDefault()
      movimiento.conTeclado(tarjeta, paso)
    }
  }
  const comun = {
    'data-foco': '',
    onKeyDown: alApretarTecla,
    ...(movible
      ? {
          onPointerDown: (evento: React.PointerEvent<HTMLElement>) =>
            movimiento.alApretar(evento, tarjeta),
          onClickCapture: movimiento.alHacerClic,
          'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight'
        }
      : {}),
    className: cn(
      TARJETA,
      (elegible || movible) && cn(TOCABLE, ANILLO_DE_FOCO),
      // Se agarra si se puede arrastrar; si sólo se toca (va al prompt), la mano de siempre.
      movible ? 'cursor-grab touch-none select-none' : elegible && 'cursor-pointer'
    )
  }
  return (
    <li
      data-tarjeta-id={tarjeta.id}
      aria-busy={arrastrando || guardando || undefined}
      data-guardando={guardando || undefined}
      className={cn(
        ejemplo && 'transition-opacity duration-300',
        ejemplo && (ejemplo.visible ? 'opacity-70' : 'opacity-0'),
        // El mismo latido que las columnas mientras se lee el tablero: sin color, sólo tono.
        guardando && 'opacity-60 motion-safe:animate-pulse'
      )}
    >
      {guardando ? (
        <span role="status" className="sr-only">
          {translate('auto.components.dolphin.tablero.saving', 'Saving…')}
        </span>
      ) : null}
      {elegible ? (
        <button
          type="button"
          onClick={() => onElegir(tarjeta)}
          aria-label={translate(
            'auto.components.dolphin.tablero.useCard',
            'Use "{{value0}}" as the prompt',
            { value0: tarjeta.titulo }
          )}
          {...comun}
        >
          {contenido}
        </button>
      ) : movible ? (
        <div tabIndex={0} aria-label={tarjeta.titulo} {...comun}>
          {contenido}
        </div>
      ) : (
        <div className={TARJETA}>{contenido}</div>
      )}
    </li>
  )
}
