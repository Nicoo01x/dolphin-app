"use client";

import { motion } from "motion/react";
import { LaminaDeArchivo } from "./LaminaDeArchivo";
import { useQuieto } from "@/lib/quieto";

/**
 * Cómo funciona, como una carta de navegación: el pedido zarpa, el líder traza la ruta, cada
 * compañero navega sus propias aguas, el faro (el portón) deja pasar lo probado y lo que rebota
 * vuelve con el motivo. La bitácora guarda lo aprendido para el viaje siguiente. Un dibujo, no una
 * grilla de tarjetas; en el celular la misma carta se lee de arriba abajo.
 */

const PARADAS = [
  { nombre: "Tu pedido", texto: "Lo escribís en la terminal, la consola o Telegram." },
  { nombre: "El líder traza la ruta", texto: "Parte el pedido en tareas, estima lo que cuesta y espera tu «dale»." },
  { nombre: "La flota", texto: "Cada compañero trabaja a la vez, en su rama, su puerto y su base." },
  { nombre: "El portón", texto: "Tests, tipos, la app usada por cinco personas y la revisión de otro modelo." },
  { nombre: "Tu rama", texto: "Llega probada y revisable compañero por compañero." },
] as const;

function useTrazo() {
  const quieto = useQuieto();
  return (demora: number) => ({
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true, amount: 0.3 },
    transition: quieto ? { duration: 0 } : { duration: 1.4, delay: demora, ease: [0.22, 1, 0.36, 1] as const },
  });
}

/** Un barco de carta: un casco y una vela, chiquitos. */
function Barco({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-9 3 L9 3 L6 8 L-6 8 Z" fill="var(--color-espuma)" />
      <path d="M0 -10 L0 2 L8 2 Z" fill="var(--color-espuma)" opacity="0.85" />
      <path d="M-1 -8 L-1 2 L-7 2 Z" fill="var(--color-espuma)" opacity="0.5" />
    </g>
  );
}

/** El faro, con su haz. */
function Faro({ x, y, quieto }: { x: number; y: number; quieto: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* La luz del faro se apaga hacia afuera. Sin el degradé, y sin la caja de vidrio que antes
          tapaba la carta, el haz era un triángulo gris de bordes duros flotando sobre el fondo. */}
      <defs>
        <linearGradient id="haz-del-faro" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-espuma)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-espuma)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d="M0 -26 L120 -70 L120 18 Z"
        fill="url(#haz-del-faro)"
        initial={{ opacity: 0.06 }}
        animate={quieto ? { opacity: 0.1 } : { opacity: [0.05, 0.2, 0.05] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <path d="M-9 22 L-5 -18 L5 -18 L9 22 Z" fill="var(--color-espuma)" />
      <path d="M-6 -6 L6 -6 M-7 6 L7 6" stroke="var(--color-lienzo)" strokeWidth="3" />
      <rect x="-6" y="-30" width="12" height="11" rx="2" fill="var(--color-espuma)" />
      <path d="M-8 -30 L0 -38 L8 -30 Z" fill="var(--color-espuma)" />
    </g>
  );
}

function Ancla({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="var(--color-espuma)" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="0" cy="-14" r="4" />
      <path d="M0 -10 L0 14 M-8 -3 L8 -3 M-14 4 Q-12 14 0 14 Q12 14 14 4" />
    </g>
  );
}

function Etiqueta({ x, y, titulo, linea, ancla = "middle" }: { x: number; y: number; titulo: string; linea?: string; ancla?: "start" | "middle" | "end" }) {
  return (
    // Un halo del color del fondo detrás de cada letra: si una línea de la carta pasa por abajo, no se cruza con el texto.
    <text x={x} y={y} textAnchor={ancla} fill="var(--color-espuma)" stroke="var(--color-lienzo)" strokeWidth="6" strokeLinejoin="round" paintOrder="stroke">
      <tspan fontFamily="var(--font-titular)" fontSize="25">
        {titulo}
      </tspan>
      {linea && (
        <tspan x={x} dy="22" fontFamily="var(--font-texto)" fontSize="14" fill="var(--color-tinta)" fillOpacity={0.72}>
          {linea}
        </tspan>
      )}
    </text>
  );
}

