"use client";

import { useCallback, useEffect, useState } from "react";
import { haceCuanto, nombrePlataforma, pedir, type Comentario, type Reporte } from "./api";
import { Boton, Estado, Fila, Vacio } from "./piezas";
import { TextoDelReporte } from "./Crashes";

/** Lo que la gente escribe desde «Enviar comentarios» de la app, lo más nuevo arriba. */
export function Comentarios({ alCambiar }: { readonly alCambiar: () => void }) {
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Reporte | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista((await pedir<{ comentarios: Comentario[] }>("/comentarios")).comentarios);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los comentarios.");
    }
  }, []);

  useEffect(() => void cargar(), [cargar]);

  async function abrir(id: string) {
    if (abierto?.id === id) return setAbierto(null);
    setAbierto((await pedir<{ reporte: Reporte }>(`/reportes/${id}`)).reporte);
    setLista((l) => l?.map((c) => (c.id === id ? { ...c, visto: 1 } : c)) ?? null);
    alCambiar();
  }

  async function todosVistos() {
    const ids = (lista ?? []).filter((c) => !c.visto).map((c) => c.id);
    if (ids.length === 0) return;
    await pedir("/comentarios/visto", { metodo: "POST", cuerpo: { ids } });
    await cargar();
    alCambiar();
  }

  if (error) return <Estado tono="error" texto={error} accion={{ texto: "Reintentar", alHacer: cargar }} />;
  if (!lista) return <Estado tono="cargando" texto="Leyendo los comentarios…" />;
  if (lista.length === 0) {
    return <Vacio titulo="Nadie escribió todavía" texto="Los comentarios que manden desde la app (Ayuda → Enviar comentarios) llegan acá con su versión y su sistema." />;
  }

  return (
    <div>
      {lista.some((c) => !c.visto) && (
        <div className="mb-3 flex justify-end">
          <Boton onClick={todosVistos}>Marcar todos como vistos</Boton>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {lista.map((c) => (
          <li key={c.id}>
            <Fila abierta={abierto?.id === c.id} alAlternar={() => void abrir(c.id)}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  {!c.visto && <span className="size-2 shrink-0 rounded-full bg-electrico" aria-label="sin ver" />}
                  <span className="line-clamp-2 text-[15px] text-espuma">{c.texto}</span>
                </span>
                <span className="text-[13px] text-tenue">
                  {haceCuanto(c.recibido)} · v{c.version ?? "?"} · {nombrePlataforma(c.plataforma)}
                  {c.github ? ` · @${c.github}` : ""}
                  {c.imagenes > 0 ? ` · ${c.imagenes} ${c.imagenes === 1 ? "imagen" : "imágenes"}` : ""}
                </span>
              </span>
            </Fila>
            {abierto?.id === c.id && (
              <div className="mt-1 rounded-caja bg-lienzo-2 p-4 md:p-5">
                <TextoDelReporte reporte={abierto} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
