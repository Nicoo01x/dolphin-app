"use client";

import { motion } from "motion/react";
import { useQuieto } from "@/lib/quieto";

/**
 * Una rosa de los vientos grabada, en vectores finos: 32 puntas (las 8 principales llenas a medias,
 * como en las cartas antiguas), anillos con la graduación de 360° y los nombres de los cuatro vientos.
 * Se traza al aparecer y gira muy despacio. En currentColor.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const punto = (ang: number, radio: number) => [r2(Math.sin(ang) * radio), r2(-Math.cos(ang) * radio)] as const;

export function Rosa({ className, girar = true, trazar = true, radio = 420 }: { className?: string; girar?: boolean; trazar?: boolean; radio?: number }) {
  const quieto = useQuieto();
  const R = radio;
  // Las puntas: 8 principales largas, 8 medias, 16 cuartas cortas.
  const puntas = Array.from({ length: 32 }, (_, i) => {
    const ang = (i / 32) * Math.PI * 2;
    const nivel = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
    const largo = R * [0.86, 0.62, 0.42][nivel]!;
    const ancho = (Math.PI * 2) / 32 * [0.95, 0.8, 0.7][nivel]!;
    const base = R * 0.09;
    const [px, py] = punto(ang, largo);
    const [ax, ay] = punto(ang - ancho, base);
    const [bx, by] = punto(ang + ancho, base);
    return { i, nivel, px, py, ax, ay, bx, by };
  }).sort((a, b) => b.nivel - a.nivel); // las cortas debajo
  const marcas = Array.from({ length: 72 }, (_, i) => {
    const ang = (i / 72) * Math.PI * 2;
    const largo = i % 2 === 0 ? 14 : 7;
    const [x1, y1] = punto(ang, R * 0.94);
    const [x2, y2] = punto(ang, R * 0.94 - largo);
    return { i, x1, y1, x2, y2 };
  });
  // El destino va siempre: si la preferencia llega después de montar (llega al hidratar), sacar
  // `animate` dejaba el trazo congelado donde estaba, casi invisible. Con quieto, salta al final.
  const dibujo = (d: number) =>
    trazar
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: quieto ? { duration: 0 } : { duration: 2.2, delay: d, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {};

  return (
    <motion.svg
      viewBox={`${-R - 40} ${-R - 40} ${2 * R + 80} ${2 * R + 80}`}
      className={className}
      aria-hidden="true"
      animate={girar && !quieto ? { rotate: 360 } : undefined}
      transition={{ duration: 360, repeat: Infinity, ease: "linear" }}
    >
      <g fill="none" stroke="currentColor">
        <motion.circle r={R * 0.94} strokeWidth="1.2" {...dibujo(0)} />
        <motion.circle r={R * 0.94 - 18} strokeWidth="0.6" {...dibujo(0.1)} />
        <motion.circle r={R * 0.3} strokeWidth="0.6" strokeDasharray="2 5" {...dibujo(0.3)} />
        <motion.circle r={R * 0.1} strokeWidth="0.8" {...dibujo(0.4)} />
        {marcas.map((m) => (
          <line key={m.i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} strokeWidth="0.7" opacity="0.8" />
        ))}
      </g>
      {/* Cada punta: una mitad llena y la otra hueca, como el grabado de una carta. */}
      {puntas.map((p) => (
        <g key={p.i} stroke="currentColor" strokeWidth={p.nivel === 0 ? 1.1 : 0.7} strokeLinejoin="round">
          <motion.path d={`M0 0 L${p.ax} ${p.ay} L${p.px} ${p.py} Z`} fill={p.nivel === 0 ? "currentColor" : "var(--color-lienzo)"} fillOpacity={p.nivel === 0 ? 0.85 : 1} {...dibujo(0.5 + p.nivel * 0.2)} />
          <motion.path d={`M0 0 L${p.bx} ${p.by} L${p.px} ${p.py} Z`} fill="var(--color-lienzo)" {...dibujo(0.5 + p.nivel * 0.2)} />
        </g>
      ))}
      <circle r={R * 0.035} fill="currentColor" />
      {(["N", "E", "S", "O"] as const).map((v, i) => {
        const [x, y] = punto((i / 4) * Math.PI * 2, R * 1.02);
        return (
          <text key={v} x={x} y={y} dy="0.35em" textAnchor="middle" fill="currentColor" fontFamily="var(--font-titular)" fontSize={R * 0.11} fontStyle="italic">
            {v}
          </text>
        );
      })}
    </motion.svg>
  );
}
