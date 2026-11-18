"use client";

import { useCallback, useEffect, useState } from "react";
import { numero, pedir, type Visitas as DatosVisitas } from "./api";
import { Barras, Estado, Ranking, Vacio } from "./piezas";

const PERIODOS = [7, 30, 90] as const;

/** Los dos orígenes que no son un sitio (web/servidor/visitas.mjs → origenDe). */
const NOMBRE_DE_ORIGEN: Record<string, string> = {
  directo: "Directo (sin sitio de origen)",
  interno: "Desde otra página de odolphin.tech",
};

/** Las visitas de odolphin.tech: cuántas por día, qué páginas y de dónde llega la gente. */
export function Visitas() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [datos, setDatos] = useState<DatosVisitas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<DatosVisitas>(`/visitas?dias=${dias}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las visitas.");
    }
  }, [dias]);

  useEffect(() => void cargar(), [cargar]);

  if (error) return <Estado tono="error" texto={error} accion={{ texto: "Reintentar", alHacer: cargar }} />;
  if (!datos) return <Estado tono="cargando" texto="Contando visitas…" />;

  const total = datos.porDia.reduce((t, d) => t + d.n, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-codigo text-[32px] tabular-nums text-espuma">{numero(total)}</p>
          <p className="text-[13px] text-tenue">visitas en los últimos {dias} días, sin bots</p>
        </div>
        <div role="radiogroup" aria-label="Período" className="flex gap-1 rounded-full bg-lienzo-2 p-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={dias === p}
              onClick={() => setDias(p)}
              className="h-8 rounded-full px-3 text-[13px] text-tenue transition-colors duration-150 hover:text-espuma aria-checked:bg-lienzo aria-checked:text-espuma focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico"
            >
              {p} días
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <Vacio titulo="Todavía no hay visitas contadas" texto="El contador se prendió con esta versión de la web: a partir de ahora cada página vista suma acá." />
      ) : (
        <>
          <div className="rounded-caja bg-lienzo-2 p-4">
            <Barras datos={datos.porDia} dias={dias} etiqueta={`${total} visitas en ${dias} días`} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="t-paginas">
              <h2 id="t-paginas" className="mb-3 text-[17px] font-medium text-espuma">Páginas</h2>
              <Ranking filas={datos.porRuta.map((r) => ({ nombre: r.ruta, n: r.n }))} />
            </section>
            <section aria-labelledby="t-origenes">
              <h2 id="t-origenes" className="mb-3 text-[17px] font-medium text-espuma">De dónde vienen</h2>
              <Ranking filas={datos.porOrigen.map((o) => ({ nombre: NOMBRE_DE_ORIGEN[o.origen] ?? o.origen, n: o.n }))} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
