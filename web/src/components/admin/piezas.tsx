"use client";

/** Las piezas que repiten las cuatro pestañas del panel. Superficies por tono, sin bordes. */

export function Boton({ principal, children, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly principal?: boolean }) {
  return (
    <button
      type="button"
      {...resto}
      className={`h-9 rounded-full px-4 text-[14px] font-medium transition duration-150 ease-out active:scale-[0.97] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico focus-visible:ring-offset-2 ${
        principal ? "bg-espuma text-lienzo hover:bg-espuma/85" : "bg-lienzo-3 text-espuma hover:bg-lienzo-4"
      }`}
    >
      {children}
    </button>
  );
}

/** Una fila que se abre: toda la fila es el botón, con el estado en aria-expanded. */
export function Fila({ abierta, apagada, alAlternar, children }: { readonly abierta: boolean; readonly apagada?: boolean; readonly alAlternar: () => void; readonly children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={alAlternar}
      aria-expanded={abierta}
      className={`flex w-full items-center gap-4 rounded-caja px-4 py-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico md:px-5 ${
        abierta ? "bg-lienzo-3" : "bg-lienzo-2 hover:bg-lienzo-3"
      } ${apagada ? "opacity-60" : ""}`}
    >
      {children}
    </button>
  );
}

export function Estado({ tono, texto, accion }: { readonly tono: "cargando" | "error"; readonly texto: string; readonly accion?: { texto: string; alHacer: () => void } }) {
  return (
    <div role={tono === "error" ? "alert" : "status"} className="flex flex-wrap items-center gap-4 rounded-caja bg-lienzo-2 px-5 py-6">
      {tono === "cargando" && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-tenue-2 border-t-espuma" />}
      <p className={`text-[15px] ${tono === "error" ? "text-cayo" : "text-tenue"}`}>{texto}</p>
      {accion && <Boton onClick={accion.alHacer}>{accion.texto}</Boton>}
    </div>
  );
}

export function Vacio({ titulo, texto }: { readonly titulo: string; readonly texto: string }) {
  return (
    <div className="rounded-caja bg-lienzo-2 px-6 py-10 text-center">
      <p className="text-[17px] font-medium text-espuma">{titulo}</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-tenue">{texto}</p>
    </div>
  );
}

/** Todos los días del período, con 0 donde no hubo nada: sin esto, un solo día ocupa todo el ancho. */
export function diasCompletos(datos: { dia: string; n: number }[], dias: number, hoy = new Date()): { dia: string; n: number }[] {
  const porDia = new Map(datos.map((d) => [d.dia, d.n]));
  return Array.from({ length: dias }, (_, i) => {
    const dia = new Date(hoy.getTime() - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { dia, n: porDia.get(dia) ?? 0 };
  });
}

/** Barras por día, como la bitácora de /novedades: sin librería, la altura es el dato. */
export function Barras({ datos: crudos, dias, etiqueta }: { readonly datos: { dia: string; n: number }[]; readonly dias: number; readonly etiqueta: string }) {
  const datos = diasCompletos(crudos, dias);
  const maximo = Math.max(1, ...datos.map((d) => d.n));
  if (crudos.length === 0) return <p className="text-[14px] text-tenue">Sin datos en el período.</p>;
  return (
    <figure>
      <div className="flex h-36 items-end gap-1" role="img" aria-label={etiqueta}>
        {datos.map((d, i) => (
          <span key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end">
            <span
              className={`w-full rounded-t-[3px] transition-colors ${d.n > 0 ? "bg-espuma/80 group-hover:bg-espuma" : "bg-tenue-2/40"}`}
              style={{ height: d.n > 0 ? `${Math.max(3, (d.n / maximo) * 100)}%` : "2px" }}
            />
            {/* En los bordes la etiqueta se ancla hacia adentro: centrada, la del último día se salía
                de la pantalla y en el celular la página tenía scroll de costado. */}
            <span
              className={`pointer-events-none absolute -top-6 whitespace-nowrap rounded-full ${
                i < datos.length * 0.2 ? "left-0" : i > datos.length * 0.8 ? "right-0" : "left-1/2 -translate-x-1/2"
              } bg-espuma px-2 py-0.5 font-codigo text-[11px] text-lienzo opacity-0 transition-opacity group-hover:opacity-100`}
            >
              {d.n} · {fechaCorta(d.dia)}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-codigo text-[11px] tabular-nums text-tenue">
        <span>{fechaCorta(datos[0]!.dia)}</span>
        <span>{fechaCorta(datos[datos.length - 1]!.dia)}</span>
      </div>
    </figure>
  );
}

const fechaCorta = (dia: string) => `${Number(dia.slice(8))}/${Number(dia.slice(5, 7))}`;

/** Una lista «nombre — número» con la barra de fondo proporcional. */
export function Ranking({ filas }: { readonly filas: { nombre: string; n: number }[] }) {
  const maximo = Math.max(1, ...filas.map((f) => f.n));
  if (filas.length === 0) return <p className="text-[14px] text-tenue">Sin datos en el período.</p>;
  return (
    <ol className="flex flex-col gap-1">
      {filas.map((f) => (
        <li key={f.nombre} className="relative overflow-hidden rounded-fila px-3 py-2">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-lienzo-3" style={{ width: `${(f.n / maximo) * 100}%` }} />
          <span className="relative flex items-center justify-between gap-4 text-[14px]">
            <span className="truncate text-espuma" title={f.nombre}>{f.nombre}</span>
            <span className="font-codigo tabular-nums text-tinta">{f.n.toLocaleString("es-AR")}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
