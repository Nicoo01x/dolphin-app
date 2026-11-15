import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { coloresDeEscena } from "@/lib/embebida";

/**
 * El mar de Dolphin, en canvas 2D: el fondo de puntos que ondula. El
 * delfín que salta por encima vive en Delfin.tsx y usa el mismo lienzo.
 *
 * Reemplaza al DottedSurface de Three.js: el mismo mar de puntos en
 * perspectiva, sin bajar 746 KB para dibujarlo. Se apaga con
 * prefers-reduced-motion y cuando no se ve (otra pestaña, fuera de
 * pantalla): es ambiente, no contenido.
 */

// Una sola consulta, no una por cuadro.
const movimientoReducido = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
export const quieto = () => movimientoReducido?.matches === true;

/**
 * Un canvas al tamaño de su caja, nítido en pantallas de alta densidad.
 * Devuelve también `redibujar`, para cuando lo que se dibuja llega después
 * (con movimiento reducido no hay bucle que lo levante solo).
 */
export function useLienzo(dibujar: (ctx: CanvasRenderingContext2D, ancho: number, alto: number, t: number) => void, animar = true) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujarRef = useRef(dibujar);
  dibujarRef.current = dibujar;
  const redibujar = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let ancho = 0;
    let alto = 0;
    let marco = 0;
    let visible = true;
    const desde = performance.now();

    const medir = () => {
      const caja = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = caja.width;
      alto = caja.height;
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const cuadro = () => {
      marco = 0;
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, ancho, alto);
      dibujarRef.current(ctx, ancho, alto, (performance.now() - desde) / 1000);
      if (animar && !quieto()) marco = requestAnimationFrame(cuadro);
    };
    const seguir = () => {
      if (!marco) marco = requestAnimationFrame(cuadro);
    };
    redibujar.current = seguir;

    medir();
    const tamano = new ResizeObserver(() => {
      medir();
      seguir();
    });
    tamano.observe(canvas);
    const vista = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      if (visible) seguir();
    });
    vista.observe(canvas);
    document.addEventListener("visibilitychange", seguir);
    seguir();

    return () => {
      cancelAnimationFrame(marco);
      tamano.disconnect();
      vista.disconnect();
      document.removeEventListener("visibilitychange", seguir);
      redibujar.current = () => {};
    };
  }, [animar]);

  return { ref, redibujar: () => redibujar.current() };
}

/** El mar de fondo: puntos en perspectiva que ondulan despacio. */
export function MarDeSimbolos({ className, opacity = 0.3 }: { className?: string; opacity?: number }) {
  const { ref } = useLienzo((ctx, ancho, alto, t) => {
    const columnas = 46;
    const filas = 34;
    const horizonte = alto * 0.5;
    ctx.fillStyle = coloresDeEscena().punto;
    for (let fz = 0; fz < filas; fz++) {
      const z = fz / (filas - 1); // 0 cerca, 1 lejos
      const perspectiva = 1 / (1 + z * 2.6);
      const y0 = horizonte + Math.pow(1 - z, 1.6) * (alto - horizonte);
      for (let fx = 0; fx < columnas; fx++) {
        const x = fx / (columnas - 1) - 0.5;
        const ola = Math.sin(fx * 0.32 + t * 0.9) * 0.5 + Math.sin(fz * 0.45 + t * 0.7) * 0.5;
        const sx = ancho / 2 + x * ancho * 1.25 * perspectiva;
        const sy = y0 - ola * 14 * perspectiva;
        const lado = 1.1 + 1.6 * perspectiva;
        ctx.globalAlpha = 0.18 + 0.82 * perspectiva * (1 - z * 0.4);
        ctx.fillRect(sx - lado / 2, sy - lado / 2, lado, lado);
      }
    }
    ctx.globalAlpha = 1;
  });
  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} style={{ opacity }} />;
}
