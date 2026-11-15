"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Encabezado, Seccion } from "./Encabezado";

/**
 * Lo que vende el producto: las cosas que salen mal cuando un agente escribe solo, y qué pieza de
 * Dolphin se ocupa de cada una.
 *
 * Es el encargo de Nico del 01/11: «Dolphin se tiene que vender como el programa que resolvió
 * todos los problemas de los vibecoders y los LLMs». La forma de decirlo es nombrar el problema
 * con las palabras con las que lo vive la persona —no «falta de observabilidad», sino «te dice que
 * está listo y no está»— y recién después la respuesta, con el nombre de la pieza.
 *
 * Y se toca: un conmutador cruza las seis frases de lo que pasa hoy a lo que hace Dolphin. El
 * contraste es el argumento, y un argumento se siente cuando cambia abajo de tu dedo.
 *
 * Cada respuesta es algo que el producto hace HOY. Si una deja de ser cierta, se saca de acá: la
 * web no promete lo que el producto no cumple.
 */
const PROBLEMAS = [
  {
    falla: "Te dice que está listo y no está.",
    hoy: "Lo leés entero, o lo creés y te enterás el martes.",
    pieza: "El portón",
    arregla: "Ninguna rama llega sin cruzarlo. Lo que no pasa vuelve al agente con el motivo.",
    href: "/docs/porton",
  },
  {
    falla: "Un intento, y si sale mal perdiste la tarde.",
    hoy: "Volvés a pedirlo con otras palabras y esperás de nuevo.",
    pieza: "La siembra",
    arregla: "La misma tarea sale en varias ramas a la vez. Llega la que pasa y cambia menos.",
    href: "/docs/equipo",
  },
  {
    falla: "Le corregís lo mismo todos los días.",
    hoy: "Lo escribís en el prompt, y al tercer mensaje ya se olvidó.",
    pieza: "La memoria",
    arregla: "Marcás una línea del diff y esa corrección se vuelve un chequeo. Desde ahí corre sola.",
    href: "/docs/memoria",
  },
  {
    falla: "Te toca el repo mientras trabajás.",
    hoy: "Trabajás en otra cosa y te cambia el archivo que tenías abierto.",
    pieza: "Las ramas",
    arregla: "Cada agente en su rama, su worktree, su puerto y su base. Tu árbol no se toca.",
    href: "/docs/equipo",
  },
  {
    falla: "No sabés qué está haciendo.",
    hoy: "Mirás una terminal escupir texto y adivinás por dónde va.",
    pieza: "En vivo",
    arregla: "Qué fase corre, qué rebotó y por qué. En el tablero, en la terminal o en el celular.",
    href: "/docs/consola",
  },
  {
    falla: "Pagás tokens para enterarte de que falló.",
    hoy: "El modelo caro escribe y revisa, y recién ahí corren los tests.",
    pieza: "El orden del portón",
    arregla: "Primero los tipos y los tests, que no cuestan nada. Recién al final paga un modelo.",
    href: "/docs/porton",
  },
] as const;

export function Problemas() {
  // Arranca en «sin Dolphin», que es el título de la sección: primero el problema, y la respuesta
  // cuando la persona la pide. Con la respuesta puesta de entrada, las seis frases se leen como
  // una lista de funciones más.
  const [conDolphin, setConDolphin] = useState(false);

  return (
    <Seccion id="problemas" etiqueta="problemas-titulo" tonal>
      <Encabezado
        id="problemas-titulo"
        titulo="El agente no es el problema. Es lo que viene después."
        bajada="Escribir dejó de ser lo difícil. Lo difícil es saber si eso sirve, sin leerlo línea por línea."
      />

      {/* Un conmutador y no dos columnas en paralelo: el contraste se siente cuando las mismas
          seis frases cambian abajo de tu dedo. La pastilla que se desliza es la del gusto de Nico
          —el fondo se mueve, el texto no. */}
      <div className="mt-12 inline-flex rounded-full bg-lienzo p-1" role="group" aria-label="Con Dolphin o sin Dolphin">
        {[
          { que: false, dice: "Sin Dolphin" },
          { que: true, dice: "Con Dolphin" },
        ].map((b) => (
          <button
            key={b.dice}
            type="button"
            onClick={() => setConDolphin(b.que)}
            aria-pressed={conDolphin === b.que}
            className="relative cursor-pointer rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors"
          >
            {conDolphin === b.que && (
              <motion.span
                layoutId="pastilla-problemas"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-0 rounded-full bg-lienzo-4"
              />
            )}
            <span className={`relative ${conDolphin === b.que ? "text-espuma" : "text-apagado"}`}>{b.dice}</span>
          </button>
        ))}
      </div>

      {/* Una grilla de pares, no seis tarjetas con ícono: lo que hay que comparar es el problema
          con su respuesta, y una caja alrededor de cada uno los convierte en seis cosas sueltas.
          La separación la hace el aire y el tono del texto.

          El título reserva dos renglones aunque entre en uno: así los seis párrafos arrancan a la
          misma altura. Con el alto al contenido, el ítem cuyo título cae en dos líneas empujaba su
          texto hacia abajo y toda la fila quedaba desalineada. */}
      <ul className="mt-10 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-14">
        {PROBLEMAS.map((p, i) => (
          <motion.li
            key={p.falla}
            initial={{ y: 16 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: (i % 3) * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-w-0 flex-col"
          >
            <p
              className={`text-[19px] leading-[1.3] font-medium tracking-[-0.018em] text-balance transition-colors duration-300 sm:min-h-[2.6em] ${
                conDolphin ? "text-tinta/40" : "text-espuma"
              }`}
            >
              {p.falla}
            </p>
            {/* Las dos frases ocupan el mismo lugar y se cruzan: así la grilla no salta y la vista
                queda clavada en la frase que cambia. */}
            <div className="relative mt-3 min-h-[3.6em]">
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  key={conDolphin ? "con" : "sin"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, delay: conDolphin ? (i % 3) * 0.05 : 0 }}
                  className={`absolute inset-x-0 top-0 text-[15px] leading-[1.55] text-pretty ${
                    conDolphin ? "text-espuma" : "text-tenue"
                  }`}
                >
                  {conDolphin ? p.arregla : p.hoy}
                </motion.p>
              </AnimatePresence>
            </div>
            <a
              href={p.href}
              className={`group mt-3.5 inline-flex items-center gap-1.5 self-start text-[14px] transition-colors hover:text-espuma ${
                conDolphin ? "text-electrico" : "text-apagado"
              }`}
            >
              {p.pieza}
              <span aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                →
              </span>
            </a>
          </motion.li>
        ))}
      </ul>
    </Seccion>
  );
}
