"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Encabezado, Seccion } from "./Encabezado";
import { useQuieto } from "@/lib/quieto";

/**
 * El ciclo de trabajo, contado en tres momentos: anotás, lo hacen, revisás.
 *
 * Es la parte que ningún competidor cuenta igual, porque es lo que pasa DESPUÉS de que el agente
 * escribe: la tarjeta es el lugar donde empieza y termina todo.
 *
 * Por eso no hay tres copias quietas de la tarjeta, una por columna: hay UNA sola, que avanza.
 * Nico, 01/11: «todo esto que sea interactivo». Avanza sola cada cuatro segundos y se puede
 * adelantar tocando el momento que se quiera; lo que cambia en cada paso es la columna, el estado
 * y lo que la tarjeta trae adentro, que es lo que de verdad pasa en el producto.
 *
 * Lo que dice cada paso es lo que el producto hace hoy. Si cambia el flujo, cambia esto: la web
 * no promete lo que el producto no cumple.
 */

const MOMENTOS = [
  {
    id: "anotas",
    cuando: "Vos, treinta segundos",
    titulo: "Anotás",
    texto: "Qué hay que hacer y cómo se sabría que está terminada. O nada: entran solos los TODO del código y los issues de GitHub.",
    columna: "Ideas",
    /** Lo que la tarjeta muestra adentro en este momento del ciclo. */
    adentro: { criterio: "Terminada cuando el archivo abre en Excel con los acentos bien." },
  },
  {
    id: "lo-hacen",
    cuando: "La flota, mientras hacés otra cosa",
    titulo: "Lo hacen",
    texto: "Decís «dale» y el líder la parte. Cada uno en su rama, su puerto y su base, y nada llega sin cruzar el portón.",
    columna: "Haciendo",
    adentro: { rama: "dolphin/4e2/u1", estado: "3 ramas en el portón" },
  },
  {
    id: "revisas",
    cuando: "Vos, otra vez",
    titulo: "Revisás",
    texto: "La tarjeta vuelve con su rama: ves qué cambió, la probás sin integrarla, y la integrás o la devolvés con el motivo.",
    columna: "Para revisar",
    adentro: { rama: "dolphin/4e2/u1", diff: "2 archivos · +34 −6", estado: "pasó las 8 fases" },
  },
] as const;

const CADA = 4200;

export function Ciclo() {
  const [paso, setPaso] = useState(0);
  // Cuando la persona elige un momento, el carrusel deja de avanzar solo: estar leyendo algo y
  // que se te mueva abajo del dedo es lo más molesto que puede hacer una pieza así.
  const [aMano, setAMano] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [aLaVista, setALaVista] = useState(false);
  const quieto = useQuieto();

  useEffect(() => {
    const el = caja.current;
    if (!el) {
      return;
    }
    const ojo = new IntersectionObserver((e) => setALaVista(e.some((x) => x.isIntersecting)), { threshold: 0.3 });
    ojo.observe(el);
    return () => ojo.disconnect();
  }, []);

  useEffect(() => {
    if (aMano || quieto || !aLaVista) {
      return;
    }
    const reloj = setInterval(() => setPaso((p) => (p + 1) % MOMENTOS.length), CADA);
    return () => clearInterval(reloj);
  }, [aMano, quieto, aLaVista]);

  const momento = MOMENTOS[paso]!;

  return (
    <Seccion id="ciclo" etiqueta="ciclo-titulo">
      <Encabezado
        id="ciclo-titulo"
        titulo="Anotás, lo hacen, revisás."
        bajada="Todo pasa en la misma tarjeta. No hay que ir a buscar la rama a otro lado."
      />

      <div ref={caja} className="mt-14">
        {/* Las tres columnas del tablero, con la tarjeta en la que le toca. La que la tiene se
            levanta un tono; las otras dos quedan donde están, que es lo que hace ver que la
            tarjeta se mueve y no que se encienden tres cosas distintas. */}
        <ol className="grid gap-2 lg:grid-cols-3">
          {MOMENTOS.map((m, i) => {
            const aqui = i === paso;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPaso(i);
                    setAMano(true);
                  }}
                  aria-current={aqui ? "step" : undefined}
                  className={`flex h-full w-full cursor-pointer flex-col gap-4 rounded-[var(--radius-ventana)] p-5 text-left transition-colors duration-300 md:p-6 ${
                    aqui ? "bg-lienzo-3" : "bg-lienzo-2 hover:bg-lienzo-3/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span
                      className={`flex-none text-[26px] leading-none font-medium tracking-[-0.025em] transition-colors ${
                        aqui ? "text-espuma" : "text-tinta/45"
                      }`}
                    >
                      {m.titulo}
                    </span>
                    <span className="text-right text-[13px] leading-tight text-apagado">{m.cuando}</span>
                  </div>

                  {/* El hueco de la tarjeta: la reserva siempre, así las tres columnas miden lo
                      mismo y la pieza no salta cada vez que la tarjeta cambia de lugar. */}
                  <div className="min-h-[124px]">
                    {aqui && (
                      <motion.div
                        layoutId="tarjeta-del-ciclo"
                        transition={{ type: "spring", stiffness: 260, damping: 30 }}
                        className="rounded-[var(--radius-caja)] bg-lienzo-4 p-4"
                      >
                        <p className="text-[13px] text-apagado">{m.columna}</p>
                        <p className="mt-2 text-[15px] leading-snug text-espuma">Exportar los pedidos a CSV</p>
                        {"criterio" in m.adentro && (
                          <p className="mt-1 text-[13px] leading-snug text-tenue">{m.adentro.criterio}</p>
                        )}
                        {"rama" in m.adentro && (
                          <p className="mt-2 font-codigo text-[12px] text-tenue">{m.adentro.rama}</p>
                        )}
                        {"diff" in m.adentro && (
                          <p className="mt-1 font-codigo text-[12px] text-apagado">{m.adentro.diff}</p>
                        )}
                        {"estado" in m.adentro && (
                          <p className="mt-2 inline-block rounded-full bg-electrico/12 px-2 py-0.5 text-[12px] text-electrico">
                            {m.adentro.estado}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>

                  <p className={`text-[15px] leading-relaxed transition-colors ${aqui ? "text-tenue" : "text-tinta/40"}`}>{m.texto}</p>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-[15px] text-tenue">El tablero vive en tu repo, un archivo por tarjeta.</p>
      </div>
    </Seccion>
  );
}
