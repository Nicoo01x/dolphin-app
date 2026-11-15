import { forwardRef } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Las piezas que comparten todas las vistas de la consola, para que se vean de una misma mano
 * (Nico, 28/10: «falta mucha prolijidad»). Antes cada vista tenía su padding, su tamaño de título
 * (20, 26, 28, 34…) y su forma de mostrar un error.
 *
 * La escala: título de vista 22 · título de sección 15 · texto 13 · dato chico 12. El contenedor:
 * 20 px de aire a los costados (16 en el teléfono), igual en todas.
 */

/** El color de un estado para `.con-tono` / `.punto-tono` (ver app.css): `style={conTono("var(--idea)")}`. */
export const conTono = (tono: string) => ({ "--tono": tono }) as React.CSSProperties;

/**
 * Hasta dónde se estira una vista.
 *
 * A 1180 px, en un monitor ancho la consola quedaba cortada al medio con el resto en negro (Nico,
 * 31/10: «todas las pantallas están como cortadas así a la derecha»). Ahora usa el ancho que haya,
 * con un tope para que en una pantalla enorme no quede una sola fila de widgets de punta a punta.
 * Lo que no se estira es el TEXTO: cada bloque corta en su propia medida de lectura.
 */
export const ANCHO_DE_VISTA = "max-w-[1760px]";

/** El cuerpo de una vista: desplazable, con el mismo aire en todas. */
export function Pagina({ children, className, ...resto }: React.ComponentProps<"main">) {
  return (
    <main className={cn("flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pt-5 pb-10 max-[640px]:px-4", className)} {...resto}>
      {children}
    </main>
  );
}

/** La cabecera de una vista: el título y, a la derecha, lo que se hace en ella. */
export const Cabecera = forwardRef<HTMLHeadingElement, { titulo: React.ReactNode; detalle?: React.ReactNode; children?: React.ReactNode; className?: string }>(
  function Cabecera({ titulo, detalle, children, className }, ref) {
    return (
      <header className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 ref={ref} tabIndex={-1} className="titulo-vista truncate">
            {titulo}
          </h1>
          {detalle && <span className="text-muted-foreground text-[13px] whitespace-nowrap tabular-nums">{detalle}</span>}
        </div>
        {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
      </header>
    );
  },
);

/** Un título de sección adentro de una vista. */
export function Seccion({ titulo, extra, children, className }: { titulo: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <h2 className="titulo-seccion flex items-baseline gap-2">
        {titulo}
        {extra !== undefined && <span className="text-muted-foreground font-sans text-[13px] font-normal tabular-nums">{extra}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Algo salió mal: qué pasó y, si es de carga, la forma de reintentar. Siempre igual en todas las vistas. */
export function Aviso({ children, alReintentar, className }: { children: React.ReactNode; alReintentar?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("bg-murio/10 text-murio flex max-w-[72ch] items-center gap-3 self-start rounded-2xl px-3.5 py-2.5 text-[13px]", className)}>
      <span className="min-w-0 flex-1">{children}</span>
      {alReintentar && (
        <button type="button" onClick={alReintentar} className="presionable hover:bg-murio/15 inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 font-medium">
          <RotateCw aria-hidden="true" className="size-3.5" /> Reintentar
        </button>
      )}
    </div>
  );
}
