import { translate } from '@/i18n/i18n'
import { useCallback, useRef } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/class-names'
import {
  RESIZE_HANDLES,
  worldRectToScreen,
  type ResizeHandle,
  type ViewportTransform
} from './canvas'
import type { PanelDelLienzo } from './lienzo-paneles'

/**
 * Una ventana del lienzo: cabecera para agarrarla, bordes para estirarla, cuerpo con lo suyo.
 *
 * Se arrastra con pointer events y `setPointerCapture` —no con listeners en window— para que el
 * arrastre siga funcionando cuando el puntero pasa por encima del webview de otro panel, que es
 * un documento aparte y se come los eventos.
 *
 * El zoom se aplica a las medidas y NO con un `transform: scale` del plano: un webview escalado
 * por transform se rasteriza a su tamaño viejo y se estira como una foto —se ve blando, y es lo
 * primero que se nota—. Así cada ventana se dibuja a su tamaño y el contenido se agranda con el
 * zoom propio del webview, que vuelve a dibujar nítido.
 */

/**
 * Lo que la ventana le come al contenido, en coordenadas del plano: la cabecera y el marco.
 *
 * Está acá, al lado de donde se dibujan, porque es un número compartido: el contenido que
 * necesita saber de qué tamaño es su hueco ANTES de que exista —la terminal, que le avisa al
 * proceso cuántas columnas tiene— lo calcula con esto en vez de medir la pantalla. Medido, el
 * número depende del zoom y queda un cuadro de desfase en cada rueda del mouse; calculado, es
 * exacto siempre.
 */
export const CHROME_DE_LA_VENTANA = { cabecera: 44, margen: 6 } as const

/** El hueco que le queda al contenido, en coordenadas del plano. */
export function cuerpoEnElPlano(rect: { width: number; height: number }): {
  width: number
  height: number
} {
  return {
    width: Math.max(0, rect.width - CHROME_DE_LA_VENTANA.margen * 2),
    height: Math.max(0, rect.height - CHROME_DE_LA_VENTANA.cabecera - CHROME_DE_LA_VENTANA.margen)
  }
}

/** Dónde agarra cada borde y qué flecha muestra el puntero. */
const DONDE_AGARRA: Record<ResizeHandle, { clases: string; cursor: string }> = {
  n: { clases: 'top-0 right-3 left-3 h-1.5', cursor: 'ns-resize' },
  s: { clases: 'right-3 bottom-0 left-3 h-1.5', cursor: 'ns-resize' },
  w: { clases: 'top-3 bottom-3 left-0 w-1.5', cursor: 'ew-resize' },
  e: { clases: 'top-3 right-0 bottom-3 w-1.5', cursor: 'ew-resize' },
  nw: { clases: 'top-0 left-0 size-3', cursor: 'nwse-resize' },
  ne: { clases: 'top-0 right-0 size-3', cursor: 'nesw-resize' },
  sw: { clases: 'bottom-0 left-0 size-3', cursor: 'nesw-resize' },
  se: { clases: 'right-0 bottom-0 size-3', cursor: 'nwse-resize' }
}

