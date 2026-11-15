import type { KeyboardEvent } from "react";

/**
 * El teclado de un grupo de pestañas, como lo espera un lector de pantalla: las flechas pasan de
 * una a otra (y vuelven al principio), Inicio y Fin van a los extremos, y el foco acompaña a la
 * elegida. Tab entra y sale del grupo de una vez: solo la elegida está en el orden de tabulación.
 */
export function teclasDePestanas(cantidad: number, activa: number, elegir: (i: number) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const destino =
      // Arriba y abajo también: hay grupos verticales (los bots).
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (activa + 1) % cantidad
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (activa - 1 + cantidad) % cantidad
      : e.key === "Home" ? 0
      : e.key === "End" ? cantidad - 1
      : null;
    if (destino === null) return;
    e.preventDefault();
    elegir(destino);
    const pestanas = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
    pestanas[destino]?.focus();
  };
}
