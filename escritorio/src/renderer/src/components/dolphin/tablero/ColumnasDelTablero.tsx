import { useCallback, useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import {
  agruparPorColumna,
  type ColumnaDelTablero,
  type TarjetaDelTablero
} from '../../../../../shared/dolphin-tablero-types'
import { columnaVecina } from './arrastre-de-tarjetas'
import {
  PiezaDeTarjeta,
  type Ejemplo,
  type EstadoDeTarjeta,
  type Movimiento
} from './PiezaDeTarjeta'
import { useArrastre } from './use-arrastre'
import { useDeslizamiento } from './use-deslizamiento'

export type { EstadoDeTarjeta } from './PiezaDeTarjeta'

export function nombreDeColumna(columna: ColumnaDelTablero): string {
  switch (columna) {
    case 'ideas':
      return translate('auto.components.dolphin.tablero.columnIdeas', 'Ideas')
    case 'para-hacer':
      return translate('auto.components.dolphin.tablero.columnToDo', 'To do')
    case 'haciendo':
      return translate('auto.components.dolphin.tablero.columnDoing', 'Doing')
    case 'para-revisar':
      return translate('auto.components.dolphin.tablero.columnToReview', 'To review')
    case 'hecho':
      return translate('auto.components.dolphin.tablero.columnDone', 'Done')
  }
}

const NADA = (): void => undefined

/**
 * Cómo se ve una columna. En reposo no tiene superficie: es su encabezado y sus tarjetas sobre el
 * lienzo. Durante un arrastre todas vuelven a ser zona de destino (un velo de tinta con radio 14 a
 * todo el alto) y la que está bajo el puntero sube un tono más. Sólo cambia el fondo, en 150 ms.
 */
const COLUMNA =
  'flex min-w-0 flex-col rounded-[14px] p-1 transition-[background-color] duration-150 ease-out motion-reduce:transition-none'
const ZONA = 'bg-foreground/[0.04]'
// Al 10 % y no al 8 % del hover: al lado de una zona al 4 % el 8 no se distinguía en oscuro.
const ZONA_DESTINO = 'bg-foreground/[0.1]'

/**
 * El ancho de cada columna. Las vacías se achican al ancho de su nombre (120 px como mínimo) y el
 * lugar que dejan lo reparten las que tienen tarjetas; el orden de las cinco no cambia nunca. Con
 * la tarjeta de ejemplo, o sin ninguna, van parejas: la tarjeta pasa por todas.
 */
// Medido: con la barra derecha abierta, a 1440 el inicio deja ~770 px; tres columnas con tarjetas
// y dos vacías (3 × 148 + 2 × 120 + huecos) entran sin scroll horizontal.
const ANCHO_PAREJO = 'min-w-[128px] flex-1 basis-0'
const ANCHO_CON_TARJETAS = 'min-w-[148px] flex-1 basis-0'
const ANCHO_VACIA = 'min-w-[120px] flex-none'

/**
 * Las cinco columnas del ciclo, sin cajas: las tarjetas son las únicas superficies del tablero.
 * Cada columna lista todas sus tarjetas en su propio scroll, con un alto tope, así una columna con
 * cuarenta no empuja la pantalla.
 *
 * Si se pasa `onElegir`, las tarjetas de Ideas y Para hacer se pueden tocar (van al prompt). Con
 * `onMover`, se arrastran a otra columna (o se mueven con Alt+flecha) y se deslizan a su lugar.
 * `estadoDe` dice en qué anda el espacio que tiene cada tarjeta (el punto de la barra lateral).
 */
export function ColumnasDelTablero({
  tarjetas,
  onElegir,
  estadoDe,
  espacioDe,
  onMover,
  guardando,
  ejemplo,
  llenar = false
}: {
  tarjetas: TarjetaDelTablero[]
  onElegir?: (tarjeta: TarjetaDelTablero) => void
  estadoDe?: (tarjeta: TarjetaDelTablero) => EstadoDeTarjeta | undefined
  /** El espacio de trabajo de la rama de la tarjeta: de ahí sale «Lo que hizo». */
  espacioDe?: (tarjeta: TarjetaDelTablero) => string | undefined
  onMover?: (tarjeta: TarjetaDelTablero, columna: ColumnaDelTablero) => void
  /** Las tarjetas movidas que el núcleo todavía no guardó: se ven atenuadas en su columna nueva. */
  guardando?: ReadonlySet<string>
  /** El tablero vacío muestra una tarjeta de ejemplo que recorre el ciclo sola. */
  ejemplo?: Ejemplo
  /** Las columnas ocupan el alto que les dé quien las monta (el inicio). */
  llenar?: boolean
}): React.JSX.Element {
  const raiz = useRef<HTMLDivElement>(null)
  const quieto = usePrefersReducedMotion()
  const clave = tarjetas.map((t) => `${t.id}:${t.columna}`).join('|')
  const { desdeAca } = useDeslizamiento(raiz, clave, quieto)
  const [anuncio, setAnuncio] = useState('')
  const enfocar = useRef<string | null>(null)

  const mover = useCallback(
    (tarjeta: TarjetaDelTablero, columna: ColumnaDelTablero) => {
      ;(onMover ?? NADA)(tarjeta, columna)
      setAnuncio(
        translate('auto.components.dolphin.tablero.movedTo', 'Moved to {{value0}}', {
          value0: nombreDeColumna(columna)
        })
      )
    },
    [onMover]
  )
  const { arrastrando, destino, alApretar, alHacerClic } = useArrastre({
    tablero: raiz,
    quieto,
    alSoltar: mover,
    desdeAca
  })
  const movimiento: Movimiento | undefined = onMover
    ? {
        alApretar,
        alHacerClic,
        conTeclado: (tarjeta, paso) => {
          const vecina = columnaVecina(tarjeta.columna, paso)
          if (vecina) {
            enfocar.current = tarjeta.id
            mover(tarjeta, vecina)
          }
        }
      }
    : undefined

  // Movida con el teclado, la tarjeta cambia de lista y React la monta de nuevo: el foco la sigue.
  useEffect(() => {
    const id = enfocar.current
    if (!id) {
      return
    }
    enfocar.current = null
    raiz.current
      ?.querySelector<HTMLElement>(`[data-tarjeta-id="${CSS.escape(id)}"] [data-foco]`)
      ?.focus()
  }, [clave])

  const columnas = agruparPorColumna(tarjetas)
  const parejas = Boolean(ejemplo) || columnas.every((c) => c.tarjetas.length === 0)

  return (
    <div
      ref={raiz}
      className={cn(
        // -mx-1: el padding de cada columna (que sólo se ve como zona durante un arrastre) no corre
        // las tarjetas hacia adentro; el borde de la primera queda alineado con el título.
        'scrollbar-sleek -mx-1 self-stretch overflow-x-auto',
        llenar && 'flex min-h-0 flex-1 flex-col',
        // Un tablero que se arrastra no se selecciona: el puntero que cruza los encabezados al
        // llevar una tarjeta los dejaba resaltados («Para hacer 1» en azul).
        onMover && 'select-none'
      )}
      data-dolphin-tablero-inicio=""
      data-arrastrando={arrastrando ? '' : undefined}
    >
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {/* Estiradas a todo el alto: así, durante un arrastre, cada zona de destino llega al pie del
          tablero aunque la columna esté vacía. Debajo de los mínimos, scroll horizontal en vez de
          aplastar los títulos. Con un alto mínimo: con una sola tarjeta la zona de destino era
          una franja de 90 px y soltar un poco más abajo devolvía la tarjeta. En reposo no se ve. */}
      <div className={cn('flex items-stretch gap-2', llenar ? 'min-h-36 flex-1' : 'min-h-28')}>
        {columnas.map(({ columna, tarjetas: deLaColumna }) => {
          const vacia = deLaColumna.length === 0
          return (
            <section
              key={columna}
              data-columna={columna}
              data-vacia={vacia ? '' : undefined}
              aria-label={nombreDeColumna(columna)}
              className={cn(
                COLUMNA,
                parejas ? ANCHO_PAREJO : vacia ? ANCHO_VACIA : ANCHO_CON_TARJETAS,
                arrastrando && (destino === columna ? ZONA_DESTINO : ZONA)
              )}
            >
              <h3
                className={cn(
                  'flex items-baseline gap-2 whitespace-nowrap px-3 pb-2 pt-1 text-[13px] font-semibold leading-[18px]',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  // Vacía, sólo el nombre y atenuado; con tarjetas, el nombre entero y la cuenta.
                  vacia && 'text-[var(--dolphin-tinta-36)]'
                )}
              >
                {nombreDeColumna(columna)}
                {ejemplo || vacia ? null : (
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {deLaColumna.length}
                  </span>
                )}
              </h3>
              {/* -m-1/p-1: el scroll llega hasta el borde de la columna, así el anillo de foco de
                  una tarjeta no queda recortado por el overflow. */}
              <ul className="scrollbar-sleek -m-1 flex max-h-[min(56vh,520px)] flex-col gap-1 overflow-y-auto p-1">
                {deLaColumna.map((tarjeta) => (
                  <PiezaDeTarjeta
                    key={tarjeta.id}
                    tarjeta={tarjeta}
                    estado={estadoDe?.(tarjeta)}
                    espacio={espacioDe?.(tarjeta)}
                    onElegir={onElegir}
                    movimiento={movimiento}
                    arrastrando={arrastrando === tarjeta.id}
                    guardando={guardando?.has(tarjeta.id)}
                    ejemplo={ejemplo?.id === tarjeta.id ? ejemplo : undefined}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
