"use client";

import { useCallback, useEffect, useState } from "react";
import { numero, pedir, SinSesion, type Resumen } from "./api";
import { Ingreso } from "./Ingreso";
import { Crashes } from "./Crashes";
import { Comentarios } from "./Comentarios";
import { Descargas } from "./Descargas";
import { Visitas } from "./Visitas";
import { Boton } from "./piezas";

const PESTANAS = [
  ["crashes", "Crashes"],
  ["comentarios", "Comentarios"],
  ["descargas", "Descargas"],
  ["visitas", "Visitas"],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

/**
 * El panel de admin de odolphin.tech. Es una página estática como el resto de la web: todo lo que
 * muestra lo pide a /api/admin/* con la cookie de sesión. Sin sesión, la puerta.
 */
export function Panel() {
  const [sesion, setSesion] = useState<"viendo" | "sin" | "con">("viendo");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [pestana, setPestana] = useState<Pestana>("crashes");

  const leerResumen = useCallback(async () => {
    try {
      setResumen(await pedir<Resumen>("/resumen?dias=7"));
      setSesion("con");
    } catch (e) {
      if (e instanceof SinSesion) setSesion("sin");
    }
  }, []);

  useEffect(() => {
    void pedir<{ sesion: boolean }>("/sesion")
      .then((r) => (r.sesion ? leerResumen() : setSesion("sin")))
      .catch(() => setSesion("sin"));
    const desdeHash = window.location.hash.slice(1).split("-")[0];
    if (PESTANAS.some(([p]) => p === desdeHash)) setPestana(desdeHash as Pestana);
    else if (window.location.hash.startsWith("#crash-")) setPestana("crashes");
  }, [leerResumen]);

  async function salir() {
    await pedir("/salir", { metodo: "POST" }).catch(() => {});
    setSesion("sin");
    setResumen(null);
  }

  if (sesion === "viendo") {
    return (
      <main id="contenido" className="grid min-h-dvh place-items-center bg-lienzo-2" aria-busy="true">
        <span className="size-5 animate-spin rounded-full border-2 border-tenue-2 border-t-espuma" aria-label="Cargando" />
      </main>
    );
  }
  if (sesion === "sin") return <Ingreso alEntrar={leerResumen} />;

  const avisos: Record<Pestana, number> = {
    crashes: resumen?.crashesSinVer ?? 0,
    comentarios: resumen?.comentariosSinVer ?? 0,
    descargas: 0,
    visitas: 0,
  };

  return (
    <main id="contenido" className="min-h-dvh bg-lienzo">
      <div className="mx-auto max-w-[1100px] px-4 pt-8 pb-24 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-[var(--tracking-titulo)] text-espuma">Panel de Dolphin</h1>
            <p className="text-[14px] text-tenue">Últimos 7 días</p>
          </div>
          <div className="flex gap-2">
            <Boton onClick={() => void leerResumen()}>Actualizar</Boton>
            <Boton onClick={salir}>Salir</Boton>
          </div>
        </header>

        {resumen && (
          <dl className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cifra nombre="Crashes sin ver" valor={resumen.crashesSinVer} alerta={resumen.crashesSinVer > 0} detalle={`${numero(resumen.firmasAbiertas)} abiertos`} />
            <Cifra nombre="Crashes en 7 días" valor={resumen.crashesPeriodo} />
            <Cifra nombre="Visitas en 7 días" valor={resumen.visitasPeriodo} />
            <Cifra nombre="Clics en Descargar" valor={resumen.clicsPeriodo} detalle="en 7 días" />
          </dl>
        )}

        {/* En el celular, 2×2: las cuatro en fila no entran a 390 px con sus contadores. */}
        <nav aria-label="Secciones del panel" className="mt-8 grid grid-cols-2 gap-1 rounded-[22px] bg-lienzo-2 p-1 md:flex md:rounded-full">
          {PESTANAS.map(([id, nombre]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setPestana(id);
                history.replaceState(null, "", `#${id}`);
              }}
              aria-current={pestana === id ? "page" : undefined}
              className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-[14px] text-tenue transition-colors duration-150 hover:text-espuma aria-[current=page]:bg-lienzo aria-[current=page]:text-espuma aria-[current=page]:shadow-[0_1px_2px_rgb(11_13_16/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico"
            >
              {nombre}
              {avisos[id] > 0 && (
                <span className="rounded-full bg-cayo px-1.5 font-codigo text-[11px] leading-[18px] text-white">{avisos[id]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {pestana === "crashes" && <Crashes alCambiar={leerResumen} />}
          {pestana === "comentarios" && <Comentarios alCambiar={leerResumen} />}
          {pestana === "descargas" && <Descargas />}
          {pestana === "visitas" && <Visitas />}
        </div>
      </div>
    </main>
  );
}

function Cifra({ nombre, valor, detalle, alerta }: { readonly nombre: string; readonly valor: number; readonly detalle?: string; readonly alerta?: boolean }) {
  return (
    <div className="rounded-caja bg-lienzo-2 px-4 py-4">
      <dt className="text-[13px] text-tenue">{nombre}</dt>
      <dd className={`mt-1 font-codigo text-[28px] tabular-nums ${alerta ? "text-cayo" : "text-espuma"}`}>{numero(valor)}</dd>
      {detalle && <dd className="text-[12px] text-tenue">{detalle}</dd>}
    </div>
  );
}
