"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { CAPTURAS, type Captura } from "./capturas";
import { Lamina, PAISAJES, type Paisaje } from "./Lamina";
import { Marco } from "./Marco";
import { Pestanas } from "./Pestanas";
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

export function Ciclo() {
  const [elegido, setElegido] = useState(PASOS[0]!.id);
  const paso = PASOS.find((p) => p.id === elegido) ?? PASOS[0]!;
  return (
    <section id="ciclo" aria-labelledby="ciclo-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="ciclo-titulo" className="titulo-seccion text-center">
          De la tarjeta a la rama probada.
        </h2>
        <div className="mt-8 flex justify-center">
          <Pestanas id="ciclo" etiqueta="Pasos de una tarea" opciones={PASOS} elegida={elegido} onElegir={setElegido} />
        </div>

        <div id="ciclo-panel" role="tabpanel" aria-labelledby={`ciclo-pestana-${paso.id}`} className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={paso.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="grid items-center gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
            >
              <div>
                <h3 className="text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-espuma md:text-[30px]">{paso.titulo}</h3>
                <p className="bajada mt-3 max-w-[38ch]">{paso.oracion}</p>
              </div>
              <Lamina paisaje={paso.paisaje} foco={paso.foco} className="min-h-[300px] md:min-h-[440px]">
                {/* Un poco más grande que su tamaño nítido (fuente a 2x mostrada a ~1,45x): sobre un
                    paisaje de 700 px, la pieza a su tamaño de la app quedaba chica. */}
                {paso.video ? (
                  <VideoReal video={paso.video} modo="clip" ancho={760} className="mx-auto w-full" />
                ) : (
                  <Marco captura={paso.captura} ancho={Math.round(paso.captura.ancho / 1.45)} className="mx-auto" />
                )}
              </Lamina>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
