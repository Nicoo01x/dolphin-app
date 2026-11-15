"use client";

import type { ReactNode } from "react";
import { BotonDibujado, Fila, Filas, Tarjeta } from "./piezas";
import { PAISAJES, type Paisaje } from "./Lamina";

/**
 * «Y además»: doce funciones chicas, cada una con su tarjeta chica sobre un recorte de los mismos
 * paisajes, un título de dos a cuatro palabras y una línea.
 *
 * Es la grilla de la web de la base (cada función es una mini-maqueta del producto y no un ícono con un
 * párrafo) con la forma de esta web. Las doce salen del inventario con evidencia de
 * `docs/reforma/web-12-11/direccion.md`; ninguna está sólo en una rama sin integrar.
 */

interface Celda {
  readonly titulo: string;
  readonly linea: ReactNode;
  readonly paisaje: Paisaje;
  readonly foco: string;
  readonly tarjeta: ReactNode;
}

const c = (s: string) => <code className="font-codigo text-[0.9em] text-tinta">{s}</code>;

const CELDAS: readonly Celda[] = [
  {
    titulo: "Vim y Emacs",
    linea: "El editor trae los dos teclados, con la barra de modo de Vim.",
    paisaje: PAISAJES.lago,
    foco: "15% 60%",
    tarjeta: (
      <Tarjeta chica nombre="Teclado del editor">
        <Filas>
          <Fila chico titulo="Normal" estado="espera" />
          <Fila chico titulo="Vim" texto="-- NORMAL --" estado="hecho" />
          <Fila chico titulo="Emacs" estado="espera" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Tab sin modelo",
    linea: "En modo local sugiere el próximo renombre a partir de tu última edición, sin red.",
    paisaje: PAISAJES.andes,
    foco: "20% 40%",
    tarjeta: (
      <Tarjeta chica nombre="src/carrito/iva.ts" meta="Tab">
        <div className="space-y-1 px-3.5 py-3 font-codigo text-[12px] leading-[20px] shadow-[inset_0_1px_0_rgb(11_13_16/0.06)]">
          <p className="overflow-hidden text-ellipsis whitespace-pre text-tinta">const totalConIva = sumar(neto)</p>
          <p className="truncate text-tinta">
            return <span className="text-apagado">totalConIva</span>
            <span className="ml-1.5 rounded-[5px] bg-lienzo-2 px-1.5 font-texto text-[11px] text-tenue">Tab</span>
          </p>
        </div>
      </Tarjeta>
    ),
  },
  {
    titulo: "Primero la prueba",
    linea: <>{c("dolphin bug")} escribe una prueba que falla hoy y recién después el arreglo.</>,
    paisaje: PAISAJES.meandro,
    foco: "90% 55%",
    tarjeta: (
      <Tarjeta chica nombre="bug · el total no suma el envío">
        <Filas>
          <Fila chico titulo="La prueba que lo reproduce" texto="falla hoy, como tiene que ser" estado="rebote" />
          <Fila chico titulo="El arreglo" texto="intento 1 de 3" estado="curso" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Tres motores, una tarea",
    linea: <>{c("dolphin comparar")} pone las tres apps andando lado a lado, en video.</>,
    paisaje: PAISAJES.merced,
    foco: "70% 70%",
    tarjeta: (
      <Tarjeta chica nombre="comparar · filtro por fecha">
        <Filas>
          <Fila chico titulo="Claude Code" texto="pasó · US$ 0,61" estado="hecho" />
          <Fila chico titulo="Codex" texto="pasó · 21 mil tokens" estado="hecho" />
          <Fila chico titulo="Antigravity" texto="rebotó en pantalla" estado="rebote" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Guardian en main",
    linea: "Vigila tu rama principal sin gastar tokens y busca el commit culpable.",
    paisaje: PAISAJES.desfiladero,
    foco: "20% 80%",
    tarjeta: (
      <Tarjeta chica nombre="guardian · main">
        <Filas>
          <Fila chico titulo="test" texto="falló 2 de 2 veces · no es inestable" estado="rebote" />
          <Fila chico titulo="git bisect" texto="el culpable es 4e1a0c2" estado="hecho" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "El portón por MCP",
    linea: "Tu Claude Code prueba una rama y recibe el motivo del rebote, sin gastar.",
    paisaje: PAISAJES.delaware,
    foco: "15% 70%",
    tarjeta: (
      <Tarjeta chica nombre="porton_probar · dolphin/login">
        <Filas>
          <Fila chico titulo="tus scripts" texto="test: ✖ suma con negativos" estado="rebote" />
          <Fila chico titulo="visión y revisión" texto="no corren: cuestan" estado="espera" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Desde Telegram",
    linea: "La terminal de Dolphin en el celular, con archivos, fotos y notas de voz.",
    paisaje: PAISAJES.lagoQuieto,
    foco: "80% 70%",
    tarjeta: (
      <Tarjeta chica nombre="Dolphin · Telegram">
        <Filas>
          <Fila chico titulo="/parte" texto="vos · 07:12" estado="regla" />
          <Fila chico titulo="3 tareas, 2 pasaron" texto="avisar stock rebotó en pantalla" estado="hecho" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Deshacer por compañero",
    linea: "Revisás lo de cada agente y deshacés lo de uno sin tocar lo de los otros.",
    paisaje: PAISAJES.lago,
    foco: "85% 40%",
    tarjeta: (
      <Tarjeta chica nombre="revisar · exportar a CSV">
        <Filas>
          <Fila chico titulo="backend" texto="+38 −4 · 2 archivos" estado="hecho" />
          <Fila chico titulo="ux" texto="+52 −11 · 3 archivos" estado="hecho" derecha={<BotonDibujado>deshacer</BotonDibujado>} />
          <Fila chico titulo="tests" texto="+64 · 1 archivo" estado="hecho" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Git en la terminal",
    linea: "Ramas, commits y el grafo en una sección Git, como lazygit.",
    paisaje: PAISAJES.andes,
    foco: "85% 60%",
    tarjeta: (
      <Tarjeta chica nombre="git · ramas">
        <Filas>
          <Fila chico titulo="main" texto="a3f9c21 · ordenar los pedidos por fecha" estado="hecho" />
          <Fila chico titulo="dolphin/exportar-csv" texto="3 commits adelante" estado="curso" />
          <Fila chico titulo="dolphin/cupones" texto="lista para integrar" estado="regla" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Modo aislado",
    linea: "El agente corre en una caja que sólo ve su worktree.",
    paisaje: PAISAJES.merced,
    foco: "10% 40%",
    tarjeta: (
      <Tarjeta chica nombre="aislamiento">
        <Filas>
          <Fila chico titulo="Docker" texto="en uso · ve su worktree y nada más" estado="hecho" />
          <Fila chico titulo="Podman" estado="espera" />
          <Fila chico titulo="bubblewrap" estado="espera" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "El explorador",
    linea: "Recorre tu app como una persona y anota en la Bandeja lo que no anda.",
    paisaje: PAISAJES.meandro,
    foco: "35% 30%",
    tarjeta: (
      <Tarjeta chica nombre="Bandeja">
        <Filas>
          <Fila chico titulo="Pagar no responde en el celular" texto="explorador · /checkout" estado="rebote" />
          <Fila chico titulo="El buscador ignora las tildes" texto="explorador · /productos" estado="rebote" />
        </Filas>
      </Tarjeta>
    ),
  },
  {
    titulo: "Seguir solo",
    linea: <>{c("dolphin seguir")} empuja tu última sesión de Claude Code hasta que termine.</>,
    paisaje: PAISAJES.desfiladero,
    foco: "80% 30%",
    tarjeta: (
      <Tarjeta chica nombre="seguir · sesión de Claude Code">
        <Filas>
          <Fila chico titulo="turno 7" texto="sin que le escribas «seguí»" estado="curso" />
        </Filas>
      </Tarjeta>
    ),
  },
];

export function TodoLoDemas() {
  return (
    <section id="ademas" aria-labelledby="ademas-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="ademas-titulo" className="titulo-seccion">
          Y además
        </h2>
        <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {CELDAS.map((celda) => (
            <li key={celda.titulo} className="min-w-0">
              <div className="relative flex h-[256px] items-center justify-center overflow-hidden rounded-[24px] p-5">
                <img
                  src={celda.paisaje.src}
                  width={celda.paisaje.ancho}
                  height={celda.paisaje.alto}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover"
                  style={{ objectPosition: celda.foco }}
                />
                <div className="relative w-full max-w-[280px]">{celda.tarjeta}</div>
              </div>
              <h3 className="mt-4 text-[17px] font-medium tracking-[-0.014em] text-espuma">{celda.titulo}</h3>
              <p className="mt-1 text-[15px] leading-[1.45] text-tenue">{celda.linea}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
