"use client";

import { useCallback, useEffect, useState } from "react";
import { haceCuanto, numero, pedir, type Descargas as DatosDescargas } from "./api";
import { Barras, Estado } from "./piezas";

const SISTEMAS = [
  ["windows", "Windows"],
  ["macos", "macOS"],
  ["linux", "Linux"],
] as const;

/**
 * Las descargas las cuenta GitHub por archivo. Acá se leen como tres cosas distintas: instaladores
 * bajados (gente), chequeos de actualización (apps instaladas que se fijan si hay versión nueva) y
 * clics al botón Descargar de la web.
 */
export function Descargas() {
  const [datos, setDatos] = useState<DatosDescargas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<DatosDescargas>("/descargas?dias=30"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las descargas.");
    }
  }, []);

  useEffect(() => void cargar(), [cargar]);

  if (error) return <Estado tono="error" texto={error} accion={{ texto: "Reintentar", alHacer: cargar }} />;
  if (!datos) return <Estado tono="cargando" texto="Preguntándole a GitHub…" />;

  const g = datos.github;
  const clicsPorDia = Object.entries(
    datos.clics.reduce<Record<string, number>>((acc, c) => ((acc[c.dia] = (acc[c.dia] ?? 0) + c.n), acc), {}),
  ).map(([dia, n]) => ({ dia, n }));
  const clicsPorSistema = (s: string) => datos.clics.filter((c) => c.sistema === s).reduce((t, c) => t + c.n, 0);

  return (
    <div className="flex flex-col gap-8">
      {datos.error && <Estado tono="error" texto={datos.error} accion={{ texto: "Reintentar", alHacer: cargar }} />}
      {g && (
        <section aria-labelledby="t-instaladores">
          <h2 id="t-instaladores" className="text-[17px] font-medium text-espuma">Instaladores bajados, en total</h2>
          <p className="mt-1 text-[13px] text-tenue">
            Desde GitHub Releases · consultado {haceCuanto(g.consultado)}
            {g.viejo ? " · GitHub no contestó, son los últimos números que dio" : ""}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {SISTEMAS.map(([clave, nombre]) => (
              <div key={clave} className="rounded-caja bg-lienzo-2 px-4 py-4">
                <p className="text-[13px] text-tenue">{nombre}</p>
                <p className="mt-1 font-codigo text-[28px] tabular-nums text-espuma">{numero(g.total.instaladores[clave])}</p>
                <p className="mt-1 text-[12px] text-tenue">{numero(g.total.chequeos[clave])} chequeos de actualización</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="t-clics">
        <h2 id="t-clics" className="text-[17px] font-medium text-espuma">Clics en «Descargar» de la web · últimos {datos.dias} días</h2>
        <p className="mt-1 text-[13px] text-tenue">
          {SISTEMAS.map(([clave, nombre]) => `${nombre} ${numero(clicsPorSistema(clave))}`).join(" · ")}
        </p>
        <div className="mt-4 rounded-caja bg-lienzo-2 p-4">
          <Barras datos={clicsPorDia} dias={datos.dias} etiqueta="Clics en Descargar por día" />
        </div>
      </section>

      {g && g.versiones.length > 0 && (
        <section aria-labelledby="t-versiones">
          <h2 id="t-versiones" className="text-[17px] font-medium text-espuma">Por versión</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-tenue">
                  <th className="px-3 py-1 font-medium">Versión</th>
                  {SISTEMAS.map(([c, n]) => (
                    <th key={c} className="px-3 py-1 text-right font-medium">{n}</th>
                  ))}
                  <th className="px-3 py-1 text-right font-medium">Actualizaciones</th>
                </tr>
              </thead>
              <tbody>
                {g.versiones.map((v) => (
                  <tr key={v.tag} className="bg-lienzo-2">
                    <td className="rounded-l-fila px-3 py-2.5">
                      <span className="text-espuma">{v.tag}</span>
                      <span className="ml-2 text-[12px] text-tenue">{v.publicada ? haceCuanto(v.publicada) : ""}</span>
                    </td>
                    {SISTEMAS.map(([c]) => (
                      <td key={c} className="px-3 py-2.5 text-right font-codigo tabular-nums text-tinta">{numero(v.instaladores[c])}</td>
                    ))}
                    <td className="rounded-r-fila px-3 py-2.5 text-right font-codigo tabular-nums text-tinta">{numero(v.actualizaciones)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
