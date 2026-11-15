import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * El botón de la consola, uno solo para todas las vistas (Nico, 28/10: «falta mucha prolijidad»).
 * Antes había primarios de 24, 32 y 36 px y constantes de clases copiadas en cada vista.
 *
 * Siempre pill y con el «presionable» (baja un píxel y vuelve con resorte). Variantes: default
 * (la acción de la vista), secondary (tonal, lo demás), ghost (lo que acompaña) y destructive.
 * Tamaños: 32 por defecto, 36 (lg) para la acción principal de una vista, 28 (sm) adentro de una fila.
 */
const buttonVariants = cva(
  "presionable inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-murio/12 text-murio hover:bg-murio/20",
        outline: "bg-secondary text-secondary-foreground hover:bg-accent",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 text-[13px]",
        sm: "h-7 px-3 text-[12px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 px-4 text-[13px]",
        xs: "h-6 px-2.5 text-[12px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // Un botón sin type adentro de un form lo manda: por defecto, ninguno.
      {...(asChild ? {} : { type: type ?? "button" })}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
