import type { ReactNode, RefObject } from 'react'
import * as DialogPrimitive from 'radix-ui/dialog'

/**
 * La ventana del aviso urgente, que sale encima de lo que haya. Es un diálogo de Radix y no un
 * `div` como las demás porque los modales de la app también lo son, y así entra a la misma pila:
 * el de abajo deja de atrapar el foco y de escuchar los clics de afuera (si no, tocar el aviso lo
 * cerraba), y cuando este se va, el de abajo sigue como estaba.
 *
 * Lo demás lo sigue haciendo la ventana de siempre: Escape y el clic en el velo los maneja el
 * arrastre, y el foco lo devuelve ella al elemento que lo tenía antes.
 */
export function VentanaUrgente({
  ventanaRef,
  titulo,
  className,
  children
}: {
  readonly ventanaRef: RefObject<HTMLDivElement | null>
  readonly titulo: string
  readonly className: string
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Content
        ref={ventanaRef}
        aria-describedby={undefined}
        className={className}
        onOpenAutoFocus={(evento) => {
          evento.preventDefault()
          ventanaRef.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(evento) => evento.preventDefault()}
        onEscapeKeyDown={(evento) => evento.preventDefault()}
        onPointerDownOutside={(evento) => evento.preventDefault()}
      >
        <DialogPrimitive.Title className="sr-only">{titulo}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  )
}
