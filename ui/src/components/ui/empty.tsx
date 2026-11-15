/**
 * Empty — vendor adaptado.
 *
 * Origen: «Empty» de 21st.dev (@cnippet-dev): un bloque componible para
 * cuando no hay nada que mostrar —Empty, EmptyHeader, EmptyMedia,
 * EmptyTitle, EmptyDescription, EmptyContent—, sin dependencias más que
 * cva y cn. Adaptaciones nuestras: tokens del tema (superficie
 * `secondary`, anillo `border`, título en Satoshi), tamaños de la consola
 * (13 px de texto) y sin las sombras internas del original, que en el
 * fondo oscuro no se ven. La variante `icon` ya no lleva la cajita ni las
 * fichas inclinadas de atrás: un ícono metido en una caja es de las cosas
 * que Nico marcó como hechas por IA (12/10). Queda el ícono solo, grande y
 * apagado.
 */

import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "@/lib/utils";

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "text-muted-foreground [&_svg:not([class*='size-'])]:size-7",
      },
    },
  },
);

export function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center text-balance", className)}
      data-slot="empty"
      {...props}
    />
  );
}

export function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex max-w-md flex-col items-center text-center", className)} data-slot="empty-header" {...props} />;
}

export function EmptyMedia({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div className={cn("relative mb-3", className)} data-slot="empty-media" data-variant={variant} {...props}>
      <div className={cn(emptyMediaVariants({ variant }))}>{children}</div>
    </div>
  );
}

/** `as`: cuando el vacío ES la página, su título es el h1. */
export function EmptyTitle({ className, as: Etiqueta = "h2", ...props }: React.ComponentProps<"h2"> & { as?: "h1" | "h2" | "h3" }) {
  return (
    // En la escala de la consola (ver Pagina.tsx): un vacío se titula como una sección, 15.
    // Si la vista lo pide como título de vista, va ese solo: las dos clases juntas se pisan por orden de la hoja.
    <Etiqueta className={cn(!className?.includes("titulo-vista") && "titulo-seccion", className)} data-slot="empty-title" {...props} />
  );
}

export function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-muted-foreground mt-2 max-w-[52ch] text-[13px] leading-relaxed [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground",
        className,
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

export function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full max-w-md min-w-0 flex-col items-center gap-3 text-[13px] text-balance", className)}
      data-slot="empty-content"
      {...props}
    />
  );
}

export default Empty;
