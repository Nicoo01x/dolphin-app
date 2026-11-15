"use client";

import { useEffect, useState } from "react";

/**
 * ¿La persona pidió menos movimiento? Igual que useReducedMotion de Motion, pero arranca en false
 * en el servidor Y en el primer render del navegador: así los dos dibujan lo mismo y React no
 * se queja de la hidratación. Recién después de montar se lee la preferencia de verdad.
 */
export function useQuieto(): boolean {
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setQuieto(mq.matches);
    const cambio = () => setQuieto(mq.matches);
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);
  return quieto;
}