function CartaAncha() {
  const trazo = useTrazo();
  const quieto = useQuieto();
  return (
    <svg viewBox="0 0 1120 470" className="h-auto w-full" aria-hidden="true">
      {/* La cuadrícula de la carta: meridianos y paralelos, apenas. */}
      <g stroke="var(--color-espuma)" strokeOpacity={0.06} strokeWidth="1">
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`m${i}`} x1={60 + i * 112} y1="20" x2={60 + i * 112} y2="450" />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <line key={`p${i}`} x1="20" y1={60 + i * 116} x2="1100" y2={60 + i * 116} />
        ))}
      </g>
      <g fill="none" stroke="var(--color-espuma)" strokeLinecap="round">
        {/* Del pedido al líder. */}
        <motion.path d="M92 235 L262 235" strokeWidth="1.6" {...trazo(0)} />
        {/* El líder abre tres rumbos, uno por compañero, que se juntan en el faro. */}
        <motion.path d="M298 235 C380 235 390 120 470 120 L640 120 C720 120 720 235 772 235" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.3)} />
        <motion.path d="M298 235 L772 235" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.4)} />
        <motion.path d="M298 235 C380 235 390 350 470 350 L640 350 C720 350 720 235 772 235" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.5)} />
        {/* Del faro a puerto. */}
        <motion.path d="M820 235 L985 235" strokeWidth="1.8" {...trazo(1.1)} />
        {/* Lo que rebota vuelve al agente con el motivo. */}
        <motion.path d="M800 336 C800 384 712 386 652 356" strokeWidth="1.3" strokeDasharray="2 6" opacity="0.8" {...trazo(1.3)} />
        {/* La bitácora: lo aprendido vuelve al líder para el próximo viaje. */}
        <motion.path d="M790 190 C770 40 330 40 286 205" strokeWidth="1.2" strokeDasharray="2 6" opacity="0.6" {...trazo(1.5)} />
      </g>
      <circle cx="80" cy="235" r="9" fill="var(--color-espuma)" />
      <g transform="translate(280 235)">
        <circle r="17" fill="none" stroke="var(--color-espuma)" strokeWidth="1.6" />
        <path d="M0 -24 L4 0 L0 24 L-4 0 Z M-24 0 L0 -4 L24 0 L0 4 Z" fill="var(--color-espuma)" />
      </g>
      <Barco x={560} y={113} />
      <Barco x={560} y={228} />
      <Barco x={560} y={343} />
      <Faro x={800} y={235} quieto={quieto} />
      <Ancla x={1004} y={237} />

      <Etiqueta x={80} y={290} titulo="Tu pedido" linea="terminal o Telegram" />
      <Etiqueta x={280} y={300} titulo="El líder" linea="parte y estima" />
      <Etiqueta x={520} y={412} titulo="La flota" linea="cada uno en su rama, su puerto y su base" />
      <Etiqueta x={800} y={300} titulo="El portón" linea="tests · tipos · pantalla · revisión" />
      <Etiqueta x={1004} y={290} titulo="Tu rama" linea="probada" />
      <text x={820} y={410} fontFamily="var(--font-titular)" fontSize="18" fill="var(--color-tinta)" fillOpacity={0.78}>
        lo que rebota vuelve con el motivo
      </text>
      <text x={540} y={58} textAnchor="middle" fontFamily="var(--font-titular)" fontSize="18" fill="var(--color-tinta)" fillOpacity={0.78}>
        la bitácora guarda lo aprendido para el próximo viaje
      </text>
    </svg>
  );
}

