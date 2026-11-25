"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CAPTURAS, type Captura } from "./capturas";
import { Lamina, PAISAJES, type Paisaje } from "./Lamina";
import { Marco } from "./Marco";
import { VIDEOS, type Video } from "./videos";
import { VideoReal } from "./VideoReal";

/**
 * El ciclo de trabajo, con el molde de la sección «Your dev loop» de la web de la base: una fila de
 * pestañas, y abajo el paso elegido con su título y una oración a la izquierda y el pedazo real
 * de la app a la derecha, flotando sobre su paisaje.
 *
 * Los cinco pasos son el recorrido de una tarea en Dolphin, de pedirla a revisar el PR, y cada uno
 * se muestra con la pieza de la app de escritorio que lo hace: el primero y el último son clips de
 * la app grabada trabajando (`public/videos/app-12-11/`), el resto capturas de fixtures con la
 * tienda de ejemplo.
 */
interface Paso {
  readonly id: string;
  readonly nombre: string;
  readonly titulo: string;
  readonly oracion: ReactNode;
  readonly captura: Captura;
  /** Si está, se muestra el clip (y la captura queda sin usar). */
  readonly video?: Video;
  readonly paisaje: Paisaje;
  readonly foco: string;
}

const PASOS: readonly Paso[] = [
  {
    id: "pedis",
    nombre: "Pedís",
    titulo: "Elegís un issue y arranca.",
    oracion: "Desde Tareas, «Comenzar» abre un espacio con su rama y pone al agente que elegiste a trabajar.",
    captura: CAPTURAS.compositor,
    video: VIDEOS.issue,
    paisaje: PAISAJES.andes,
    foco: "35% 50%",
  },
  {
    id: "tablero",
    nombre: "El tablero",
    titulo: "Soltás la tarjeta y arranca.",
    oracion: "Cinco columnas fijas, de Ideas a Hecho. Una tarjeta que cae en Haciendo pone a trabajar a los agentes.",
    captura: CAPTURAS.tableroArrastre,
    paisaje: PAISAJES.meandro,
    foco: "60% 50%",
  },
  {
    id: "cola",
    nombre: "Le escribís",
    titulo: "Le hablás sin cortarlo.",
    oracion: "Lo que escribís mientras el agente trabaja queda en cola: lo mandás ya, o lo borrás.",
    captura: CAPTURAS.cola,
    video: VIDEOS.cola,
    paisaje: PAISAJES.merced,
    foco: "50% 55%",
  },
  {
    id: "porton",
    nombre: "El portón",
    titulo: "Ocho fases antes de tu rama.",
    oracion: "Lo gratis corre primero. Lo que rebota vuelve al agente con el motivo exacto.",
    captura: CAPTURAS.portonReboto,
    paisaje: PAISAJES.desfiladero,
    foco: "50% 45%",
  },
  {
    id: "revisas",
    nombre: "Revisás",
    titulo: "El PR sale desde la app.",
    oracion: "Ves qué cambió el agente, abrís el PR y queda esperando tu revisión.",
    captura: CAPTURAS.pr,
    video: VIDEOS.pr,
    paisaje: PAISAJES.delaware,
    foco: "50% 60%",
  },
];

/**
 * Desde el 24/11/2026 el ciclo se recorre scrolleando, no con pestañas (Nico: «copiémonos un poco»
 * de aycode.ai, y eligió su sección «scenes»). La escena de la derecha queda fija y cambia al paso
 * que cruza la banda del medio de la pantalla; a la izquierda, los cinco pasos con un riel que se
 * llena con el scroll. Nada queda escondido detrás de un clic y el lector marca el ritmo.
 *
 * Por qué una banda de IntersectionObserver (−45 % arriba y abajo) y no el progreso del scroll para
 * elegir el paso: el paso activo es el que la persona está LEYENDO, el que está en el medio, no el
 * que ocupa más pantalla.
 *
 * En el celular no hay escena fija: cada paso lleva su pieza abajo del texto, que es lo que se lee
 * en una columna de 390 px.
 */
