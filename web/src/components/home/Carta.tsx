"use client";

import { useInView } from "motion/react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Logo } from "@/components/Logo";
import { Rumbo } from "./Rumbo";

/**
 * Dónde se mete Dolphin, en un solo dibujo: lo que le das entra por la izquierda, los agentes lo
 * trabajan en el medio y por la derecha sale lo que revisás.
 *
 * Viene del «hub» de aycode.ai (24/11/2026, Nico: «copiémonos un poco de esta página»): antes de
 * cualquier lista de funciones, contesta «¿dónde encaja esto en lo que ya hago?». Lo que NO se trajo
 * de allá: el glow, las etiquetas con borde de color y el núcleo que entra girando.
 *
 * No es una captura y no pretende serlo: es un diagrama de flujo, no una pantalla de la app (la regla
 * del 12/11 es que toda IMAGEN DE PRODUCTO sea real; esto no muestra producto). Los logos de los
 * agentes son los de verdad, los mismos de `TraeTuAgente`.
 *
 * En el celular no hay caminos curvos: las tres columnas se apilan y las une una línea vertical.
 */
type Clave = "issue" | "pedido" | "tarjeta" | "rama" | "pr" | "registro";

interface Nodo {
  readonly clave: Clave;
  readonly texto: string;
  readonly detalle: string;
  readonly icono: ReactNode;
}

const ENTRAN: readonly Nodo[] = [
  { clave: "issue", texto: "Un issue de GitHub", detalle: "«Comenzar» y arranca", icono: <IconoGithub /> },
  { clave: "pedido", texto: "Lo que le pedís", detalle: "escrito o dictado", icono: <IconoCharla /> },
  { clave: "tarjeta", texto: "Una tarjeta del tablero", detalle: "la soltás en Haciendo", icono: <IconoTablero /> },
];

const SALEN: readonly Nodo[] = [
  { clave: "rama", texto: "Una rama probada", detalle: "pasó las ocho fases del portón", icono: <IconoRama /> },
  { clave: "pr", texto: "Su pull request", detalle: "esperando tu revisión", icono: <IconoPr /> },
  { clave: "registro", texto: "Lo que hizo", detalle: "cada paso y cada línea", icono: <IconoRegistro /> },
];

const AGENTES = [
  { nombre: "Claude", src: "/agentes/claude.svg" },
  { nombre: "Codex", src: "/agentes/codex.webp" },
  { nombre: "Gemini", src: "/agentes/gemini.png" },
] as const;

