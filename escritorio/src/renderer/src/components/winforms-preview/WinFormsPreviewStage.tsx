import { useRef, useState, type CSSProperties } from 'react'
import { controlEnPunto, tipoCorto } from '../../../../shared/winforms/winforms-controls'
import type { WinFormsControl } from '../../../../shared/winforms/winforms-preview-types'
import { cn } from '@/lib/class-names'

export type CuadroDelFormulario = { src: string; ancho: number; alto: number }

/** La caja de un control en porcentajes del cuadro: así sigue a la imagen cuando se achica. */
function cajaDe(control: WinFormsControl, cuadro: CuadroDelFormulario): CSSProperties {
  return {
    left: `${(control.x / cuadro.ancho) * 100}%`,
    top: `${(control.y / cuadro.alto) * 100}%`,
    width: `${(control.w / cuadro.ancho) * 100}%`,
    height: `${(control.h / cuadro.alto) * 100}%`
  }
}

/**
 * El formulario vivo y la capa que marca controles, como el selector del navegador: una caja sobre el
 * control y una etiqueta con nombre, tipo y tamaño; la selección usa el color primario. El cuadro está en píxeles físicos
 * (el host es DPI-aware), así que se muestra a 1:1 dividiendo por la densidad de la pantalla.
 */
export function WinFormsPreviewStage({
  cuadro,
  controles,
  seleccionado,
  onSeleccionar
}: {
  cuadro: CuadroDelFormulario
  controles: readonly WinFormsControl[]
  seleccionado: WinFormsControl | null
  onSeleccionar: (control: WinFormsControl | null) => void
}): React.JSX.Element {
  const imagenRef = useRef<HTMLImageElement>(null)
  const [bajo, setBajo] = useState<WinFormsControl | null>(null)
  const densidad = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

  const controlBajoPuntero = (clientX: number, clientY: number): WinFormsControl | null => {
    const imagen = imagenRef.current
    if (!imagen) {
      return null
    }
    const r = imagen.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) {
      return null
    }
    const x = ((clientX - r.left) / r.width) * cuadro.ancho
    const y = ((clientY - r.top) / r.height) * cuadro.alto
    return controlEnPunto(controles, x, y)
  }

  const resaltado = bajo && bajo.id !== seleccionado?.id ? bajo : null

  return (
    <div
      className="flex min-h-0 flex-1 items-start justify-center overflow-auto scrollbar-sleek bg-muted/40 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSeleccionar(null)
        }
      }}
    >
      <div
        className="relative shrink-0 cursor-crosshair select-none border border-border"
        style={{ width: cuadro.ancho / densidad, maxWidth: '100%' }}
        onMouseMove={(e) => {
          const control = controlBajoPuntero(e.clientX, e.clientY)
          setBajo((previo) => (previo?.id === control?.id ? previo : control))
        }}
        onMouseLeave={() => setBajo(null)}
        onClick={(e) => onSeleccionar(controlBajoPuntero(e.clientX, e.clientY))}
      >
        <img
          ref={imagenRef}
          src={cuadro.src}
          alt=""
          draggable={false}
          className="block h-auto w-full"
        />
        {resaltado ? <Marca control={resaltado} cuadro={cuadro} tipo="hover" /> : null}
        {seleccionado ? <Marca control={seleccionado} cuadro={cuadro} tipo="seleccion" /> : null}
      </div>
    </div>
  )
}

function Marca({
  control,
  cuadro,
  tipo
}: {
  control: WinFormsControl
  cuadro: CuadroDelFormulario
  tipo: 'hover' | 'seleccion'
}): React.JSX.Element {
  // La etiqueta va arriba de la caja salvo que el control toque el borde superior, y se alinea a la
  // derecha cuando el control está sobre el borde derecho: así no se sale del formulario.
  const etiquetaAbajo = control.y < 22
  const etiquetaDerecha = control.x + control.w > cuadro.ancho * 0.6
  return (
    <div
      className={cn(
        'pointer-events-none absolute rounded-[3px]',
        tipo === 'hover'
          ? 'border border-primary/70 bg-primary/5'
          : 'border-2 border-primary bg-primary/10'
      )}
      style={cajaDe(control, cuadro)}
    >
      <span
        className={cn(
          'absolute max-w-[280px] truncate whitespace-nowrap rounded-md px-2 py-0.5 text-2xs shadow-floating',
          etiquetaAbajo ? 'top-[calc(100%+4px)]' : 'bottom-[calc(100%+4px)]',
          etiquetaDerecha ? 'right-[-2px]' : 'left-[-2px]',
          tipo === 'hover'
            ? 'border border-border bg-popover text-popover-foreground'
            : 'bg-primary text-primary-foreground'
        )}
      >
        <span className="font-medium">{control.nombre || tipoCorto(control.tipo)}</span>
        <span className="opacity-70">
          {' '}
          {tipoCorto(control.tipo)} · {control.w}×{control.h}
        </span>
      </span>
    </div>
  )
}
