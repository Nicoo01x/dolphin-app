import { Bloques } from "./Bloques";
import { ReferenciaCli } from "./ReferenciaCli";
import { REPO } from "@/lib/contenido";
import { PAGINAS, rutaDe } from "@/lib/docs/paginas";
import { GRUPOS, type PaginaDeDoc } from "@/lib/docs/tipos";

/** El orden de lectura: el del índice. */
const EN_ORDEN = [...PAGINAS].sort((a, b) => GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo));

/**
 * Una página de la doc: texto sobre el fondo, con ancho de lectura. No hay caja alrededor —la
 * jerarquía la hacen el rótulo del grupo, el titular y los filetes—, y el ancho se limita porque
 * un renglón de 1.100 px no se lee: se escanea.
 */
export function PaginaDoc({ pagina }: { pagina: PaginaDeDoc }) {
  const i = EN_ORDEN.findIndex((p) => p.slug === pagina.slug);
  const antes = EN_ORDEN[i - 1];
  const despues = EN_ORDEN[i + 1];
  return (
    <article className="max-w-2xl">
      <p className="text-[14px] text-apagado">{pagina.grupo}</p>
      <h1 className="mt-5 titulo-grande">{pagina.titulo}</h1>
      <p className="mt-5 border-b border-espuma/10 pb-8 text-[19px] leading-relaxed text-tinta/80">{pagina.resumen}</p>
      <div className="mt-2">{pagina.slug === "cli" ? <ReferenciaCli /> : <Bloques bloques={pagina.bloques} />}</div>

      <p className="mt-16 border-t border-espuma/10 pt-4 text-[13px] leading-relaxed text-tinta/55">
        Sale de{" "}
        {pagina.fuentes.map((f, k) => (
          <span key={f}>
            {k > 0 && " · "}
            {f.includes("*") ? (
              <span className="font-codigo">{f}</span>
            ) : (
              <a href={`${REPO}/blob/main/${f}`} className="font-codigo [overflow-wrap:anywhere] hover:text-espuma">
                {f}
              </a>
            )}
          </span>
        ))}
      </p>

      <nav aria-label="Seguir leyendo" className="mt-10 grid gap-px bg-espuma/10 sm:grid-cols-2">
        {antes ? (
          <a href={rutaDe(antes.slug)} className="group bg-lienzo py-5 transition-colors sm:pr-5">
            <span className="block text-[13px] text-apagado">Antes</span>
            <span className="mt-1 block text-[22px] font-medium tracking-[-0.022em] text-tinta/85 transition-colors group-hover:text-espuma">{antes.titulo}</span>
          </a>
        ) : (
          <span className="bg-lienzo" />
        )}
        {despues && (
          <a href={rutaDe(despues.slug)} className="group bg-lienzo py-5 sm:pl-5 sm:text-right">
            <span className="block text-[13px] text-apagado">Después</span>
            <span className="mt-1 block text-[22px] font-medium tracking-[-0.022em] text-tinta/85 transition-colors group-hover:text-espuma">{despues.titulo}</span>
          </a>
        )}
      </nav>
    </article>
  );
}
