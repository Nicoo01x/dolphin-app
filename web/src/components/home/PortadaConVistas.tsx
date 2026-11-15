"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Instalar } from "../Instalar";
import { Lamina, PAISAJES } from "./Lamina";
import { VistaAgentes, VistaEditor, VistaPorton, VistaTablero } from "./vistas";

/**
 * La portada: el nombre, qué es en una oración, el comando, y el producto andando sobre el primer
 * paisaje, con un selector de cuatro vistas.
 *
 * Es la estructura de la web de la base (la portada es una ventana del producto con pestañas que cambian lo
 * que muestra) y no su estética. No avanza sola: cambia cuando la persona toca una pestaña, que es
 * lo que pidió Nico para el movimiento de esta web («nada de efectos de demo»).
 */
const VISTAS = [
  { id: "tablero", nombre: "Tablero", Vista: VistaTablero },
  { id: "agentes", nombre: "Agentes", Vista: VistaAgentes },
  { id: "porton", nombre: "Portón", Vista: VistaPorton },
  { id: "editor", nombre: "Editor", Vista: VistaEditor },
] as const;

export function PortadaConVistas() {
  const [elegida, setElegida] = useState<(typeof VISTAS)[number]["id"]>("tablero");
  const vista = VISTAS.find((v) => v.id === elegida) ?? VISTAS[0];

  return (
    <section aria-labelledby="portada-titulo" className="px-4 pt-14 md:px-10 md:pt-20">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[1fr_minmax(0,540px)]">
          <div>
            <h1 id="portada-titulo" className="titulo-grande">
              Dolphin
            </h1>
            <p className="bajada mt-5 max-w-[34ch]">
              Una app open source donde Claude Code, Codex y otros ocho agentes hacen tus tareas en paralelo, cada uno en su
              rama.
            </p>
          </div>
          <div id="instalar" className="scroll-mt-24">
            <Instalar />
          </div>
        </div>

        <Lamina paisaje={PAISAJES.lago} foco="50% 60%" prioridad className="mt-10 min-h-[560px] md:min-h-[640px]">
          <div className="flex w-full flex-col items-center gap-6 md:gap-8">
            {/* Las pestañas: una píldora blanca sobre el cuadro, con la marca que se desliza. */}
            <div role="tablist" aria-label="Qué mostrar" className="flex max-w-full rounded-full bg-white p-1 shadow-[0_8px_24px_-10px_rgb(11_13_16/0.35)]">
              {VISTAS.map((v) => {
                const activa = v.id === elegida;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    id={`pestana-${v.id}`}
                    aria-selected={activa}
                    aria-controls="vista-portada"
                    onClick={() => setElegida(v.id)}
                    className="relative h-11 cursor-pointer rounded-full px-3.5 text-[14px] font-medium transition-[transform] duration-100 active:scale-[0.97] sm:px-5"
                  >
                    {activa && (
                      <motion.span
                        layoutId="pestana-portada"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        className="absolute inset-0 rounded-full bg-espuma"
                      />
                    )}
                    <span className={`relative transition-colors duration-150 ${activa ? "text-lienzo" : "text-tenue hover:text-espuma"}`}>
                      {v.nombre}
                    </span>
                  </button>
                );
              })}
            </div>

            <div id="vista-portada" role="tabpanel" aria-labelledby={`pestana-${vista.id}`} className="flex w-full justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={vista.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="flex w-full justify-center"
                >
                  <vista.Vista />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Lamina>
      </div>
    </section>
  );
}
