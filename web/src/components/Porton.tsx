"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Encabezado, Seccion } from "./Encabezado";
import {
  comoVaElPorton,
  DURACION_PORTON,
  FASES_DEL_PORTON,
  porCruzar,
  type EstadoDeFase,
} from "@/lib/porton-demo";
import { useQuieto } from "@/lib/quieto";

/**
 * El portón, andando: una rama cruzando las ocho fases, acá mismo.
 *
 * Era una lista de ocho renglones hasta que Nico miró la página y dijo «todo esto que sea
 * interactivo», que es lo correcto: lo que hay que entender del portón no es que hay ocho fases,
 * es que corren en orden, que la que falla rebota gratis y temprano, que el agente la corrige
 * solo y que recién al final paga un modelo. Eso leído es una promesa; visto son nueve segundos.
 *
 * Arranca sola cuando la sección entra en pantalla, y no antes: un dibujo que se pinta mientras
 * estás tres pantallas más arriba ya terminó cuando llegás. Con `prefers-reduced-motion` aparece
 * terminada y se reproduce solo si la persona la pide.
 *
 * Los nombres, lo que mira cada fase y lo que tarda son los de verdad (`docs/porton.md`).
 */

/** La película va más rápido que el portón de verdad: una rama tarda minutos. */
const VELOCIDAD = 1;

/** Qué se dibuja a la izquierda de cada fase. El texto es para el lector de pantalla. */
const MARCA: Record<EstadoDeFase, { readonly marca: string; readonly clase: string; readonly dice: string }> = {
  espera: { marca: "·", clase: "text-tinta/20", dice: "todavía no" },
  corriendo: { marca: "•", clase: "animate-pulse text-electrico", dice: "corriendo" },
  corrigiendo: { marca: "↻", clase: "animate-pulse text-electrico", dice: "el agente la corrige" },
  paso: { marca: "✓", clase: "text-espuma", dice: "pasó" },
  rebote: { marca: "✕", clase: "text-cayo", dice: "rebotó" },
};

export function Porton() {
  const [t, setT] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const desde = useRef(0);
  const cuadro = useRef(0);
  const caja = useRef<HTMLDivElement>(null);
  const yaArranco = useRef(false);
  const quieto = useQuieto();

  const correr = useCallback(
    (desdeCero = false) => {
      // `desdeCero` es un argumento y no «leer `t` después de ponerlo en 0» porque el estado de
      // React todavía vale lo de antes cuando esta función corre.
      const inicio = desdeCero ? 0 : t;
      if (desdeCero) {
        setT(0);
      }
      desde.current = performance.now() - inicio / VELOCIDAD;
      setCorriendo(true);
    },
    [t],
  );

  useEffect(() => {
    if (!corriendo) {
      return;
    }
    const paso = (ahora: number): void => {
      const transcurrido = (ahora - desde.current) * VELOCIDAD;
      if (transcurrido >= DURACION_PORTON) {
        setT(DURACION_PORTON);
        setCorriendo(false);
        return;
      }
      setT(transcurrido);
      cuadro.current = requestAnimationFrame(paso);
    };
    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
  }, [corriendo]);

  // Arranca cuando se la ve, una sola vez. Con movimiento reducido no arranca sola: se muestra
  // terminada y queda el botón.
  useEffect(() => {
    if (quieto) {
      setT(DURACION_PORTON);
      return;
    }
    const el = caja.current;
    if (!el || yaArranco.current) {
      return;
    }
    const ojo = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting) && !yaArranco.current) {
          yaArranco.current = true;
          correr(true);
          ojo.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    ojo.observe(el);
    return () => ojo.disconnect();
    // `correr` cambia con `t`; acá solo importa la primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quieto]);

  const estado = porCruzar(t);
  const termino = t >= DURACION_PORTON;

  return (
    <Seccion id="porton" etiqueta="porton-titulo">
      <Encabezado
        id="porton-titulo"
        titulo="Ocho fases, de lo gratis a lo caro."
        bajada="Cada escalón corre solo sobre las que pasaron el anterior: una rama rota en los tipos nunca llega a pagarle a un modelo."
        enlace={{ href: "/docs/porton", texto: "Cómo funciona el portón" }}
      />

      <div ref={caja} className="mt-14">
        <ol className="flex flex-col gap-1.5">
          {FASES_DEL_PORTON.map((f, i) => {
            const como = estado.fases[i] ?? "espera";
            const marca = MARCA[como];
            const viva = como !== "espera";
            return (
              <li
                key={f.nombre}
                // La fila se aclara un escalón por fase: la lista deja de ser ocho renglones
                // iguales y pasa a ser una rampa, que es lo que hay que entender de un vistazo.
                style={{ background: `color-mix(in oklab, var(--color-lienzo-4) ${18 + i * 11}%, var(--color-lienzo))` }}
                className={`flex items-center gap-4 rounded-[var(--radius-fila)] py-3 pr-4 pl-4 transition-opacity duration-300 md:gap-6 md:pl-5 ${
                  viva ? "opacity-100" : "opacity-45"
                }`}
              >
                <span className={`w-4 flex-none text-center text-[14px] ${marca.clase}`} aria-hidden="true">
                  {marca.marca}
                </span>
                <span className="w-[120px] flex-none text-[15px] font-medium text-espuma md:w-[140px]">
                  {f.nombre}
                  <span className="sr-only">: {marca.dice}</span>
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug text-tenue max-sm:hidden">
                  {/* Mientras rebota, el renglón dice POR QUÉ: es lo que vuelve al agente. */}
                  {(como === "rebote" || como === "corrigiendo") && estado.porQue ? (
                    <span className="text-cayo">{estado.porQue}</span>
                  ) : (
                    f.mira
                  )}
                </span>
                <span className="w-[72px] flex-none text-right text-[13px] text-apagado tabular-nums max-md:hidden">
                  {como === "paso" ? f.tarda : ""}
                </span>
                {/* El celeste señala las dos únicas fases que cuestan plata. */}
                <span
                  className={`w-[52px] flex-none rounded-full px-2.5 py-0.5 text-center text-[13px] ${
                    f.paga ? "bg-electrico/12 text-electrico" : "text-tenue"
                  }`}
                >
                  {f.paga ? "paga" : "gratis"}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p aria-live="polite" className="text-[15px] text-tenue">
            {comoVaElPorton(estado)}
          </p>
          <button
            type="button"
            onClick={() => (corriendo ? setCorriendo(false) : correr(termino))}
            className="boton-tonal h-9 px-4 text-[14px]"
          >
            {corriendo ? "Pausar" : termino ? "De nuevo" : t > 0 ? "Seguir" : "Pasar una rama"}
          </button>
        </div>
      </div>

      <p className="mt-8 max-w-[62ch] text-[15px] leading-relaxed text-tenue">
        Y la escalera no termina ahí:{" "}
        <a href="/docs/fases" className="text-espuma underline decoration-espuma/25 underline-offset-4 transition-colors hover:decoration-espuma">
          una fase se escribe y se comparte
        </a>{" "}
        como un módulo de npm o un archivo del repo.
      </p>
    </Seccion>
  );
}
