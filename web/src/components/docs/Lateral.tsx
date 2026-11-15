"use client";

import { usePathname } from "next/navigation";

export interface EntradaDelIndice {
  readonly slug: string;
  readonly titulo: string;
  readonly grupo: string;
  readonly secciones: readonly { readonly id: string; readonly texto: string }[];
}

const rutaDe = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

/**
 * El índice, como el de un libro: el grupo rotulado en mayúsculas sobre un filete y las páginas
 * abajo en mono chica. La que estás leyendo va en el acento; las secciones de esa página cuelgan
 * de un filete al margen.
 */
function Indice({
  grupos,
  actual,
  denso,
}: {
  grupos: readonly (readonly [string, readonly EntradaDelIndice[]])[];
  actual: string;
  /** En la columna de la compu los renglones van juntos; en el celular cada uno tiene que ser tocable. */
  denso: boolean;
}) {
  const renglon = denso ? "block py-1.5" : "flex min-h-11 items-center";
  return (
    <div className="flex flex-col gap-7">
      {grupos.map(([grupo, entradas]) => (
        <div key={grupo}>
          <p className="border-b border-espuma/10 pb-2 text-[13px] text-apagado">{grupo}</p>
          <ul className="mt-2 flex flex-col">
            {entradas.map((e) => {
              const es = rutaDe(e.slug) === actual;
              return (
                <li key={e.slug}>
                  <a
                    href={rutaDe(e.slug)}
                    aria-current={es ? "page" : undefined}
                    className={`${renglon} font-codigo text-[13px] transition-colors ${es ? "text-electrico" : "text-tinta/70 hover:text-espuma"}`}
                  >
                    {e.titulo}
                  </a>
                  {es && e.secciones.length > 0 && (
                    <ul className="mb-2 ml-1 flex flex-col border-l border-espuma/15 pl-3">
                      {e.secciones.map((s) => (
                        <li key={s.id}>
                          <a href={`#${s.id}`} className={`${denso ? "block py-1" : "flex min-h-11 items-center"} text-[13px] text-tinta/60 transition-colors hover:text-espuma`}>
                            {s.texto}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * El índice de la doc. En la compu, una columna que acompaña el scroll; en el celular, un
 * desplegable arriba del texto (en línea, no un panel que tape la pantalla).
 */
export function Lateral({ entradas }: { entradas: readonly EntradaDelIndice[] }) {
  const ruta = usePathname() ?? "/docs";
  const actual = ruta.length > 1 ? ruta.replace(/\/$/, "") : ruta;
  const grupos: [string, EntradaDelIndice[]][] = [];
  for (const e of entradas) {
    const g = grupos.find(([nombre]) => nombre === e.grupo);
    if (g) g[1].push(e);
    else grupos.push([e.grupo, [e]]);
  }
  const titulo = entradas.find((e) => rutaDe(e.slug) === actual)?.titulo;
  return (
    <>
      <details className="group border-y border-espuma/10 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-[13px] text-apagado">Documentación</span>
            <span className="font-codigo text-[14px] text-espuma">{titulo ?? "Índice"}</span>
          </span>
          <svg viewBox="0 0 16 16" className="size-4 flex-none text-tinta/70 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <nav aria-label="Documentación" className="pt-2 pb-5">
          <Indice grupos={grupos} actual={actual} denso={false} />
        </nav>
      </details>
      {/* El índice es más largo que la pantalla, así que acompaña el scroll con el suyo propio; la
          barra va fina y apenas visible, que si no parte la columna en dos. */}
      <nav
        aria-label="Documentación"
        className="sticky top-24 hidden max-h-[calc(100svh-8rem)] overflow-y-auto pr-4 [scrollbar-color:rgba(250,250,250,0.12)_transparent] [scrollbar-width:thin] lg:block"
        data-lenis-prevent
      >
        <Indice grupos={grupos} actual={actual} denso />
      </nav>
    </>
  );
}
