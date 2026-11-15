"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Renglon } from "./renglones-del-chat";
import { VentanaDeDolphin } from "./VentanaDeDolphin";
import {
  corriendoEn,
  duracionDe,
  fasesEncendidas,
  GUIONES,
  pasosHasta,
  type GuionDelChat,
} from "@/lib/guion-del-chat";
import { useQuieto } from "@/lib/quieto";

/**
 * El chat de Dolphin trabajando, adentro de la ventana de Dolphin.
 *
 * Es la pieza principal de la home y la que más cuesta contar con palabras: le escribís algo en
 * castellano y lo que vuelve no es texto para copiar, sino una rama con los archivos tocados, los
 * tests corridos y el portón cruzado. Visto una vez, no hace falta explicarlo.
 *
 * Se toca: los tres botones de abajo son tres pedidos distintos y cada uno corre su conversación.
 * Lo que NO se puede es escribir uno propio, y por eso el compositor está apagado y lo dice: acá
 * no corre ningún agente, es una grabación. Un campo que acepta texto y después no hace nada es
 * peor que no tener campo.
 *
 * El guion y sus reglas viven en `lib/guion-del-chat.ts`, con su test.
 */

/** Un poco más rápido que de verdad: diez segundos mirando una ventana es mucho. */
const VELOCIDAD = 1.35;

export function ChatTrabajando() {
  const [cual, setCual] = useState(0);
  const [t, setT] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const desde = useRef(0);
  const cuadro = useRef(0);
  const caja = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const quieto = useQuieto();

  const guion: GuionDelChat = GUIONES[cual] ?? GUIONES[0]!;
  const duracion = duracionDe(guion);

  const correr = useCallback(() => {
    setT(0);
    desde.current = performance.now();
    setCorriendo(true);
  }, []);

  useEffect(() => {
    if (!corriendo) return;
    const paso = () => {
      const ahora = (performance.now() - desde.current) * VELOCIDAD;
      if (ahora >= duracion) {
        setT(duracion);
        setCorriendo(false);
        return;
      }
      setT(ahora);
      cuadro.current = requestAnimationFrame(paso);
    };
    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
  }, [corriendo, duracion]);

  // Arranca sola cuando se la ve, una vez. Quien pidió menos movimiento la ve terminada.
  useEffect(() => {
    if (quieto) {
      setT(duracion);
      return;
    }
    const nodo = marco.current;
    if (!nodo) return;
    const ojo = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          correr();
          ojo.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    ojo.observe(nodo);
    return () => ojo.disconnect();
  }, [quieto, duracion, correr]);

  const pasos = pasosHasta(guion, t);

  // La conversación se queda siempre mirando lo último, como en la app.
  useEffect(() => {
    const nodo = caja.current;
    if (nodo) nodo.scrollTop = nodo.scrollHeight;
  }, [pasos.length, cual]);

  const elegir = (i: number) => {
    setCual(i);
    if (quieto) {
      setT(duracionDe(GUIONES[i] ?? guion));
      return;
    }
    correr();
  };

  const termino = !corriendo && t >= duracion;
  const trabajando = corriendoEn(guion, t);

  return (
    <div ref={marco}>
      <VentanaDeDolphin
        pestanas={["pwsh · dolphin-app", "Claude Code", guion.rama.replace("dolphin/", "")]}
        activa={2}
        agente="Claude · Opus 5.5"
        estado={termino ? "terminó" : guion.estado}
      >
        <div
          ref={caja}
          className="h-[320px] overflow-y-auto px-4 py-4 [scrollbar-width:none] sm:h-[380px] sm:px-5 [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex flex-col gap-3">
            {pasos.map((paso, i) => (
              <li key={`${paso.tipo}-${paso.t}`}>
                <Renglon
                  paso={paso}
                  ultimo={i === pasos.length - 1}
                  corriendo={trabajando}
                  fases={fasesEncendidas(paso, t)}
                />
              </li>
            ))}
          </ul>
        </div>
        <Compositor guion={guion} />
      </VentanaDeDolphin>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {GUIONES.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => elegir(i)}
            aria-pressed={i === cual}
            className={`rounded-full px-4 py-2 text-sm transition-colors duration-[var(--duracion-base)] ${
              i === cual
                ? "bg-espuma text-lienzo"
                : "bg-app/50 text-app-espuma backdrop-blur-sm hover:bg-app/70"
            }`}
          >
            {g.boton}
          </button>
        ))}
        {termino ? (
          <button
            type="button"
            onClick={correr}
            className="rounded-full bg-app/50 px-4 py-2 text-sm text-app-tenue backdrop-blur-sm transition-colors duration-[var(--duracion-base)] hover:text-app-espuma"
          >
            De nuevo
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Compositor({ guion }: { readonly guion: GuionDelChat }) {
  return (
    <div className="border-t border-app-espuma/10 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3 rounded-[var(--radius-fila)] bg-app-espuma/[0.04] px-3 py-2.5">
        <span className="truncate text-sm text-app-apagado">
          Esto es una grabación: {guion.boton.toLowerCase()}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-app-espuma/10 px-2 py-0.5 text-[11px] text-app-apagado">
          demo
        </span>
      </div>
    </div>
  );
}
