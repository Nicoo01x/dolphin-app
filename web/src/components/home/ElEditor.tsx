"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Lamina, PAISAJES, type Paisaje } from "./Lamina";
import { Pestanas } from "./Pestanas";
import { VIDEOS, type Video } from "./videos";
import { VideoReal } from "./VideoReal";

/**
 * «El editor»: lo que hace el editor de código de la app con el agente al lado, en cuatro clips
 * reales grabados sobre la tienda de ejemplo (`public/videos/app-12-11/`, LEEME.md). Mismo molde
 * que el ciclo: pestañas arriba, el título y una oración a la izquierda, el clip a la derecha.
 *
 * Lo que se muestra anda hoy en la app: Ctrl+K reescribe en el lugar, la rayita de git revierte un
 * trozo, F12 salta con el servidor de TypeScript del proyecto y el panel de archivos busca por
 * nombre y por contenido. Lo que no anduvo grabando está en el informe del 14/11, no acá.
 */
interface Funcion {
  readonly id: string;
  readonly nombre: string;
  readonly titulo: string;
  readonly oracion: string;
  readonly video: Video;
  readonly paisaje: Paisaje;
  readonly foco: string;
}

const FUNCIONES: readonly Funcion[] = [
  {
    id: "ctrl-k",
    nombre: "Ctrl+K",
    titulo: "Ctrl+K y le decís qué cambiar.",
    oracion: "Seleccionás unas líneas, escribís el pedido y el cambio aparece en el lugar, para aceptarlo o descartarlo.",
    video: VIDEOS.ctrlK,
    paisaje: PAISAJES.merced,
    foco: "50% 50%",
  },
  {
    id: "revertir",
    nombre: "Revertir un trozo",
    titulo: "Cada cambio, con vuelta atrás.",
    oracion: "Lo que tocaste queda marcado en el margen; un clic muestra cómo estaba y lo devuelve.",
    video: VIDEOS.revertir,
    paisaje: PAISAJES.andes,
    foco: "40% 50%",
  },
  {
    id: "definicion",
    nombre: "Ir a la definición",
    titulo: "F12 te lleva a la función.",
    oracion: "Con el servidor de TypeScript del proyecto, aunque esté en otro archivo.",
    video: VIDEOS.definicion,
    paisaje: PAISAJES.meandro,
    foco: "55% 50%",
  },
  {
    id: "buscar",
    nombre: "Buscar archivos",
    titulo: "Tres letras y está el archivo.",
    oracion: "Por nombre, o por contenido: cada línea donde aparece lo que buscás, y un clic te deja ahí.",
    video: VIDEOS.buscar,
    paisaje: PAISAJES.delaware,
    foco: "50% 60%",
  },
];

export function ElEditor() {
  const [elegida, setElegida] = useState(FUNCIONES[0]!.id);
  const f = FUNCIONES.find((x) => x.id === elegida) ?? FUNCIONES[0]!;
  return (
    <section id="editor" aria-labelledby="editor-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="editor-titulo" className="titulo-seccion text-center">
          Un editor con el agente adentro.
        </h2>
        <div className="mt-8 flex justify-center">
          <Pestanas id="editor" etiqueta="Funciones del editor" opciones={FUNCIONES} elegida={elegida} onElegir={setElegida} />
        </div>

        <div id="editor-panel" role="tabpanel" aria-labelledby={`editor-pestana-${f.id}`} className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="grid items-center gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)]"
            >
              <div>
                <h3 className="text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-espuma md:text-[30px]">{f.titulo}</h3>
                <p className="bajada mt-3 max-w-[34ch]">{f.oracion}</p>
              </div>
              <Lamina paisaje={f.paisaje} foco={f.foco} className="min-h-[300px] md:min-h-[460px]">
                <VideoReal video={f.video} modo="clip" ancho={f.video.ancho} className="mx-auto w-full" />
              </Lamina>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
