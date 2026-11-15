import type { Bloque } from "@/lib/docs/tipos";
import { Diagrama } from "./Diagramas";
import { Linea } from "./Linea";

/** Un bloque de código con su título (dónde va) y sin botón de copiar que no haga falta. */
export function Codigo({ codigo, titulo }: { codigo: string; titulo?: string }) {
  return (
    <figure className="my-6 overflow-hidden rounded border border-espuma/10 bg-lienzo-2">
      {titulo && <figcaption className="px-4 pt-3 text-[13px] text-apagado">{titulo}</figcaption>}
      <pre className="overflow-x-auto px-4 py-3 font-codigo text-[13.5px] leading-relaxed text-espuma">
        <code>{codigo}</code>
      </pre>
    </figure>
  );
}

/** Una tabla impresa: rótulos arriba y un filete por renglón. Sin caja y sin cebra. */
function Tabla({ columnas, filas }: { columnas: readonly string[]; filas: readonly (readonly string[])[] }) {
  return (
    <div className="my-8 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-espuma/20">
            {columnas.map((c) => (
              <th key={c} scope="col" className="py-2.5 pr-4 text-[11px] font-medium text-tinta/55 last:pr-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            // El último renglón no lleva filete: con el de la sección que viene abajo, los dos
            // juntos parecían una fila vacía.
            <tr key={i} className="border-b border-espuma/10 last:border-b-0">
              {fila.map((celda, k) => (
                <td key={k} className={`py-2.5 pr-4 align-top leading-snug last:pr-0 ${k === 0 ? "text-espuma [&_code]:whitespace-nowrap [&_code]:[overflow-wrap:normal]" : "text-tinta/80"}`}>
                  <Linea texto={celda} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Los pasos de una guía, como un rumbo en la carta: una línea punteada que une boyas. */
function Ruta({ pasos }: { pasos: Extract<Bloque, { t: "ruta" }>["pasos"] }) {
  return (
    <ol className="my-8 flex flex-col">
      {pasos.map((p, i) => (
        <li key={p.titulo} className="relative pb-8 pl-8 last:pb-0">
          {i < pasos.length - 1 && <span aria-hidden="true" className="absolute top-4 bottom-0 left-[3px] border-l border-dashed border-espuma/25" />}
          <span aria-hidden="true" className="absolute top-[9px] left-0 size-[7px] rounded-full bg-espuma" />
          <h3 className="text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">{p.titulo}</h3>
          <p className="mt-2 text-[16px] leading-relaxed text-tinta/80">
            <Linea texto={p.texto} />
          </p>
          {p.codigo && <Codigo codigo={p.codigo} titulo="terminal" />}
        </li>
      ))}
    </ol>
  );
}

function Arbol({ filas }: { filas: Extract<Bloque, { t: "arbol" }>["filas"] }) {
  return (
    <div className="my-6 overflow-x-auto rounded border border-espuma/10 bg-lienzo-2 px-4 py-4">
      {/* En el celular la nota va debajo del nombre: al costado no entraba y había que deslizar. */}
      <ul className="flex flex-col gap-1.5 font-codigo text-[13.5px] leading-[1.6] sm:gap-0 sm:leading-[1.9]">
        {filas.map((f) => (
          <li key={`${f.nivel}-${f.nombre}`} className="flex flex-col sm:flex-row sm:gap-6" style={{ paddingLeft: `${f.nivel * 22}px` }}>
            <span className={`whitespace-nowrap ${f.nombre.endsWith("/") ? "text-espuma" : "text-tinta/90"}`}>
              {f.nivel > 0 && <span className="text-tinta/40">└ </span>}
              {f.nombre}
            </span>
            {f.nota && <span className="font-texto text-[13px] text-tinta/60">{f.nota}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bloques({ bloques }: { bloques: readonly Bloque[] }) {
  // Las figuras se numeran corridas dentro de la página, para poder nombrarlas en el texto.
  let figura = 0;
  return (
    <>
      {bloques.map((b, i) => {
        switch (b.t) {
          case "p":
            return (
              <p key={i} className="my-4 text-[17px] leading-[1.7] text-tinta/85">
                <Linea texto={b.texto} />
              </p>
            );
          case "h2":
            return (
              // El filete de arriba separa una sección de la anterior; si el h2 abre la página, el
              // que ya cierra la bajada alcanza.
              <h2
                key={i}
                id={b.id}
                className="mt-14 mb-3 scroll-mt-28 border-t border-espuma/10 pt-6 text-[32px] font-medium tracking-[-0.022em] leading-tight text-espuma first:mt-6 first:border-t-0 first:pt-0"
              >
                <a href={`#${b.id}`} className="hover:underline hover:decoration-espuma/30 hover:underline-offset-8">
                  {b.texto}
                </a>
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-8 mb-1 text-[19px] font-medium text-espuma">
                {b.texto}
              </h3>
            );
          case "codigo":
            return <Codigo key={i} codigo={b.codigo} {...(b.titulo ? { titulo: b.titulo } : {})} />;
          case "lista":
            return (
              <ul key={i} className="my-4 flex flex-col gap-2.5">
                {b.items.map((it) => (
                  <li key={it} className="relative pl-6 text-[17px] leading-[1.65] text-tinta/85">
                    <span aria-hidden="true" className="absolute top-[0.7em] left-1 size-1.5 rounded-full bg-tinta/50" />
                    <Linea texto={it} />
                  </li>
                ))}
              </ul>
            );
          case "tabla":
            return <Tabla key={i} columnas={b.columnas} filas={b.filas} />;
          case "nota":
            // Una nota al margen, no un cartel: un filete al costado y el texto corrido.
            return (
              <aside key={i} className="my-6 border-l-2 border-espuma/25 pl-5 text-[16px] leading-relaxed text-tinta/80">
                <Linea texto={b.texto} />
              </aside>
            );
          case "ruta":
            return <Ruta key={i} pasos={b.pasos} />;
          case "arbol":
            return <Arbol key={i} filas={b.filas} />;
          case "diagrama":
            figura += 1;
            return <Diagrama key={i} cual={b.cual} numero={figura} />;
        }
      })}
    </>
  );
}
