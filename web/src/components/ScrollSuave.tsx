"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { useQuieto } from "@/lib/quieto";

/** Scroll suave con inercia (Lenis). Con prefers-reduced-motion queda el scroll de siempre. */
export function ScrollSuave() {
  const quieto = useQuieto();
  useEffect(() => {
    if (quieto) return;
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    let raf = 0;
    const paso = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [quieto]);
  return null;
}
