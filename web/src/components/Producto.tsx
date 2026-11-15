"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Ventana } from "./Ventana";
import { teclasDePestanas } from "@/lib/pestanas";
import { useQuieto } from "@/lib/quieto";

/**
 * Así se ve Dolphin: capturas reales de la app de terminal, en pestañas, dentro de una ventana.
 * Pasan solas cada pocos segundos hasta que la persona toca una.
 */
const VISTAS = [
  { id: "plan", nombre: "El plan", texto: "Le pedís algo y el líder lo parte en tareas, con lo que cuesta. Arranca cuando decís «dale»." },
  { id: "equipo", nombre: "La flota", texto: "Un cuadradito por agente, cada uno en su rama, con la línea de tiempo y el log de todo." },
  { id: "terminal", nombre: "Cada agente", texto: "Entrás a cualquiera y ves lo que lee, lo que escribe y lo que corre, como en Claude Code." },
  { id: "listo", nombre: "Puerto", texto: "Una rama que pasó el faro, lista para revisar compañero por compañero." },
  { id: "memoria", nombre: "La bitácora", texto: "Las reglas que aprendió el proyecto, las que esperan tu visto bueno y las que nadie usa." },
] as const;

export function Producto() {
  const [activa, setActiva] = useState(0);
  const [tocada, setTocada] = useState(false);
  // Pasar sola es contenido que se mueve: se puede pausar, y se frena con el puntero o el foco encima.
  const [pausada, setPausada] = useState(false);
  const [encima, setEncima] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const visto = useInView(ref, { amount: 0.3 });
  const quieto = useQuieto();
  const base = useId();
  const pasaSola = !tocada && !quieto;

  useEffect(() => {
    if (!pasaSola || pausada || encima || !visto) return;
    const t = setInterval(() => setActiva((i) => (i + 1) % VISTAS.length), 5200);
    return () => clearInterval(t);
  }, [pasaSola, pausada, encima, visto]);
  const vista = VISTAS[activa]!;
  const elegir = (i: number) => {
    setActiva(i);
    setTocada(true);
  };

  return (
    <section id="producto" ref={ref} className="relative scroll-mt-24 px-6 py-28 md:px-10">
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-2xl">
          <p className="text-[14px] text-apagado">Capturas de la app</p>
          <h2 className="mt-5 titulo-seccion">Así se ve navegar.</h2>
          <p className="mt-5 text-[19px] leading-relaxed text-tinta/85">En la terminal, con el comando dolphin. O en la app de escritorio.</p>
        </div>

        {/* Las pestañas son un renglón de rótulos sobre un filete, y la elegida se marca con el canto
            celeste: la pastilla blanca que había antes era la única píldora del sitio. */}
        <div
          className="mt-12 flex flex-wrap items-stretch justify-between gap-x-8 border-b border-espuma/10"
          onPointerEnter={() => setEncima(true)}
          onPointerLeave={() => setEncima(false)}
          onFocus={() => setEncima(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setEncima(false)}
        >
          <div
            role="tablist"
            aria-label="Partes de Dolphin"
            className="flex min-w-0 flex-wrap gap-x-7"
            onKeyDown={teclasDePestanas(VISTAS.length, activa, elegir)}
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
                onClick={() => elegir(i)}
                className="relative inline-flex min-h-11 flex-none items-center text-[12px] text-tinta/55 transition-colors hover:text-espuma aria-selected:text-espuma"
              >
                {activa === i && (
                  <motion.span
                    layoutId="vista-producto"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-electrico"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span className="relative">{v.nombre}</span>
              </button>
            ))}
          </div>
          {pasaSola && (
            <button
              type="button"
              onClick={() => setPausada((p) => !p)}
              aria-pressed={pausada}
              // `ml-auto`: en el celular las pestañas ocupan el renglón entero y esto baja al
              // siguiente, donde `justify-between` lo dejaría pegado a la izquierda, como una sexta.
              className="ml-auto inline-flex min-h-11 flex-none items-center text-[12px] text-tinta/55 transition-colors hover:text-espuma"
            >
              {pausada ? "Seguir" : "Pausar"}
            </button>
          )}
        </div>

        <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-pestana-${activa}`}>
          <AnimatePresence mode="wait">
            <motion.p
              key={vista.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="mt-6 max-w-xl text-[17px] leading-relaxed text-tinta/85"
            >
              {vista.texto}
            </motion.p>
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9"
          >
            <Ventana etiqueta="dolphin · tienda">
              <div className="relative aspect-[1800/1073] w-full bg-lienzo">
                <AnimatePresence initial={false}>
                  <motion.img
                    key={vista.id}
                    src={`/capturas/${vista.id}.webp`}
                    alt={`Dolphin en la terminal: ${vista.nombre.toLowerCase()}`}
                    width={1800}
                    height={1073}
                    initial={{ opacity: 0, scale: 1.015 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                </AnimatePresence>
              </div>
            </Ventana>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