function CartaAngosta() {
  const trazo = useTrazo();
  const quieto = useQuieto();
  return (
    <svg viewBox="0 0 360 880" className="h-auto w-full" aria-hidden="true">
      <g fill="none" stroke="var(--color-espuma)" strokeLinecap="round">
        <motion.path d="M180 60 L180 190" strokeWidth="1.6" {...trazo(0)} />
        <motion.path d="M180 226 C180 300 70 300 70 380 L70 520 C70 600 180 600 180 660" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.3)} />
        <motion.path d="M180 226 L180 660" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.4)} />
        <motion.path d="M180 226 C180 300 290 300 290 380 L290 520 C290 600 180 600 180 660" strokeWidth="1.4" strokeDasharray="6 7" {...trazo(0.5)} />
        <motion.path d="M180 760 L180 798" strokeWidth="1.8" {...trazo(1.1)} />
      </g>
      <circle cx="180" cy="48" r="9" fill="var(--color-espuma)" />
      <g transform="translate(180 208)">
        <circle r="17" fill="none" stroke="var(--color-espuma)" strokeWidth="1.6" />
        <path d="M0 -24 L4 0 L0 24 L-4 0 Z M-24 0 L0 -4 L24 0 L0 4 Z" fill="var(--color-espuma)" />
      </g>
      <Barco x={70} y={450} />
      <Barco x={180} y={450} />
      <Barco x={290} y={450} />
      <g transform="translate(150 0)">
        <Faro x={30} y={700} quieto={quieto} />
      </g>
      <Ancla x={180} y={822} />
      <Etiqueta x={240} y={54} titulo="Tu pedido" ancla="start" />
      <Etiqueta x={240} y={200} titulo="El líder" linea="parte y estima" ancla="start" />
      <Etiqueta x={180} y={505} titulo="La flota" linea="cada uno en su rama" />
      <Etiqueta x={140} y={700} titulo="El portón" linea="lo que rebota, vuelve" ancla="end" />
      <Etiqueta x={240} y={822} titulo="Tu rama" linea="probada" ancla="start" />
    </svg>
  );
}

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative scroll-mt-24 px-6 py-28 md:px-10" aria-labelledby="como-funciona-titulo">
      <div className="relative mx-auto max-w-[1200px]">
        {/* El título con la rosa de 1747 al costado: la carta de abajo es nuestra, el oficio es viejo. */}
        <div className="grid items-end gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="max-w-2xl">
            <p className="text-[14px] text-apagado">Carta de navegación</p>
            <h2 id="como-funciona-titulo" className="mt-5 titulo-seccion">
              Cómo navega.
            </h2>
            <p className="mt-5 text-[19px] leading-relaxed text-tinta/85">
              Vos decís a dónde. Dolphin traza la ruta, reparte el trabajo y no te entrega nada que no haya pasado por el faro.
            </p>
          </div>
          <LaminaDeArchivo nombre="rosaDeLosVientos" className="w-full max-w-[340px] justify-self-end max-lg:justify-self-start" />
        </div>
        {/* La carta, sobre el fondo y sin caja: es un dibujo de archivo, y el recuadro de vidrio era
            justamente lo que la hacía ver pegada encima. Queda su epígrafe, como en una lámina. */}
        <figure className="mt-14">
          <div className="max-md:hidden">
            <CartaAncha />
          </div>
          <div className="mx-auto max-w-[360px] md:hidden">
            <CartaAngosta />
          </div>
          <figcaption className="mt-4 border-t border-espuma/10 pt-2 text-[13px] text-apagado">
            Fig. 1 · del muelle a tu rama
          </figcaption>
          {/* Lo mismo en palabras, para quien no ve el dibujo y para los buscadores. */}
          <ol className="sr-only">
            {PARADAS.map((p) => (
              <li key={p.nombre}>
                {p.nombre}: {p.texto}
              </li>
            ))}
          </ol>
        </figure>
        <p className="mt-6 text-[15px] text-tinta/70">
          El paso a paso, en{" "}
          <a href="/docs/equipo" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
            La flota
          </a>{" "}
          y{" "}
          <a href="/docs/porton" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
            El portón
          </a>
          .
        </p>
      </div>
    </section>
  );
}
