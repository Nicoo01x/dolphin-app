import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

/** Feedback de presión: baja 1 px y se achica a .97 al tocarlo, y vuelve con resorte. Adaptado de
 * «Press Depth» de 21st.dev. Sin él con «reducir movimiento». */
const PRESION =
  'transition-[transform,background-color,color] duration-[180ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] active:translate-y-px active:scale-[0.97] active:duration-[60ms] motion-reduce:transition-none motion-reduce:active:translate-y-0 motion-reduce:active:scale-100'

/**
 * Las piezas de adentro de un aviso, para que los cuatro se lean como de la misma familia: el
 * visual arriba en su caja tonal, el título corto, una línea de texto, y los botones a la derecha.
 *
 * Radios anidados: la ventana es de 28, la caja del visual va a 10 del borde y por eso es de 18,
 * y los botones son pastilla. Sin bordes ni divisores: la caja se separa por tono.
 */

export function BotonDeAviso({
  principal = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly principal?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60',
        PRESION,
        principal
          ? 'bg-foreground text-background hover:bg-foreground/88'
          : 'bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.11]',
        className
      )}
    />
  )
}

function BotonAhoraNo({ onClick }: { readonly onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={translate('auto.components.dolphin.avisos.ahoraNo', 'Not now')}
      className={cn(
        PRESION,
        '-mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.11] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  )
}

export function CuerpoDelAviso({
  visual,
  titulo,
  onAhoraNo,
  botones,
  children
}: {
  readonly visual?: ReactNode
  readonly titulo: string
  /** La ×: lo mismo que arrastrar la ventana afuera. */
  readonly onAhoraNo: () => void
  readonly botones: ReactNode
  readonly children?: ReactNode
}): React.JSX.Element {
  return (
    <>
      {visual ? (
        <div
          aria-hidden="true"
          className="m-2.5 mb-0 h-[min(15rem,34vh)] shrink overflow-hidden rounded-[18px] bg-[color-mix(in_srgb,var(--foreground)_6%,var(--popover))]"
        >
          {visual}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pt-5 pb-6 scrollbar-sleek">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="font-display text-[17px] leading-snug font-medium text-foreground">
              {titulo}
            </h2>
            {children ? (
              <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
            ) : null}
          </div>
          <BotonAhoraNo onClick={onAhoraNo} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">{botones}</div>
      </div>
    </>
  )
}
