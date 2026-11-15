"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuieto } from "@/lib/quieto";
import { LogoPastilla } from "../Logo";

/**
 * Las piezas con las que se arma cada tarjeta de la home.
 *
 * La anatomía es la de la referencia que eligió Nico el 12/11/2026: un renglón de encabezado
 * (avatar y nombre en gris), y debajo filas separadas por una línea finísima, cada una con un
 * cuadradito a la izquierda que dice en qué estado está, un título de peso medio y una línea gris.
 *
 * El indicador es lo único que se mueve en toda la página: el de «en curso» gira, y una fila puede
 * cambiar de estado una vez cuando entra en pantalla (una fase que rebota y se corrige, un agente
 * que termina). La idea del tilde que se dibuja y de las filas hechas que bajan un poco la voz sale
 * de «AI Task List» de 21st.dev (educalvolpz), pasada a los tokens de acá.
 */

export type Estado = "curso" | "hecho" | "rebote" | "espera" | "regla";

/** Un cambio de estado, a tantos milisegundos de que la fila entró en pantalla. */
export interface Paso {
  readonly en: number;
  readonly estado: Estado;
  readonly texto?: string;
  readonly marca?: string;
}

const DICE: Record<Estado, string> = {
  curso: "en curso",
  hecho: "hecho",
  rebote: "rebotó",
  espera: "esperando",
  regla: "regla",
};

/** El cuadradito de la izquierda. `chico` es el de las celdas de la grilla. */
export function Indicador({ estado, chico = false, numero }: { readonly estado: Estado; readonly chico?: boolean; readonly numero?: number }) {
  const caja = chico ? "size-6 rounded-[8px]" : "size-8 rounded-[var(--radius-fila)]";
  return (
    <span aria-hidden className={`grid flex-none place-items-center bg-lienzo-2 ${caja}`}>
      {numero !== undefined ? (
        <span className="text-[13px] font-medium text-tenue tabular-nums">{numero}</span>
      ) : estado === "curso" ? (
        <svg viewBox="0 0 16 16" className={`girar ${chico ? "size-3" : "size-3.5"} text-espuma`}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : estado === "hecho" ? (
        <span className={`${chico ? "size-[7px]" : "size-2"} rounded-full bg-paso`} />
      ) : estado === "rebote" ? (
        <svg viewBox="0 0 16 16" className={`${chico ? "size-3" : "size-3.5"} text-cayo`}>
          <path className="trazar" pathLength={1} d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : estado === "regla" ? (
        <span className={`${chico ? "size-[7px]" : "size-2"} rounded-full bg-tenue-2`} />
      ) : (
        <span className={`${chico ? "size-[7px]" : "size-2"} rounded-full ring-[1.5px] ring-tenue-2 ring-inset`} />
      )}
    </span>
  );
}

/**
 * Corre una secuencia de pasos una sola vez, cuando la pieza entra en pantalla. Con «menos
 * movimiento» salta al último paso: se ve cómo terminó, sin la película.
 */
export function useSecuencia<T extends HTMLElement>(inicio: Omit<Paso, "en">, pasos: readonly Paso[] = []) {
  const ref = useRef<T>(null);
  const visto = useInView(ref, { once: true, amount: 0.6 });
  const quieto = useQuieto();
  const [actual, setActual] = useState<Omit<Paso, "en">>(inicio);

  useEffect(() => {
    if (pasos.length === 0) return;
    if (quieto) {
      setActual(pasos[pasos.length - 1]!);
      return;
    }
    if (!visto) return;
    const relojes = pasos.map((p) => window.setTimeout(() => setActual(p), p.en));
    return () => relojes.forEach((r) => window.clearTimeout(r));
    // Los pasos son constantes de cada fila; sólo importa cuándo se la ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visto, quieto]);

  return { ref, actual };
}

/** Una fila de tarjeta: indicador, título, una línea gris y, si hace falta, algo a la derecha. */
export function Fila({
  titulo,
  texto,
  estado,
  pasos,
  derecha,
  numero,
  chico = false,
}: {
  readonly titulo: ReactNode;
  readonly texto?: string;
  readonly estado: Estado;
  readonly pasos?: readonly Paso[];
  readonly derecha?: ReactNode;
  readonly numero?: number;
  readonly chico?: boolean;
}) {
  const { ref, actual } = useSecuencia<HTMLLIElement>({ estado, texto }, pasos);
  const linea = actual.texto ?? texto;
  return (
    <li
      ref={ref}
      className={`fila-escena flex items-center ${chico ? "gap-2.5 px-3.5 py-2" : "gap-3.5 px-5 py-3.5"}`}
    >
      <Indicador estado={actual.estado} chico={chico} numero={numero} />
      <div className="min-w-0 flex-1">
        <p className={`font-medium text-espuma sm:truncate ${chico ? "text-[13px]" : "text-[15px]"} tracking-[-0.011em]`}>
          {titulo}
          <span className="sr-only"> ({DICE[actual.estado]})</span>
        </p>
        {linea ? (
          <p
            className={`sm:truncate ${chico ? "text-[12px]" : "mt-0.5 text-[13.5px]"} ${
              actual.estado === "rebote" ? "text-cayo" : "text-tenue"
            }`}
          >
            {linea}
          </p>
        ) : null}
      </div>
      {actual.marca ? (
        <span className="flex-none rounded-full bg-lienzo-2 px-2.5 py-1 text-[12px] font-medium text-espuma">{actual.marca}</span>
      ) : null}
      {derecha}
    </li>
  );
}

/** La tarjeta blanca con su renglón de encabezado. */
export function Tarjeta({
  nombre,
  meta,
  icono,
  chica = false,
  className = "",
  children,
}: {
  readonly nombre: ReactNode;
  readonly meta?: ReactNode;
  readonly icono?: ReactNode;
  readonly chica?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`tarjeta-escena min-w-0 overflow-hidden ${chica ? "rounded-[16px]" : ""} ${className}`}>
      <div
        className={`flex items-center gap-2.5 text-tenue ${chica ? "px-3.5 py-2 text-[12px]" : "px-5 py-3.5 text-[14px]"}`}
      >
        {icono ?? <LogoPastilla className={chica ? "size-4 flex-none" : "size-[22px] flex-none"} />}
        <span className="min-w-0 flex-1 truncate">{nombre}</span>
        {meta ? <span className="flex-none text-apagado tabular-nums">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Una lista de filas: el `ul` va aparte para que la tarjeta pueda llevar otras cosas abajo. */
export function Filas({ children }: { readonly children: ReactNode }) {
  return <ul className="shadow-[inset_0_1px_0_rgb(11_13_16/0.06)]">{children}</ul>;
}

/** Algo que en la app es un botón y acá es parte del dibujo. */
export function BotonDibujado({ children, fuerte = false }: { readonly children: ReactNode; readonly fuerte?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-7 flex-none items-center rounded-full px-3 text-[12.5px] font-medium ${
        fuerte ? "bg-espuma text-lienzo" : "bg-lienzo-2 text-tinta"
      }`}
    >
      {children}
    </span>
  );
}

/** Un círculo con la inicial: el avatar de un agente o de una persona en el encabezado. */
export function Avatar({ letra }: { readonly letra: string }) {
  return (
    <span aria-hidden className="grid size-[22px] flex-none place-items-center rounded-full bg-lienzo-3 text-[11px] font-medium text-tinta">
      {letra}
    </span>
  );
}
