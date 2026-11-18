"use client";

import { useCallback, useEffect, useState } from "react";
import { haceCuanto, nombrePlataforma, numero, pedir, type Firma, type Reporte, type ReporteCorto } from "./api";
import { Boton, Estado, Fila, Vacio } from "./piezas";

/**
 * Los crashes agrupados por firma: el mismo crash en mil máquinas es UNA fila con su contador.
 * Los abiertos arriba; abrir una fila muestra cada vez que pasó y el reporte entero, ahí mismo.
 */
export function Crashes({ alCambiar }: { readonly alCambiar: () => void }) {
  const [firmas, setFirmas] = useState<Firma[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setFirmas((await pedir<{ firmas: Firma[] }>("/crashes")).firmas);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los crashes.");
    }
  }, []);

  useEffect(() => {
    void cargar();
    const desdeHash = window.location.hash.match(/^#crash-([0-9a-f]{16})$/)?.[1];
    if (desdeHash) setAbierta(desdeHash);
  }, [cargar]);

  if (error) return <Estado tono="error" texto={error} accion={{ texto: "Reintentar", alHacer: cargar }} />;
  if (!firmas) return <Estado tono="cargando" texto="Leyendo los crashes…" />;
  if (firmas.length === 0) {
    return <Vacio titulo="Ningún crash todavía" texto="Cuando alguien acepte mandar un reporte desde la app, aparece acá agrupado con los iguales." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {firmas.map((f) => (
        <FilaDeFirma
          key={f.firma}
          firma={f}
          abierta={abierta === f.firma}
          alAlternar={() => setAbierta(abierta === f.firma ? null : f.firma)}
          alCambiar={() => (void cargar(), alCambiar())}
        />
      ))}
    </ul>
  );
}

function FilaDeFirma({ firma: f, abierta, alAlternar, alCambiar }: { readonly firma: Firma; readonly abierta: boolean; readonly alAlternar: () => void; readonly alCambiar: () => void }) {
  const resuelta = Boolean(f.resuelto_en);
  return (
    <li id={`crash-${f.firma}`}>
      <Fila abierta={abierta} alAlternar={alAlternar} apagada={resuelta}>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            {f.sin_ver > 0 && !resuelta && <span className="size-2 shrink-0 rounded-full bg-cayo" aria-label="sin ver" />}
            <span className="truncate text-[15px] font-medium text-espuma" title={f.titulo ?? undefined}>
              {f.titulo ?? "Crash sin datos"}
            </span>
          </span>
          <span className="truncate text-[13px] text-tenue">
            {resuelta ? `Resuelto ${haceCuanto(f.resuelto_en!)}${f.version_al_resolver ? ` · en ${f.version_al_resolver}` : ""}` : `Última vez ${haceCuanto(f.ultima)}`} ·{" "}
            {(f.versiones ?? "").split(",").filter(Boolean).map((v) => `v${v}`).join(", ") || "sin versión"} ·{" "}
            {(f.plataformas ?? "").split(",").filter(Boolean).map(nombrePlataforma).join(", ") || "—"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-codigo text-[20px] tabular-nums text-espuma">{numero(f.veces)}</span>
          <span className="block text-[12px] text-tenue">{f.veces === 1 ? "vez" : "veces"}</span>
        </span>
      </Fila>
      {abierta && <DetalleDeFirma firma={f} alCambiar={alCambiar} />}
    </li>
  );
}

function DetalleDeFirma({ firma: f, alCambiar }: { readonly firma: Firma; readonly alCambiar: () => void }) {
  const [reportes, setReportes] = useState<ReporteCorto[] | null>(null);
  const [elegido, setElegido] = useState<Reporte | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pedir<{ reportes: ReporteCorto[] }>(`/crashes/${f.firma}`)
      .then(async (r) => {
        setReportes(r.reportes);
        if (r.reportes[0]) setElegido((await pedir<{ reporte: Reporte }>(`/reportes/${r.reportes[0].id}`)).reporte);
        // Abrir el crash es haberlo visto, con todas sus veces: si no, el contador de arriba no baja.
        if (f.sin_ver > 0) {
          await pedir(`/crashes/${f.firma}/visto`, { metodo: "POST", cuerpo: {} });
          alCambiar();
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo abrir."));
    // Sólo al abrir: `sin_ver` y `alCambiar` cambian después, justamente por esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.firma]);

  async function accion(que: "resolver" | "reabrir") {
    setOcupado(true);
    try {
      await pedir(`/crashes/${f.firma}/${que}`, { metodo: "POST", cuerpo: que === "resolver" ? { version: elegido?.version ?? null } : {} });
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-1 rounded-caja bg-lienzo-2 p-4 md:p-5">
      {error && <p role="alert" className="mb-3 text-[14px] text-cayo">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-tenue">
          Primera vez {haceCuanto(f.primera)} · firma <span className="font-codigo">{f.firma}</span>
        </p>
        {f.resuelto_en ? (
          <Boton onClick={() => accion("reabrir")} disabled={ocupado}>Reabrir</Boton>
        ) : (
          <Boton principal onClick={() => accion("resolver")} disabled={ocupado}>Marcar resuelto</Boton>
        )}
      </div>
      {!reportes ? (
        <p className="mt-4 text-[14px] text-tenue">Cargando…</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
          <ol className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
            {reportes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={async () => setElegido((await pedir<{ reporte: Reporte }>(`/reportes/${r.id}`)).reporte)}
                  aria-current={elegido?.id === r.id}
                  className="w-full rounded-fila px-3 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-lienzo-3 aria-[current=true]:bg-lienzo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico"
                >
                  <span className="block text-espuma">{new Date(r.recibido).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="block text-tenue">v{r.version ?? "?"} · {nombrePlataforma(r.plataforma)} {r.arch ?? ""}</span>
                </button>
              </li>
            ))}
          </ol>
          {elegido && <TextoDelReporte reporte={elegido} />}
        </div>
      )}
    </div>
  );
}

export function TextoDelReporte({ reporte }: { readonly reporte: Reporte }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tenue">
        {reporte.github && <span>GitHub: {reporte.github}</span>}
        {reporte.correo && <span>{reporte.correo}</span>}
        {reporte.diagnostico_bytes > 0 && (
          <a className="text-electrico underline-offset-4 hover:underline" href={`/api/admin/reportes/${reporte.id}/diagnostico`}>
            Bajar el diagnóstico ({Math.ceil(reporte.diagnostico_bytes / 1024)} KB)
          </a>
        )}
        {reporte.imagenes.map((img) => (
          <a key={img} className="text-electrico underline-offset-4 hover:underline" href={`/api/admin/reportes/${reporte.id}/${img}`}>
            {img}
          </a>
        ))}
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-fila bg-lienzo p-4 font-codigo text-[12px] leading-relaxed text-tinta">
        {reporte.texto}
      </pre>
    </div>
  );
}
