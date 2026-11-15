import { translate } from '@/i18n/i18n'
import { Check, ChevronRight, Folder, GitBranch } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { DolphinMark } from '../dolphin/DolphinMark'

/**
 * La isla de arriba a la izquierda: dónde estás parado.
 *
 * Es la `top-left` de Deska (`apps/desktop/src/renderer/src/chrome/TopBar.tsx`), con sus migas
 * marca ▸ proyecto ▸ rama. Acá hace falta más que allá: el lienzo ocupa la ventana entera y no
 * tiene la barra lateral del Dolphin de siempre, así que sin esto el plano no dice en qué
 * proyecto estás ni en qué rama van a caer los commits de lo que corras adentro.
 *
 * Qué se dejó afuera de la de Deska, y por qué: la computadora (Dolphin corre donde corre) y el
 * contador de tareas (ya está el rail de ventanas al lado). Lo que quedó son las dos cosas que
 * cambian solas y que uno necesita confirmar antes de largar un agente.
 *
 * Y la rama no es solo un cartel: despliega los worktrees del proyecto y se cambia desde acá,
 * como el `crumb-branch` de Deska. Sin eso, cambiar de rama obligaba a salir del lienzo entero,
 * que es la mitad del punto de tener un modo aparte.
 *
 * Medidas de sus tokens: 42 de alto, radio 16, pegada a 15/17 del borde; migas de 28 con radio
 * 12, 12 px peso 500, y el nombre del proyecto más fuerte que lo demás porque es el ancla.
 */
export type RamaDelProyecto = {
  readonly id: string
  readonly nombre: string
  readonly activa: boolean
}

export type OtroProyecto = {
  readonly id: string
  readonly nombre: string
  readonly activo: boolean
}

/** Referencias estables para los defaults: un `[]` nuevo por render rompe la igualdad. */
const SIN_PROYECTOS: readonly OtroProyecto[] = []
const SIN_RAMAS: readonly RamaDelProyecto[] = []

export function IslaDelProyecto({
  proyecto,
  // Las dos listas llevan default aunque el tipo las pida. La isla se dibuja adentro del
  // lienzo, así que un `undefined` acá —un módulo recargado a mitad de camino, un padre nuevo
  // que se olvida de pasarlas— no deja la isla a medias: tira abajo el plano entero con sus
  // ventanas. Vacío es un estado que ya sabe dibujar: la miga queda sin menú.
  proyectos = SIN_PROYECTOS,
  rama,
  ramas = SIN_RAMAS,
  vidrio,
  seEnciende,
  alElegirProyecto,
  alElegirRama
}: {
  proyecto: string | null
  /** Los demás proyectos abiertos: tocar el nombre los despliega. */
  proyectos: readonly OtroProyecto[]
  rama: string | null
  /** Los worktrees del proyecto: tocar la rama los despliega para cambiar sin salir del lienzo. */
  ramas: readonly RamaDelProyecto[]
  /** Las clases del material y del atenuado, que los define el chrome. */
  vidrio: string
  seEnciende: string
  alElegirProyecto: (id: string) => void
  alElegirRama: (id: string) => void
}): React.JSX.Element {
  return (
    <div
      className={`pointer-events-auto absolute top-[15px] left-[17px] flex h-[42px] items-center gap-[3px] rounded-[16px] pr-2 pl-3 ${vidrio} ${seEnciende}`}
    >
      <span className="flex items-center gap-2 pr-1" title="Dolphin">
        <DolphinMark className="size-[17px]" />
        <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground">dolphin</span>
      </span>

      {proyecto ? (
        <>
          <span aria-hidden="true" className="mr-1.5 ml-0.5 h-[18px] w-px bg-white/10" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={translate('canvas.switchProject', 'Switch project')}
                className="flex h-7 max-w-[240px] items-center gap-[7px] rounded-xl px-2 text-[12px] font-semibold text-foreground transition-colors duration-[120ms] hover:bg-white/[0.07]"
              >
                <span className="truncate">{proyecto}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              {proyectos.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => alElegirProyecto(p.id)}>
                  {p.activo ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Folder aria-hidden="true" className="size-3.5 opacity-40" />
                  )}
                  <span className="truncate">{p.nombre}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}

      {rama ? (
        <>
          <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/60" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={translate('canvas.switchBranch', 'Switch branch')}
                className="flex h-7 max-w-[240px] items-center gap-[7px] rounded-xl px-2 text-[12px] font-medium text-muted-foreground transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-foreground"
              >
                <GitBranch aria-hidden="true" className="size-[13px] shrink-0" />
                <span className="truncate font-mono text-[12px]">{rama}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              {ramas.map((r) => (
                <DropdownMenuItem key={r.id} onSelect={() => alElegirRama(r.id)}>
                  {r.activa ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <GitBranch aria-hidden="true" className="size-3.5 opacity-40" />
                  )}
                  <span className="font-mono text-[12px]">{r.nombre}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  )
}

/** `refs/heads/algo` es cómo lo guarda git; lo que uno llama rama es lo de después. */
export function nombreDeRama(rama: string | null | undefined): string | null {
  if (!rama) {
    return null
  }
  return rama.startsWith('refs/heads/') ? rama.slice('refs/heads/'.length) : rama
}
