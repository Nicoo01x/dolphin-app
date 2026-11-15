import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { getWorktreeStatusLabel } from '@/lib/workspace/activity/worktree-status'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import type { DolphinFailureCode } from '../../../../../shared/dolphin-console-types'
import { dolphinFailureMessage } from '../dolphin-failure'
import type {
  ColumnaDelTablero,
  PedidoDeMoverTarjeta,
  TarjetaDelTablero,
  TarjetaMovida
} from '../../../../../shared/dolphin-tablero-types'
import {
  espaciosPorRama,
  type EspacioConEstado,
  type EspacioDelInicio
} from '../inicio/estado-del-inicio'
import { TITULO_DE_SECCION } from '../inicio/FilasDeEspacios'
import { ColumnasDelTablero, type EstadoDeTarjeta } from './ColumnasDelTablero'
import { TableroDeEjemplo } from './TableroDeEjemplo'
import { useTableroDeAlguno, type LecturaDelTablero, type TableroDeUnProyecto } from './use-tablero'

/** Un proyecto del que se puede mostrar el tablero: su espacio de trabajo, su repo y cómo se llama. */
export type ProyectoDelTablero = { worktreeId: string; repoId: string; nombre: string }

/** Quién mueve de verdad una tarjeta: el puente con el núcleo (en las capturas, uno de mentira). */
export type MoverTarjeta = (pedido: PedidoDeMoverTarjeta) => Promise<TarjetaMovida>

/** Cuántas tarjetas de esqueleto lleva cada columna: distintas, para que no se lea como cinco cajas. */
const ESQUELETO = [2, 1, 1, 1, 0] as const

/**
 * Las cinco columnas sin datos, con la forma del tablero de verdad: el renglón del nombre y unas
 * tarjetas en tono, sin texto. Mientras se lee laten (para que nada salte al llegar); cuando no se
 * pudo leer quedan quietas y más tenues (un tablero con columnas vacías diría que está vacío, y no
 * se sabe).
 */
