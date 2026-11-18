import { Linea } from "./docs/Linea";
import { PREGUNTAS, type Pregunta } from "@/lib/preguntas";

/**
 * Las preguntas de siempre. Viven en lib/preguntas.ts: la home muestra las marcadas `enInicio` y
 * /preguntas, todas.
 */
export function Preguntas({ todas = false }: { readonly todas?: boolean }) {
  const lista = todas ? PREGUNTAS : PREGUNTAS.filter((q) => q.enInicio);
  return (
    <section id="preguntas" className="relative scroll-mt-24 px-6 py-28 md:px-10" aria-labelledby="preguntas-titulo">
      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          {todas ? (
            <h1 id="preguntas-titulo" className="titulo-grande">
              Preguntas.
            </h1>
          ) : (
            <h2 id="preguntas-titulo" className="titulo-seccion">
              Preguntas.
            </h2>
          )}
          <p className="bajada mt-5 max-w-sm">
            Lo que conviene saber antes de instalarlo. El resto está en la{" "}
            <a href="/docs" className="text-espuma underline decoration-espuma/25 underline-offset-4 transition-colors hover:decoration-espuma">
              documentación
            </a>
            .
          </p>
          {!todas && (
            <a href="/preguntas" className="group mt-5 inline-flex items-center gap-1.5 text-[16px] text-espuma transition-colors hover:text-black">
              Todas las preguntas
              <span aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                →
              </span>
            </a>
          )}
        </div>
        {/* Cada pregunta es una superficie tonal que se abre y no un renglón entre filetes: con el
            rediseño se fueron las líneas de todo el sitio. */}
        <div className="flex flex-col gap-1.5">
          {lista.map((q) => (
            <UnaPregunta key={q.p} pregunta={q} />
          ))}
        </div>
      </div>
    </section>
  );
}

function UnaPregunta({ pregunta: q }: { readonly pregunta: Pregunta }) {
  return (
    <details className="group rounded-[var(--radius-caja)] bg-lienzo-2 px-5 transition-colors hover:bg-lienzo-3 open:bg-lienzo-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[17px] text-tinta transition-colors group-open:text-espuma [&::-webkit-details-marker]:hidden">
        {q.p}
        <svg viewBox="0 0 16 16" className="size-4 flex-none text-apagado transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
          <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="flex max-w-2xl flex-col gap-3 pb-5 text-[15px] leading-relaxed text-tenue">
        {q.r.map((parrafo) => (
          <p key={parrafo.slice(0, 24)}>
            <Linea texto={parrafo} />
          </p>
        ))}
      </div>
    </details>
  );
}
