"use client";

import { motion } from "motion/react";

/**
 * La fila de pestañas de la portada y del ciclo: una pill tonal con la marca que se desliza a la
 * elegida. Cambia sólo cuando la persona toca; no hay carrusel que avance solo.
 *
 * Con flechas izquierda/derecha se pasa a la pestaña vecina, como pide el patrón de pestañas de
 * ARIA; Tab entra y sale de la fila de una vez.
 */
export function Pestanas<T extends string>({
  id,
  etiqueta,
  opciones,
  elegida,
  onElegir,
}: {
  readonly id: string;
  readonly etiqueta: string;
  readonly opciones: readonly { readonly id: T; readonly nombre: string }[];
  readonly elegida: T;
  readonly onElegir: (id: T) => void;
}) {
  const mover = (desde: number, paso: number) => {
    const siguiente = opciones[(desde + paso + opciones.length) % opciones.length];
    if (!siguiente) return;
    onElegir(siguiente.id);
    document.getElementById(`${id}-pestana-${siguiente.id}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className="sin-barra flex max-w-full overflow-x-auto rounded-full bg-lienzo-3 p-1"
    >
      {opciones.map((o, i) => {
        const activa = o.id === elegida;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`${id}-pestana-${o.id}`}
            aria-selected={activa}
            aria-controls={`${id}-panel`}
            tabIndex={activa ? 0 : -1}
            onClick={() => onElegir(o.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") mover(i, 1);
              if (e.key === "ArrowLeft") mover(i, -1);
            }}
            className="relative h-10 flex-none cursor-pointer rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-transform duration-100 active:scale-[0.97] sm:px-5"
          >
            {activa && (
              <motion.span
                layoutId={`${id}-marca`}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(11_13_16/0.08),0_4px_12px_-4px_rgb(11_13_16/0.16)]"
              />
            )}
            <span className={`relative transition-colors duration-150 ${activa ? "text-espuma" : "text-tenue hover:text-espuma"}`}>
              {o.nombre}
            </span>
          </button>
        );
      })}
    </div>
  );
}
