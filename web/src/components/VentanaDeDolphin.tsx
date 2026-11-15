import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * La ventana de Dolphin: la interfaz de la app, dibujada en la web.
 *
 * Es el marco que va alrededor de la demo del chat. No es una captura ni una aproximación libre:
 * las secciones, el orden de la barra lateral, las pestañas de arriba y el encabezado del agente
 * son los de la app de escritorio (ver `capturas/escritorio-chat.webp`, que es una foto de la app
 * de verdad). Quien entra a la página tiene que reconocer lo que va a instalar.
 *
 * Why dibujada y no un `<img>`: adentro de este marco pasa algo —la conversación avanza, se toca
 * para cambiar el pedido— y una imagen no se toca. Es la misma razón por la que el tablero de la
 * home es un tablero y no un PNG.
 *
 * En un panel angosto la barra lateral se va: lo que hay que ver es la conversación, y 180 px de
 * menú en un celular se comen la mitad de la pantalla.
 */

/**
 * Las vistas que la app tiene HOY, copiadas de
 * `escritorio/src/renderer/src/components/lienzo/paneles-que-se-abren.tsx`.
 *
 * Estaban escritas de memoria y había dos que ya no existen (Nico, 09/11/2026: «estás mostrando
 * encima cosas que ya ni están»). Si se agrega o se saca una vista en la app, esta lista queda
 * vieja: es el precio de dibujar la interfaz en vez de servirla, y por eso está escrito acá.
 */
const SECCIONES = ["Archivos", "En vivo", "Tablero", "Git", "Cosechas", "Bandeja", "Memoria", "Bots"] as const;

export function VentanaDeDolphin({
  pestanas,
  activa,
  agente,
  estado,
  children,
}: {
  readonly pestanas: readonly string[];
  readonly activa: number;
  readonly agente: string;
  readonly estado: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-ventana)] bg-app shadow-[0_30px_80px_-24px_rgba(11,13,16,0.55)] ring-1 ring-app-espuma/10">
      <BarraDePestanas pestanas={pestanas} activa={activa} />
      <div className="flex min-h-0">
        <BarraLateral />
        <div className="flex min-w-0 flex-1 flex-col">
          <EncabezadoDelAgente agente={agente} estado={estado} />
          {children}
        </div>
      </div>
    </div>
  );
}

function BarraDePestanas({ pestanas, activa }: { readonly pestanas: readonly string[]; readonly activa: number }) {
  return (
    <div className="flex items-stretch gap-px bg-app-2 pr-3">
      {pestanas.map((titulo, i) => (
        <div
          key={titulo}
          className={`flex min-w-0 max-w-[14rem] flex-1 items-center gap-2 px-3 py-2.5 text-[12px] ${
            i === activa ? "bg-app text-app-espuma" : "text-app-apagado"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${i === activa ? "bg-paso" : "bg-app-espuma/25"}`}
          />
          <span className="truncate">{titulo}</span>
        </div>
      ))}
      {/* Los controles de ventana, a la derecha, como en Windows. */}
      <div className="ml-auto flex items-center gap-3 pl-4 text-app-apagado">
        {["—", "▢", "✕"].map((c) => (
          <span key={c} aria-hidden className="text-[11px] leading-none">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarraLateral() {
  return (
    <nav aria-hidden className="hidden w-[172px] shrink-0 flex-col gap-0.5 bg-app-2 p-2 sm:flex">
      {SECCIONES.map((seccion) => (
        <span
          key={seccion}
          className={`flex items-center gap-2 rounded-[var(--radius-fila)] px-2.5 py-1.5 text-[13px] ${
            seccion === "Tablero" ? "bg-app-4 text-app-espuma" : "text-app-tenue"
          }`}
        >
          <Punto />
          {seccion}
        </span>
      ))}
      <span className="mt-3 px-2.5 text-[11px] text-app-apagado">Proyectos</span>
      <span className="flex items-center gap-2 rounded-[var(--radius-fila)] px-2.5 py-1.5 text-[13px] text-app-tinta">
        <Logo className="h-2.5 w-auto" />
        dolphin-app
      </span>
    </nav>
  );
}

/** Un punto en lugar de un ícono por sección: a 13 px, siete íconos distintos son ruido. */
function Punto() {
  return <span aria-hidden className="size-1 shrink-0 rounded-full bg-app-espuma/35" />;
}

function EncabezadoDelAgente({ agente, estado }: { readonly agente: string; readonly estado: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-app-espuma/10 px-4 py-2.5 sm:px-5">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-paso" />
      <span className="shrink-0 text-[13px] font-medium text-app-espuma">{agente}</span>
      <span className="min-w-0 truncate text-[12px] text-app-apagado">{estado}</span>
    </div>
  );
}
