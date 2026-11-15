"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { Ventana } from "../Ventana";
import { teclasDePestanas } from "@/lib/pestanas";

/**
 * Las vistas de la app de escritorio, una por pestaña, con su captura real (la de Bots con la ruta
 * de la carpeta tapada: era una ruta personal). Las pestañas siguen el orden de la barra de la app.
 */
const VISTAS = [
  { id: "tablero", nombre: "Tablero", texto: "Lo último, la actividad, quién rinde, lo que cuesta y Guardian. Arranca con la primera siembra." },
  { id: "tareas", nombre: "Tareas", texto: "Los issues y los PR de GitHub del proyecto, con filtros y búsqueda, sin salir de la app." },
  { id: "cosechas", nombre: "Cosechas", texto: "Cada rama que entregó un agente, con su diff, sus fases y los botones para mergear o abrir un PR en borrador." },
  { id: "memoria", nombre: "Memoria", texto: "Lo que le corregiste una vez y no repite: lo que ya sabe, lo que está en observación y lo que espera tu ok." },
  { id: "bots", nombre: "Bots", texto: "Tus bots con su charla, su alma, su memoria, sus habilidades y sus rutinas." },
  { id: "git", nombre: "Git", texto: "Las ramas, los commits y los issues del repo, con quién trabajó en cada cosa y cuánto le falta a cada rama." },
  { id: "orquestacion", nombre: "Orquestación", texto: "Los trabajos que un agente repartió entre varios: quién espera a quién, qué terminó, qué falló y con qué motor." },
] as const;

export function Vistas() {
  const [activa, setActiva] = useState(0);
  const base = useId();
  const vista = VISTAS[activa]!;

  return (
    <div>
      {/* Las pestañas son una línea de rótulos sobre un filete, como el nav: la que está abierta se
          marca con un trazo que se desliza. Las píldoras de vidrio eran del estilo viejo. */}
      <div
        role="tablist"
        aria-label="Vistas de la app de escritorio"
        className="flex flex-wrap gap-x-6 gap-y-1 border-b border-espuma/10"
        onKeyDown={teclasDePestanas(VISTAS.length, activa, setActiva)}
      >
        {VISTAS.map((v, i) => (
          <button
            key={v.id}
            id={`${base}-pestana-${i}`}
            type="button"
            role="tab"
            aria-selected={activa === i}
            aria-controls={`${base}-panel`}
            tabIndex={activa === i ? 0 : -1}
            onClick={() => setActiva(i)}
            className="relative flex-none py-3.5 text-[12px] text-tinta/60 transition-colors hover:text-espuma aria-selected:text-espuma"
          >
            {activa === i && <motion.span layoutId="vista-escritorio" className="absolute inset-x-0 -bottom-px h-px bg-espuma" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            <span className="relative">{v.nombre}</span>
          </button>
        ))}
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-pestana-${activa}`}>
        <div className="mt-5 min-h-[56px] md:min-h-[32px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={vista.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="max-w-2xl text-[17px] leading-relaxed text-tinta/85"
            >
              {vista.texto}
            </motion.p>
          </AnimatePresence>
        </div>
        <Ventana etiqueta={`Dolphin · ${vista.nombre}`} className="mt-6">
          <div className="relative aspect-[1920/740] w-full bg-[#0a0a0a]">
            <AnimatePresence initial={false}>
              <motion.img
                key={vista.id}
                src={`/capturas/vista-${vista.id}.webp`}
                alt={`La app de escritorio en la vista ${vista.nombre}, con la barra de secciones a la izquierda.`}
                width={1920}
                height={740}
                loading="lazy"
                decoding="async"
                initial={{ opacity: 0, scale: 1.015 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 h-full w-full object-cover object-left-top"
              />
            </AnimatePresence>
          </div>
        </Ventana>
      </div>
    </div>
  );
}