export function PanelFlotante({
  panel,
  vista,
  activo,
  onMover,
  onEstirar,
  onSoltar,
  onTocar,
  onCerrar,
  onMaximizar,
  maximizada,
  icono,
  children
}: {
  panel: PanelDelLienzo
  vista: ViewportTransform
  activo: boolean
  /** Delta acumulado desde donde empezó el gesto, en coordenadas del plano. */
  onMover: (dx: number, dy: number) => void
  onEstirar: (borde: ResizeHandle, dx: number, dy: number) => void
  /** Se soltó: es cuando se apagan las guías y se guarda la disposición. */
  onSoltar: () => void
  onTocar: () => void
  onCerrar: () => void
  /** Agrandar la ventana a todo lo que se ve, o devolverla a donde estaba. */
  onMaximizar: () => void
  /** Si esta ventana está maximizada: cambia el ícono y lo que dice el botón. */
  maximizada: boolean
  icono: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  // Desde dónde arrancó el gesto: los deltas van contra ese punto y no contra el cuadro
  // anterior, así el imán no arrastra el error de cada paso.
  const desde = useRef<{ x: number; y: number } | null>(null)

  const agarrar = useCallback((evento: React.PointerEvent) => {
    desde.current = { x: evento.clientX, y: evento.clientY }
    evento.currentTarget.setPointerCapture(evento.pointerId)
    evento.preventDefault()
    evento.stopPropagation()
  }, [])

  const soltar = useCallback(
    (evento: React.PointerEvent) => {
      if (desde.current) {
        desde.current = null
        onSoltar()
      }
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId)
      }
    },
    [onSoltar]
  )

  const alBajarEnLaCabecera = useCallback(
    (evento: React.PointerEvent) => {
      // Solo el botón principal, y no desde los botones de la cabecera.
      if (evento.button !== 0 || (evento.target as HTMLElement).closest('button')) {
        return
      }
      onTocar()
      agarrar(evento)
    },
    [agarrar, onTocar]
  )

  const alMoverLaCabecera = useCallback(
    (evento: React.PointerEvent) => {
      const inicio = desde.current
      if (!inicio) {
        return
      }
      onMover((evento.clientX - inicio.x) / vista.zoom, (evento.clientY - inicio.y) / vista.zoom)
    },
    [onMover, vista.zoom]
  )

  const alBajarEnElBorde = useCallback(
    (borde: ResizeHandle) => (evento: React.PointerEvent) => {
      if (evento.button !== 0) {
        return
      }
      onTocar()
      agarrar(evento)
      ;(evento.currentTarget as HTMLElement).dataset.borde = borde
    },
    [agarrar, onTocar]
  )

  const alMoverElBorde = useCallback(
    (evento: React.PointerEvent) => {
      const inicio = desde.current
      const borde = (evento.currentTarget as HTMLElement).dataset.borde as ResizeHandle | undefined
      if (!inicio || !borde) {
        return
      }
      onEstirar(
        borde,
        (evento.clientX - inicio.x) / vista.zoom,
        (evento.clientY - inicio.y) / vista.zoom
      )
    },
    [onEstirar, vista.zoom]
  )

  const enPantalla = worldRectToScreen(vista, panel.rect)
  const px = (medida: number): number => medida * vista.zoom
  return (
    // La forma sale de Deska, medida con CDP sobre la app (01/11; el informe está en el
    // scratchpad, `deska-rea/`): radio 28 afuera, el cuerpo casi negro y neutro —no el gris del
    // tema— al 97 %, para que el cuadro del fondo se adivine abajo.
    //
    // La sombra son CUATRO capas y eso no es adorno: es lo que separa una ventana del fondo sin
    // dibujarle un borde. Un anillo interior casi invisible pega el canto, una sombra de contacto
    // de 2 px la apoya, y dos difusas de 24 y 56 px le dan el aire. Con una sola sombra —lo que
    // tenía— la ventana se veía pegada con cinta sobre la foto.
    //
    // Y la de adelante no lleva un borde más claro: lleva un HALO del acento, que es cómo Deska
    // dice «esta es la que estás usando».
    <div
      className="absolute flex flex-col overflow-hidden"
      style={{
        left: enPantalla.x,
        top: enPantalla.y,
        width: enPantalla.width,
        height: enPantalla.height,
        borderRadius: px(28),
        background: 'color-mix(in srgb, var(--color-lienzo-ventana) 97%, transparent)',
        transition: 'box-shadow 120ms var(--lienzo-ease, ease-out)',
        boxShadow: [
          `inset 0 0 0 ${px(1)}px var(--lienzo-hairline, rgba(238,241,245,0.06))`,
          activo ? `0 0 0 ${px(2)}px var(--color-lienzo-halo)` : null,
          `0 ${px(1)}px ${px(2)}px rgba(0,0,0,0.25)`,
          `0 ${px(8)}px ${px(24)}px rgba(0,0,0,0.3)`,
          activo
            ? `0 ${px(16)}px ${px(40)}px rgba(0,0,0,0.5), 0 ${px(32)}px ${px(64)}px rgba(0,0,0,0.45)`
            : `0 ${px(24)}px ${px(56)}px rgba(0,0,0,0.4)`
        ]
          .filter(Boolean)
          .join(', ')
      }}
      onPointerDownCapture={onTocar}
      role="group"
      aria-label={panel.titulo}
    >
      <div
        onPointerDown={alBajarEnLaCabecera}
        onPointerMove={alMoverLaCabecera}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onDoubleClick={onMaximizar}
        className="flex flex-none cursor-grab items-center active:cursor-grabbing"
        style={{ height: px(CHROME_DE_LA_VENTANA.cabecera), gap: px(10), paddingInline: px(14) }}
      >
        <span
          className="grid flex-none place-items-center rounded-md bg-muted/60 text-muted-foreground"
          style={{ width: px(24), height: px(24) }}
        >
          {icono}
        </span>
        <span className="flex min-w-0 flex-col justify-center">
          <span className="truncate leading-tight font-medium" style={{ fontSize: px(13) }}>
            {panel.titulo}
          </span>
          {panel.subtitulo ? (
            <span
              className="truncate leading-tight text-muted-foreground"
              style={{ fontSize: px(11) }}
            >
              {panel.subtitulo}
            </span>
          ) : null}
        </span>
        {/* Maximizar y cerrar. Maximizar agranda la ventana a todo lo que se ve y la devuelve a
            donde estaba al tocarlo de nuevo: con seis ventanas en el plano, leer un diff o una
            terminal pide la pantalla entera por un rato y después volver a lo de antes. Doble
            clic en la cabecera hace lo mismo, que es lo que uno prueba primero. */}
        <button
          type="button"
          onClick={onMaximizar}
          aria-label={(maximizada
            ? translate('canvas.shrinkWindow', 'Shrink {name}')
            : translate('canvas.growWindow', 'Grow {name}')
          ).replace('{name}', panel.titulo)}
          title={
            maximizada
              ? translate('canvas.restoreSize', 'Back to the previous size')
              : translate('canvas.maximize', 'Fill the whole view')
          }
          className="ml-auto grid flex-none place-items-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          style={{ width: px(24), height: px(24) }}
        >
          {maximizada ? (
            <Minimize2 aria-hidden="true" style={{ width: px(13), height: px(13) }} />
          ) : (
            <Maximize2 aria-hidden="true" style={{ width: px(13), height: px(13) }} />
          )}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={translate('canvas.closeWindow', 'Close {name}').replace(
            '{name}',
            panel.titulo
          )}
          className="grid flex-none place-items-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          style={{ width: px(24), height: px(24) }}
        >
          <X aria-hidden="true" style={{ width: px(14), height: px(14) }} />
        </button>
      </div>

      {/* El contenido en su propia caja, con el radio de adentro (28 − 16 = 12, como en Deska) y
          pegada a los tres bordes de abajo: el marco oscuro que queda alrededor es lo que hace
          que una terminal o una consola se lean como algo puesto sobre la ventana y no como la
          ventana misma. */}
      <div
        className="min-h-0 flex-1 overflow-hidden bg-[var(--color-lienzo-contenido)]"
        style={{
          marginInline: px(CHROME_DE_LA_VENTANA.margen),
          marginBottom: px(CHROME_DE_LA_VENTANA.margen),
          borderRadius: px(12)
        }}
      >
        {children}
      </div>

      {/* Los bordes van ÚLTIMOS y por encima del cuerpo: adentro hay un webview, que es otro
          documento y se queda con el puntero apenas entra. */}
      {RESIZE_HANDLES.map((borde) => (
        <div
          key={borde}
          onPointerDown={alBajarEnElBorde(borde)}
          onPointerMove={alMoverElBorde}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          className={cn('absolute z-10', DONDE_AGARRA[borde].clases)}
          style={{ cursor: DONDE_AGARRA[borde].cursor }}
        />
      ))}
    </div>
  )
}