export function Carta() {
  const caja = useRef<HTMLDivElement>(null);
  const centro = useRef<HTMLDivElement>(null);
  const refs: Record<Clave, RefObject<HTMLDivElement | null>> = {
    issue: useRef<HTMLDivElement>(null),
    pedido: useRef<HTMLDivElement>(null),
    tarjeta: useRef<HTMLDivElement>(null),
    rama: useRef<HTMLDivElement>(null),
    pr: useRef<HTMLDivElement>(null),
    registro: useRef<HTMLDivElement>(null),
  };
  const visible = useInView(caja, { once: true, margin: "0px 0px -20% 0px" });
  const [apuntado, setApuntado] = useState<Clave | "centro" | null>(null);

  const nodo = (n: Nodo, lado: "entra" | "sale") => (
    <div
      key={n.clave}
      ref={refs[n.clave]}
      onPointerEnter={() => setApuntado(n.clave)}
      onPointerLeave={() => setApuntado(null)}
      className={`relative z-10 flex items-center gap-3 rounded-control px-4 py-3 transition-colors duration-[160ms] ${
        apuntado === n.clave ? "bg-lienzo-3" : "bg-lienzo-2"
      } ${lado === "sale" ? "md:flex-row-reverse md:text-right" : ""}`}
    >
      <span className={`flex-none transition-colors duration-[160ms] ${apuntado === n.clave ? "text-electrico" : "text-tenue"}`}>
        {n.icono}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-medium text-espuma">{n.texto}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-apagado">{n.detalle}</span>
      </span>
    </div>
  );

  // Un camino está encendido si la persona apunta a cualquiera de sus dos extremos.
  const encendido = (clave: Clave) => apuntado === clave || apuntado === "centro";

  return (
    <section aria-labelledby="carta-titulo" className="px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="grid gap-x-14 gap-y-4 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:items-end">
          <h2 id="carta-titulo" className="titulo-seccion">
            Lo que entra y lo que sale.
          </h2>
          <p className="bajada max-w-[44ch]">
            Le das un issue, un pedido o una tarjeta. Dolphin lo reparte entre tus agentes y te devuelve una rama
            que ya pasó el portón, su PR y el registro de lo que hizo.
          </p>
        </div>

        <div
          ref={caja}
          className="relative mt-12 grid items-center gap-6 rounded-escena bg-lienzo-2/60 p-5 sm:p-8 md:mt-16 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:gap-16 md:p-14"
        >
          <div className="flex flex-col gap-3">
            <p className="mb-1 text-[13px] text-apagado md:hidden">Entra</p>
            {ENTRAN.map((n) => nodo(n, "entra"))}
          </div>

          <Uniones />

          <div
            ref={centro}
            onPointerEnter={() => setApuntado("centro")}
            onPointerLeave={() => setApuntado(null)}
            className="relative z-10 mx-auto flex w-full max-w-[260px] flex-col items-center rounded-tarjeta bg-app px-6 py-8 text-center"
          >
            <Logo className="h-10 w-auto text-app-espuma" />
            <p className="mt-4 text-[17px] font-medium text-app-espuma">Dolphin</p>
            <p className="mt-1 text-[13px] leading-snug text-app-tenue">cada tarea en su rama, con el agente que elijas</p>
            <ul aria-label="Agentes" className="mt-5 flex items-center gap-2">
              {AGENTES.map((a) => (
                <li key={a.nombre} className="rounded-full bg-app-3 p-1.5" title={a.nombre}>
                  <img src={a.src} alt={a.nombre} width={20} height={20} className="size-5 rounded-[5px]" />
                </li>
              ))}
              <li className="px-1 text-[12px] text-app-apagado">+7</li>
            </ul>
          </div>

          <Uniones />

          <div className="flex flex-col gap-3">
            <p className="mb-1 text-[13px] text-apagado md:hidden">Sale</p>
            {SALEN.map((n) => nodo(n, "sale"))}
          </div>

          {/* Los caminos sólo en md+: apilado, una curva de un nodo al centro cruzaría el texto.
              `contents` y no `block`: una caja acá sería una cuarta celda de la grilla, una fila
              vacía abajo; sin caja, cada SVG se posiciona contra la carta. */}
          <div className="hidden md:contents">
            {ENTRAN.map((n, i) => (
              <Rumbo
                key={n.clave}
                contenedor={caja}
                desde={refs[n.clave]}
                hasta={centro}
                curva={(1 - i) * 28}
                retraso={i * 0.4}
                visible={visible}
                encendido={encendido(n.clave)}
              />
            ))}
            {SALEN.map((n, i) => (
              <Rumbo
                key={n.clave}
                contenedor={caja}
                desde={centro}
                hasta={refs[n.clave]}
                curva={(i - 1) * 28}
                retraso={1.2 + i * 0.4}
                visible={visible}
                encendido={encendido(n.clave)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** En el celular, la línea que une las columnas apiladas; en md+ desaparece y quedan los caminos. */
function Uniones() {
  return <div aria-hidden className="mx-auto h-8 w-px bg-lienzo-4 md:hidden" />;
}

/* Íconos de 16 px en currentColor, trazo de 1,5 como el resto de la web. */
function IconoGithub() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Trazo({ children }: { readonly children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function IconoCharla() {
  return (
    <Trazo>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </Trazo>
  );
}

function IconoTablero() {
  return (
    <Trazo>
      <rect x="2" y="2.5" width="3.5" height="11" rx="1" />
      <rect x="6.25" y="2.5" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="2.5" width="3.5" height="9" rx="1" />
    </Trazo>
  );
}

function IconoRama() {
  return (
    <Trazo>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6M11.5 7c0 2.5-7 1.5-7 4" />
    </Trazo>
  );
}

function IconoPr() {
  return (
    <Trazo>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
      <path d="M4 5v6M12 11V6.5a2 2 0 0 0-2-2H7.5m0 0 1.5-1.5M7.5 4.5 9 6" />
    </Trazo>
  );
}

function IconoRegistro() {
  return (
    <Trazo>
      <path d="M3 3.5h10M3 8h10M3 12.5h6" />
    </Trazo>
  );
}
