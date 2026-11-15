import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Una casilla de verificación del tema. El input nativo queda (teclado,
 * lector de pantalla, formularios), pero oculto: lo que se ve es la caja
 * nuestra, y lo que se toca es la etiqueta entera, que con el dedo mide
 * 44 px. La casilla nativa medía 16 y en oscuro era un cuadrado blanco.
 */
export function Casilla({
  marcada,
  alCambiar,
  children,
  className = "",
}: {
  marcada: boolean;
  alCambiar: (marcada: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-h-9 cursor-pointer items-center gap-2 pointer-coarse:min-h-11 ${className}`}>
      <input type="checkbox" checked={marcada} onChange={(ev) => alCambiar(ev.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="border-input bg-secondary peer-checked:border-foreground peer-checked:bg-foreground peer-focus-visible:ring-ring peer-focus-visible:ring-offset-background flex size-4 flex-none items-center justify-center rounded-[5px] border transition-colors duration-100 peer-checked:[&_svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2"
      >
        <Check className="text-background size-3 opacity-0" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </label>
  );
}
