"use client";

import { motion } from "motion/react";
import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Un camino curvo entre dos nodos de verdad de la carta, con un pulso que lo recorre.
 *
 * Adaptado de «Klyv Animated Beam» (21st.dev, MIT): toma refs y no coordenadas, así que se vuelve a
 * medir con cada cambio de tamaño y aguanta un corte responsive o un cambio de fuente. El pulso es
 * una sola animación de `stroke-dashoffset` en CSS sobre una copia del camino: no hay JS por cuadro
 * y sigue la curva exacta porque ES la curva.
 *
 * Lo que cambió para Dolphin: el trazo es del tono de las superficies (no una línea gris dura), el
 * pulso va en el único acento (`electrico`), el camino se DIBUJA al entrar en vista (`pathLength`) y
 * se enciende cuando la persona apunta a uno de sus dos extremos. Con movimiento reducido no hay
 * pulso y el camino aparece ya dibujado (`.rumbo-pulso` en globals.css).
 */
export function Rumbo({
  contenedor,
  desde,
  hasta,
  curva = 0,
  duracion = 2.6,
  retraso = 0,
  visible,
  encendido,
}: {
  readonly contenedor: RefObject<HTMLElement | null>;
  readonly desde: RefObject<HTMLElement | null>;
  readonly hasta: RefObject<HTMLElement | null>;
  /** Cuánto se arquea, en px. Negativo arquea para el otro lado; 0 es recta. */
  readonly curva?: number;
  readonly duracion?: number;
  readonly retraso?: number;
  /** La carta entró en vista: se dibuja el camino. */
  readonly visible: boolean;
  /** La persona apunta a uno de sus extremos. */
  readonly encendido: boolean;
}) {
  const [geo, setGeo] = useState<{ ancho: number; alto: number; d: string; largo: number } | null>(null);

  useEffect(() => {
    const caja = contenedor.current;
    const a = desde.current;
    const b = hasta.current;
    if (!caja || !a || !b) return;

    const medir = () => {
      const c = caja.getBoundingClientRect();
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      // Sale del borde derecho del nodo de origen y llega al borde izquierdo del destino: un camino
      // que arranca en el centro de una etiqueta la tacha.
      const inicio = { x: ra.right - c.left, y: ra.top - c.top + ra.height / 2 };
      const fin = { x: rb.left - c.left, y: rb.top - c.top + rb.height / 2 };
      const medioX = (inicio.x + fin.x) / 2;
      const medioY = (inicio.y + fin.y) / 2;
      const dx = fin.x - inicio.x;
      const dy = fin.y - inicio.y;
      const tramo = Math.hypot(dx, dy) || 1;
      const cx = medioX + (-dy / tramo) * curva;
      const cy = medioY + (dx / tramo) * curva;
      const patas = Math.hypot(cx - inicio.x, cy - inicio.y) + Math.hypot(fin.x - cx, fin.y - cy);
      setGeo({
        ancho: c.width,
        alto: c.height,
        d: `M ${inicio.x},${inicio.y} Q ${cx},${cy} ${fin.x},${fin.y}`,
        largo: (tramo + patas) / 2,
      });
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    observador.observe(a);
    observador.observe(b);
    return () => observador.disconnect();
  }, [contenedor, desde, hasta, curva]);

  if (!geo) return null;
  const total = Math.round(geo.largo);
  const pulso = 44;

  return (
    <svg
      aria-hidden
      width={geo.ancho}
      height={geo.alto}
      viewBox={`0 0 ${geo.ancho} ${geo.alto}`}
      fill="none"
      className="pointer-events-none absolute top-0 left-0"
    >
      <motion.path
        d={geo.d}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: visible ? 1 : 0 }}
        transition={{ duration: 0.9, delay: retraso * 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={{
          stroke: encendido ? "var(--color-electrico)" : "var(--color-lienzo-4)",
          strokeWidth: encendido ? 2 : 1.5,
          transition: "stroke 160ms var(--ease-firma), stroke-width 160ms var(--ease-firma)",
        }}
      />
      {visible && (
        <path
          className="rumbo-pulso"
          d={geo.d}
          stroke="var(--color-electrico)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${pulso} ${total}`}
          style={
            {
              "--rumbo-viaje": -(total + pulso),
              animation: `rumbo ${duracion}s linear infinite`,
              animationDelay: `${0.9 + retraso}s`,
              opacity: encendido ? 1 : 0.7,
            } as CSSProperties
          }
        />
      )}
    </svg>
  );
}
