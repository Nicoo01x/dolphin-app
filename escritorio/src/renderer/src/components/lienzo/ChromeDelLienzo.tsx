import { translate } from '@/i18n/i18n'
import { Globe, LogOut, Maximize2, Minus, Plus, Sparkles, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { worldToScreen, type Guide, type ViewportTransform } from './canvas'
import { iconoDe, QUE_SE_PUEDE_ABRIR, type QueAbrir } from './paneles-que-se-abren'
import type { PanelDelLienzo } from './lienzo-paneles'

/**
 * Lo que flota sobre el plano: el rail de ventanas, la barra de abajo y las guías del imán.
 *
 * Nada de esto se acerca con el zoom: es el chrome, no la escena. Lo que ocupan se le pasa al
 * encuadre como `insets`, así «ver todo» no mete una ventana abajo de la barra.
 */

/**
 * Cuánto tapa el chrome de cada lado, para que el encuadre no esconda nada atrás.
 *
 * Arriba son 64 desde que está la isla del proyecto: 15 del borde + 42 de la isla + 7 de aire,
 * que es la misma cuenta que hace Deska para apoyar su rail debajo de la banda de arriba. Y los
 * dos costados miden igual porque ahora hay un rail de cada lado: 17 del borde + 58 del rail.
 */
export const LO_QUE_TAPA = { top: 64, right: 88, bottom: 88, left: 88 }

/**
 * El material de las piezas que flotan sobre el plano: vidrio.
 *
 * Los valores son los de Deska, leídos de sus tokens (`packages/ui/src/tokens.css`) y no medidos
 * de la pantalla, que es como estaban antes y por eso quedaban cerca pero no: el fondo es
 * `rgba(16,18,23,.74)` y el desenfoque lleva **saturación al 150 %**, que es la mitad del efecto
 * —sin eso el color de atrás pasa lavado y el vidrio parece plástico gris—. Encima va un brillo
 * de 135° que entra por la esquina de arriba a la izquierda, y el canto son dos capas: un labio
 * iluminado arriba y un anillo, «para que una esquina se lea como un espesor y no como un
 * borde».
 *
 * Las piezas no se distinguen entre sí por el color —todas son el mismo vidrio—, sino por su
 * forma y por lo que tienen adentro.
 */
export const VIDRIO =
  'bg-[var(--color-lienzo-vidrio)] [background-image:var(--lienzo-vidrio-brillo)] [backdrop-filter:var(--lienzo-vidrio-desenfoque)] shadow-[var(--lienzo-vidrio-borde),0_10px_28px_rgba(0,0,0,0.4)]'

/**
 * El chrome vive atenuado y se enciende al acercarse (el «ambient dim» de Deska: 0,3 → 1 en
 * 300 ms). Es lo que hace que el plano se sienta el protagonista y los controles, algo que está
 * ahí cuando los buscás. Con `prefers-reduced-motion` no se atenúa: aparece y queda.
 */
export const SE_ENCIENDE =
  'opacity-30 transition-opacity duration-300 ease-[var(--lienzo-ease)] hover:opacity-100 focus-within:opacity-100 motion-reduce:opacity-100 motion-reduce:transition-none'

export function RailDeVentanas({
  paneles,
  alTocar
}: {
  paneles: readonly PanelDelLienzo[]
  alTocar: (id: string) => void
}): React.JSX.Element {
  return (
    // 58 px de ancho y radio 15, que son los del rail de Deska.
    //
    // Y **sin rótulo abajo**: lo tuvo («ventanas», en monoespaciada de 9,5 px) copiado de una
    // Deska vieja, y la propia Deska lo sacó con esta razón escrita al lado: los iconos ya dicen
    // qué son al pasarles el puntero, así que el rótulo era una etiqueta sobre otra etiqueta. El
    // nombre del grupo vive en el `aria-label` del `nav`, donde sirve de verdad.
    // Apoyado debajo de la isla del proyecto, con la cuenta de Deska: 15 + 42 + 7 = 64. La
    // marca ya está arriba, así que acá adentro van solo las ventanas.
    <nav
      aria-label={translate('canvas.openWindows', 'Open windows')}
      className={`pointer-events-auto absolute top-16 left-[17px] flex w-[58px] flex-col items-center gap-1.5 rounded-[15px] p-2 ${VIDRIO} ${SE_ENCIENDE}`}
    >
      {paneles.map((panel) => (
        <button
          key={panel.id}
          type="button"
          onClick={() => alTocar(panel.id)}
          title={panel.titulo}
          aria-label={translate('canvas.bringToFront', 'Bring {name} to the front').replace(
            '{name}',
            panel.titulo
          )}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-[140ms] hover:bg-white/[0.07] hover:text-foreground"
        >
          {iconoDe(panel.subtitulo ?? '')}
        </button>
      ))}
    </nav>
  )
}

/**
 * Las páginas del proyecto, en el rail de la derecha.
 *
 * Es el `ToolsRail` de Deska, y lo que lo hace distinto de «Agregar panel» es su regla: si esa
 * ventana ya está en el plano, te lleva hasta ella; si no está, la abre. Son cosas de las que
 * querés UNA —no tiene sentido tener dos ventanas de Git mirando el mismo repo—, al revés de las
 * terminales y los navegadores, que se abren de a muchas y por eso siguen viviendo en el dock.
 */
export function RailDeHerramientas({
  cuales,
  alMostrarOAbrir
}: {
  cuales: readonly { vista: QueAbrir; titulo: string; icono: React.ReactNode }[]
  alMostrarOAbrir: (vista: QueAbrir) => void
}): React.JSX.Element {
  return (
    <nav
      aria-label={translate('canvas.projectPages', 'Project pages')}
      className={`pointer-events-auto absolute top-16 right-[17px] flex w-[58px] flex-col items-center gap-1.5 rounded-[15px] p-2 ${VIDRIO} ${SE_ENCIENDE}`}
    >
      {cuales.map((q) => (
        <button
          key={q.vista}
          type="button"
          onClick={() => alMostrarOAbrir(q.vista)}
          title={q.titulo}
          aria-label={translate('canvas.showWindow', 'Show {name}').replace('{name}', q.titulo)}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-[140ms] hover:bg-white/[0.07] hover:text-foreground"
        >
          {q.icono}
        </button>
      ))}
    </nav>
  )
}

/**
 * Lo que en Deska es `dock-extras`: la esquina de abajo a la izquierda, para lo accesorio.
 *
 * Salir del lienzo vive acá y no en el dock del medio por lo mismo que el zoom se fue a su
 * esquina: el dock es para traer cosas al plano, y «me voy» no es traer nada. Además es la única
 * puerta de salida del modo, así que conviene que esté siempre en el mismo lugar y no al lado de
 * los botones que se usan todo el tiempo.
 */
export function SalidaDelLienzo({ alSalir }: { alSalir: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={alSalir}
      title={translate('canvas.exitTitle', 'Back to the usual app')}
      className={`pointer-events-auto absolute bottom-6 left-[17px] flex h-9 items-center gap-[7px] rounded-[14px] px-3 text-[12px] font-medium text-muted-foreground transition-colors duration-[120ms] hover:text-foreground ${VIDRIO} ${SE_ENCIENDE}`}
    >
      <LogOut aria-hidden="true" className="size-3.5" />
      {translate('canvas.exit', 'Leave the canvas')}
    </button>
  )
}

/** Un glifo del dock: 30×30 con radio 12 y un anillo interior, como los de Deska. */
function Glifo({
  titulo,
  acento = false,
  alTocar,
  children
}: {
  titulo: string
  /** El de largar un agente va más fuerte: es la acción que uno viene a hacer. */
  acento?: boolean
  alTocar: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-label={titulo}
      title={titulo}
      className={`mx-[3px] grid size-[30px] place-items-center rounded-xl shadow-[inset_0_0_0_1px_var(--lienzo-hairline)] transition-[background,color] duration-[120ms] active:scale-[0.92] ${
        acento
          ? 'bg-white/[0.08] text-foreground hover:bg-white/[0.12]'
          : 'text-muted-foreground hover:bg-white/[0.07] hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

export function BarraDelLienzo({
  alAbrir
}: {
  alAbrir: (vista: QueAbrir) => void
}): React.JSX.Element {
  return (
    // El dock de abajo: 52 px de alto y radio 18, como el de Deska, y del mismo vidrio que el
    // rail. Vive atenuado y se enciende al acercarse.
    //
    // Acá NO va el zoom. En Deska el dock del medio es para abrir cosas y el zoom vive en su
    // propia esquina, abajo a la derecha, con el mapa encima; mezclados, la barra del medio
    // crecía y el gesto de «moverme por el plano» quedaba al lado del de «traer algo nuevo».
    <div
      className={`pointer-events-auto absolute bottom-4 left-1/2 flex h-[52px] -translate-x-1/2 items-center gap-1 rounded-[18px] px-2 ${VIDRIO} ${SE_ENCIENDE}`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Plus aria-hidden="true" className="size-3.5" />
            {translate('canvas.addPanel', 'Add panel')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {QUE_SE_PUEDE_ABRIR.map((q) => (
            <DropdownMenuItem key={q.vista} onSelect={() => alAbrir(q.vista)}>
              {q.icono}
              {q.titulo}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-white/10" />

      {/* Los atajos del dock: lo que se abre de a muchos. Las páginas del proyecto —una sola de
          cada una— viven en el rail de la derecha, con su regla de «si ya está, te llevo». */}
      <Glifo titulo="Terminal nueva" alTocar={() => alAbrir('terminal')}>
        <TerminalSquare aria-hidden="true" className="size-4" />
      </Glifo>
      <Glifo titulo="Navegador nuevo" alTocar={() => alAbrir('navegador')}>
        <Globe aria-hidden="true" className="size-4" />
      </Glifo>
      <Glifo titulo="Largar un agente" acento alTocar={() => alAbrir('nueva')}>
        <Sparkles aria-hidden="true" className="size-4" />
      </Glifo>
    </div>
  )
}

/**
 * La esquina de abajo a la derecha: el mapa del plano y los controles de zoom.
 *
 * En Deska es el `zoom-cluster` y vive separado del dock a propósito: moverse por el plano es
 * otra cosa que traer una ventana nueva. El mapa va encima del pill, apoyado en su borde
 * derecho, así los dos crecen hacia arriba y hacia la izquierda y nada se corre de lugar cuando
 * el mapa se abre.
 */
export function EsquinaDelZoom({
  zoom,
  mapa,
  alAlejar,
  alAcercar,
  alVerTodo,
  alTamanoReal
}: {
  zoom: number
  /** El minimapa, que se arma afuera porque necesita las ventanas y la vista. */
  mapa: React.ReactNode
  alAlejar: () => void
  alAcercar: () => void
  alVerTodo: () => void
  /** El número es un botón: vuelve al 100 %, como en Deska. */
  alTamanoReal: () => void
}): React.JSX.Element {
  return (
    <div
      className={`pointer-events-none absolute right-4 bottom-4 flex flex-col items-end gap-2 ${SE_ENCIENDE}`}
    >
      {mapa}
      <div
        className={`pointer-events-auto flex h-9 items-center gap-0.5 rounded-[14px] px-1 ${VIDRIO}`}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('canvas.zoomOut', 'Zoom out')}
          onClick={alAlejar}
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={alTamanoReal}
          title={translate('canvas.actualSize', 'Back to 100%')}
          className="h-7 min-w-11 rounded-[10px] px-1.5 text-[12px] tabular-nums text-muted-foreground transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('canvas.zoomIn', 'Zoom in')}
          onClick={alAcercar}
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('canvas.fitAll', 'Fit everything')}
          title={translate('canvas.fitAll', 'Fit everything')}
          onClick={alVerTodo}
        >
          <Maximize2 aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

/** Las líneas del imán: aparecen mientras se arrastra y dicen contra qué se alineó. */
export function Guias({
  guias,
  vista
}: {
  guias: readonly Guide[]
  vista: ViewportTransform
}): React.JSX.Element | null {
  if (guias.length === 0) {
    return null
  }
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {guias.map((g) => {
        const desde = worldToScreen(vista, {
          x: g.axis === 'x' ? g.at : g.from,
          y: g.axis === 'x' ? g.from : g.at
        })
        const hasta = worldToScreen(vista, {
          x: g.axis === 'x' ? g.at : g.to,
          y: g.axis === 'x' ? g.to : g.at
        })
        return (
          <span
            key={`${g.axis}-${g.at}-${g.from}`}
            className="absolute bg-primary/70"
            style={
              g.axis === 'x'
                ? { left: desde.x, top: desde.y, width: 1, height: Math.max(1, hasta.y - desde.y) }
                : { left: desde.x, top: desde.y, width: Math.max(1, hasta.x - desde.x), height: 1 }
            }
          />
        )
      })}
    </div>
  )
}