function usePasoEnElMedio(cuantos: number) {
  const [activo, setActivo] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setActivo(Number((e.target as HTMLElement).dataset.paso));
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const el of refs.current.slice(0, cuantos)) if (el) observador.observe(el);
    return () => observador.disconnect();
  }, [cuantos]);
  return { activo, refs };
}

function Pieza({ paso, ancho }: { readonly paso: Paso; readonly ancho: number }) {
  return paso.video ? (
    <VideoReal video={paso.video} modo="clip" ancho={ancho} className="mx-auto w-full" />
  ) : (
    // Un poco más grande que su tamaño nítido (fuente a 2x mostrada a ~1,45x): sobre un paisaje de
    // 700 px, la pieza a su tamaño de la app quedaba chica.
    <Marco captura={paso.captura} ancho={Math.round(paso.captura.ancho / 1.45)} className="mx-auto" />
  );
}

export function Ciclo() {
  const { activo, refs } = usePasoEnElMedio(PASOS.length);
  const reducido = useReducedMotion();
  const lista = useRef<HTMLOListElement>(null);
  // El riel se llena mientras la lista cruza el medio de la pantalla: del primer paso al último.
  const { scrollYProgress } = useScroll({ target: lista, offset: ["start center", "end center"] });
  const relleno = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  const paso = PASOS[activo] ?? PASOS[0]!;

  return (
    <section id="ciclo" aria-labelledby="ciclo-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="ciclo-titulo" className="titulo-seccion">
          De la tarjeta a la rama probada.
        </h2>

        <div className="mt-10 grid gap-x-14 lg:mt-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
          <ol ref={lista} aria-label="Pasos de una tarea" className="relative">
            {/* El riel: el tono de las superficies de fondo y, encima, lo recorrido en tinta. */}
            <span aria-hidden className="absolute top-0 bottom-0 left-[5px] hidden w-px bg-lienzo-4 lg:block" />
            <motion.span
              aria-hidden
              className="absolute top-0 bottom-0 left-[5px] hidden w-px origin-top bg-espuma lg:block"
              style={{ scaleY: reducido ? scrollYProgress : relleno }}
            />
            {PASOS.map((p, i) => {
              const esActivo = i === activo;
              return (
                <li
                  key={p.id}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-paso={i}
                  className="relative py-6 lg:flex lg:min-h-[64vh] lg:items-center lg:py-0 lg:pl-10"
                >
                  {/* La boya del riel: se llena cuando su paso es el que se está leyendo. */}
                  <span
                    aria-hidden
                    className={`absolute top-1/2 left-0 hidden size-[11px] -translate-y-1/2 rounded-full transition-colors duration-[160ms] lg:block ${
                      esActivo ? "bg-espuma" : "bg-lienzo-4"
                    }`}
                  />
                  <div
                    className={`transition-opacity duration-[160ms] lg:max-w-[40ch] ${esActivo ? "lg:opacity-100" : "lg:opacity-35"}`}
                  >
                    <p className="text-[14px] font-medium text-apagado">{p.nombre}</p>
                    <h3 className="mt-2 text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-espuma md:text-[30px]">
                      {p.titulo}
                    </h3>
                    <p className="bajada mt-3">{p.oracion}</p>
                  </div>
                  {/* En el celular y la tablet, la pieza va con su paso. */}
                  <Lamina paisaje={p.paisaje} foco={p.foco} className="mt-6 min-h-[300px] lg:hidden">
                    <Pieza paso={p} ancho={760} />
                  </Lamina>
                </li>
              );
            })}
          </ol>

          {/* La escena fija: centrada en la pantalla mientras los pasos pasan al lado. */}
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-300px)] h-[600px]">
              <div className="relative h-full overflow-hidden rounded-escena">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={paso.id}
                    initial={reducido ? false : { opacity: 0, scale: 1.015 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducido ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0"
                  >
                    <Lamina paisaje={paso.paisaje} foco={paso.foco} className="h-full">
                      <Pieza paso={paso} ancho={720} />
                    </Lamina>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