function ColumnasSinDatos({ leyendo }: { leyendo: boolean }): React.JSX.Element {
  return (
    <div className="scrollbar-sleek -mx-1 overflow-x-auto">
      <div
        aria-busy={leyendo || undefined}
        className={cn('flex gap-2', leyendo ? 'motion-safe:animate-pulse' : 'opacity-60')}
      >
        {leyendo ? (
          <p role="status" className="sr-only">
            {translate('auto.components.dolphin.inicio.readingBoard', 'Reading the board…')}
          </p>
        ) : null}
        {ESQUELETO.map((tarjetas, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="flex min-w-[128px] flex-1 basis-0 flex-col p-1"
          >
            <div className="px-3 pb-2 pt-1">
              <div className="my-1 h-2.5 w-16 rounded-full bg-card" />
            </div>
            <div className="flex flex-col gap-1">
              {Array.from({ length: tarjetas }, (_, j) => (
                <div key={j} className="h-14 rounded-xl bg-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Una tarjeta movida que se dibuja en su columna nueva antes de que el disco lo diga. */
type MovidaPorAdelantado = {
  columna: ColumnaDelTablero
  cuando: string
  /** Mientras el núcleo no contestó: la consola puede tardar en arrancar (hasta 60 s en frío). */
  guardando: boolean
  /** Qué pedido la puso ahí: si se movió otra vez, el resultado del anterior no la toca. */
  vuelta: number
}

/** El último movimiento que no salió: qué decir y qué volver a pedir con «Reintentar». */
type FalloAlMover = { tarjeta: TarjetaDelTablero; columna: ColumnaDelTablero; texto: string }

/** Por qué no se movió: el código de la consola, o sólo un detalle si el puente mismo falló. */
type MotivoDelFallo = { code?: DolphinFailureCode; detail?: string }

function soloLasQueSeGuardan(
  movidas: ReadonlyMap<string, MovidaPorAdelantado>
): ReadonlyMap<string, MovidaPorAdelantado> {
  const quedan = [...movidas].filter(([, m]) => m.guardando)
  return quedan.length === movidas.size ? movidas : new Map(quedan)
}

/**
 * El aviso de un movimiento que no salió, en palabras: el código se traduce como en el modo live y
 * el portón. El tope de arranque vencido tiene su frase propia: lo que pasó es que Dolphin tardó, y
 * lo que hay que hacer es probar de nuevo (la consola sigue arrancando y la próxima vez está).
 */
function textoDelFallo(tarjeta: TarjetaDelTablero, motivo: MotivoDelFallo): string {
  // El núcleo nombra la tarjeta por su id sólo cuando no la encuentra (`src/nucleo/tarjetas.ts`,
  // «no hay una tarjeta «id»»): se borró o se renombró su archivo. El id no le dice nada a nadie;
  // lo que importa es que ya no está y que el tablero se volvió a leer (`onMovida`).
  if (motivo.code === 'rejected' && motivo.detail?.includes(`«${tarjeta.id}»`) === true) {
    return translate(
      'auto.components.dolphin.tablero.cardGone',
      '"{{value0}}" is no longer on the board (its file was deleted or renamed). The board was read again.',
      { value0: tarjeta.titulo }
    )
  }
  const porQue =
    motivo.code === 'timeout'
      ? translate(
          'auto.components.dolphin.tablero.slowStart',
          'Dolphin took too long to start. Try again.'
        )
      : motivo.code
        ? dolphinFailureMessage({ ok: false, code: motivo.code, detail: motivo.detail })
        : (motivo.detail ?? '')
  return translate(
    'auto.components.dolphin.tablero.moveFailed',
    'Could not move "{{value0}}": {{value1}}',
    { value0: tarjeta.titulo, value1: porQue }
  )
}

/** El tablero de verdad: tocar, arrastrar y la tira del portón en las que tienen rama. */
function TableroReal({
  tablero,
  proyecto,
  porRama,
  onElegir,
  mover,
  onMovida,
  llenar
}: {
  tablero: TableroDeUnProyecto
  proyecto: ProyectoDelTablero | undefined
  porRama: ReadonlyMap<string, EspacioConEstado>
  onElegir: (repoId: string, tarjeta: TarjetaDelTablero) => void
  mover?: MoverTarjeta
  onMovida?: () => void
  llenar: boolean
}): React.JSX.Element {
  // Lo que se movió y el núcleo todavía no escribió en disco: se dibuja ya en su columna nueva.
  const [movidas, setMovidas] = useState<ReadonlyMap<string, MovidaPorAdelantado>>(() => new Map())
  const [fallo, setFallo] = useState<FalloAlMover | null>(null)
  const vuelta = useRef(0)
  // La lectura que se pide justo después de un fallo no borra el aviso: es la que lo acompaña.
  const conservarFallo = useRef(false)
  // Una lectura nueva del disco manda sobre lo que se dibujó por adelantado, salvo lo que todavía
  // se está guardando: si no, la tarjeta volvería a su columna vieja a mitad de la espera.
  useEffect(() => {
    setMovidas((antes) => soloLasQueSeGuardan(antes))
    if (conservarFallo.current) {
      conservarFallo.current = false
    } else {
      setFallo(null)
    }
  }, [tablero])
  const tarjetas = useMemo(
    () =>
      tablero.tarjetas.map((t) => {
        const movida = movidas.get(t.id)
        return movida ? { ...t, columna: movida.columna, movida: movida.cuando } : t
      }),
    [tablero, movidas]
  )
  const guardando = useMemo(
    () => new Set([...movidas].filter(([, m]) => m.guardando).map(([id]) => id)),
    [movidas]
  )
  const estadoDe = (tarjeta: TarjetaDelTablero): EstadoDeTarjeta | undefined => {
    const deLaRama = tarjeta.rama ? porRama.get(tarjeta.rama) : undefined
    // Un espacio quieto no dice nada que la rama no diga: sólo se muestra lo que está pasando.
    if (!deLaRama || deLaRama.estado === 'inactive') {
      return undefined
    }
    return { estado: deLaRama.estado, etiqueta: getWorktreeStatusLabel(deLaRama.estado) }
  }
  const onMover =
    mover && proyecto
      ? (tarjeta: TarjetaDelTablero, columna: ColumnaDelTablero): void => {
          const esta = ++vuelta.current
          setFallo(null)
          setMovidas((antes) =>
            new Map(antes).set(tarjeta.id, {
              columna,
              cuando: new Date().toISOString(),
              guardando: true,
              vuelta: esta
            })
          )
          // Si mientras tanto se movió de nuevo, el resultado de este pedido ya no manda.
          const siSigueSiendoEsta = (
            cambiar: (m: Map<string, MovidaPorAdelantado>, actual: MovidaPorAdelantado) => void
          ): void =>
            setMovidas((antes) => {
              const actual = antes.get(tarjeta.id)
              if (actual?.vuelta !== esta) {
                return antes
              }
              const despues = new Map(antes)
              cambiar(despues, actual)
              return despues
            })
          const salio = (): void => {
            // Queda en su columna nueva hasta que la lectura del disco la confirme.
            siSigueSiendoEsta((m, actual) => m.set(tarjeta.id, { ...actual, guardando: false }))
            onMovida?.()
          }
          const fallar = (motivo: MotivoDelFallo): void => {
            if (vuelta.current === esta) {
              conservarFallo.current = true
              setFallo({ tarjeta, columna, texto: textoDelFallo(tarjeta, motivo) })
            }
            siSigueSiendoEsta((m) => m.delete(tarjeta.id))
            // Lo que haya en disco manda: quizá alguien la movió por fuera mientras se esperaba.
            onMovida?.()
          }
          mover({ worktreeId: tablero.worktreeId, id: tarjeta.id, columna })
            .then((hecho) => (hecho.ok ? salio() : fallar(hecho)))
            .catch((error: unknown) =>
              fallar({ detail: error instanceof Error ? error.message : String(error) })
            )
        }
      : undefined
  return (
    <>
      {fallo ? (
        // Sobre el renglón del título, a la derecha, y no arriba de las columnas: si las empujara,
        // el tablero saltaría 36 px justo cuando la persona está mirando dónde quedó la tarjeta.
        <div
          className="absolute right-0 top-0 z-10 flex h-5 max-w-[75%] items-center gap-3 bg-background pl-3"
          data-dolphin-tablero-aviso=""
        >
          <p
            role="alert"
            className="min-w-0 truncate text-[13px] text-muted-foreground"
            title={fallo.texto}
          >
            {fallo.texto}
          </p>
          {onMover ? (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => onMover(fallo.tarjeta, fallo.columna)}
            >
              <RotateCw className="size-3" />
              {translate('auto.components.dolphin.tablero.retry', 'Try again')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ColumnasDelTablero
        tarjetas={tarjetas}
        estadoDe={estadoDe}
        espacioDe={(tarjeta) => (tarjeta.rama ? porRama.get(tarjeta.rama)?.espacio.id : undefined)}
        onMover={onMover}
        guardando={guardando}
        onElegir={proyecto ? (tarjeta) => onElegir(proyecto.repoId, tarjeta) : undefined}
        // Estiradas hasta abajo: al arrastrar, la zona de destino llega hasta el compositor.
        llenar={llenar}
      />
    </>
  )
}

/**
 * El tablero en el inicio: el centro de la pantalla, siempre a la vista (docs/reforma/inicio-v2.md).
 * Con tarjetas, el de verdad; sin tarjetas, las cinco columnas con la tarjeta de ejemplo que recorre
 * el ciclo; leyendo, las columnas en esqueleto; si no se pudo leer, una línea y reintentar.
 */
export function TableroDelInicio({
  tablero,
  proyectos,
  espacios,
  estados,
  onElegir,
  mover,
  onReleer,
  instanteDelEjemplo,
  llenar = false
}: {
  tablero: LecturaDelTablero
  proyectos: readonly ProyectoDelTablero[]
  espacios: readonly EspacioDelInicio[]
  estados: ReadonlyMap<string, WorktreeStatus>
  onElegir: (repoId: string, tarjeta: TarjetaDelTablero) => void
  mover?: MoverTarjeta
  onReleer?: () => void
  /** Congela la tarjeta de ejemplo en un instante (para las capturas). */
  instanteDelEjemplo?: number
  /** El tablero (el de verdad o el de ejemplo) ocupa el alto que sobra en vez de dejarlo vacío. */
  llenar?: boolean
}): React.JSX.Element {
  const conTarjetas = tablero && tablero !== 'error' ? tablero : null
  const proyecto = proyectos.find((p) => p.worktreeId === conTarjetas?.worktreeId)
  const porRama = useMemo(
    (): ReadonlyMap<string, EspacioConEstado> =>
      proyecto ? espaciosPorRama(espacios, proyecto.repoId, estados) : new Map(),
    [espacios, estados, proyecto]
  )

  return (
    <section
      aria-labelledby="dolphin-inicio-tablero"
      className={
        llenar ? 'relative flex min-h-0 flex-1 flex-col gap-3' : 'relative flex flex-col gap-3'
      }
    >
      <h2 id="dolphin-inicio-tablero" className={TITULO_DE_SECCION}>
        {translate('auto.components.dolphin.inicio.board', 'Board')}
        {/* Con un solo proyecto no hay duda de cuál es: el nombre sería ruido. */}
        {proyecto && proyectos.length > 1 ? (
          <span
            className="min-w-0 truncate text-[13px] font-normal text-muted-foreground"
            title={proyecto.nombre}
            data-dolphin-tablero-proyecto=""
          >
            {proyecto.nombre}
          </span>
        ) : null}
      </h2>
      {tablero === undefined ? (
        <ColumnasSinDatos leyendo />
      ) : tablero === 'error' ? (
        <>
          <div className="flex items-center gap-3">
            <p role="alert" className="text-[13px] text-muted-foreground">
              {translate(
                'auto.components.dolphin.tablero.readFailed',
                'Could not read the board of this project.'
              )}
            </p>
            {onReleer ? (
              <Button variant="secondary" size="xs" onClick={onReleer}>
                <RotateCw className="size-3" />
                {translate('auto.components.dolphin.tablero.retry', 'Try again')}
              </Button>
            ) : null}
          </div>
          <ColumnasSinDatos leyendo={false} />
        </>
      ) : conTarjetas ? (
        <TableroReal
          tablero={conTarjetas}
          proyecto={proyecto}
          porRama={porRama}
          onElegir={onElegir}
          mover={mover}
          onMovida={onReleer}
          llenar={llenar}
        />
      ) : (
        <TableroDeEjemplo instante={instanteDelEjemplo} llenar={llenar} />
      )}
    </section>
  )
}

/**
 * Lo que ocupa el cuerpo de un espacio de trabajo sin ninguna pestaña (pasa al reabrir la app o
 * recargar con un espacio activo y vacío): antes quedaba negro. Con tarjetas, el tablero del
 * proyecto; sin ellas, una frase y la acción para empezar. Mientras se lee, nada: mostrar la frase
 * antes de saber haría parpadear «no hay tarjetas».
 */
export function TableroDelEspacioVacio({
  worktreeId,
  onNuevaTerminal
}: {
  worktreeId: string
  onNuevaTerminal: () => void
}): React.JSX.Element {
  const tablero = useTableroDeAlguno(useMemo(() => [worktreeId], [worktreeId]))
  return (
    <div className="scrollbar-sleek absolute inset-0 flex overflow-y-auto bg-background">
      <div className="m-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 py-8">
        {tablero ? (
          <ColumnasDelTablero tarjetas={tablero.tarjetas} />
        ) : tablero === null ? (
          <>
            <p className="text-sm text-muted-foreground">
              {translate(
                'auto.components.dolphin.tablero.emptyBoard',
                'This project has no cards on its board yet.'
              )}
            </p>
            <Button variant="secondary" onClick={onNuevaTerminal}>
              {translate('auto.components.dolphin.tablero.newTerminal', 'New terminal')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
