import type { Metadata } from "next";
import { Escena } from "@/components/Escena";
import { LaminaDeArchivo } from "@/components/LaminaDeArchivo";
import { canonicalDe, SITIO_PUBLICADO, REPO } from "@/lib/contenido";
import { NOVEDADES } from "@/lib/novedades";

const DESCRIPCION = "Lo que cambió en Dolphin, día por día, contado desde el historial del repo.";

export const metadata: Metadata = {
  title: "Novedades",
  description: DESCRIPCION,
  openGraph: { title: "Novedades de Dolphin", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/novedades" } : {}) },
    ...canonicalDe("/novedades"),
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a!, m! - 1, d!));
  return { dia: `${d} de ${MESES[m! - 1]}`, semana: `${DIAS[fecha.getUTCDay()]}, ${a}` };
}

/**
 * El registro, fechado. No es una pila de tarjetas: es una sola hoja donde cada día se separa del
 * siguiente por un filete, con la fecha en mono tabular al margen, como una bitácora impresa.
 */
export default function Novedades() {
  const maximo = Math.max(...NOVEDADES.map((d) => d.cambios.length + d.arreglos));
  const total = NOVEDADES.reduce((s, d) => s + d.cambios.length, 0);
  const arreglos = NOVEDADES.reduce((s, d) => s + d.arreglos, 0);
  // El gráfico va de lo más viejo a lo más nuevo, como se lee una bitácora.
  const enOrden = [...NOVEDADES].reverse();
  return (
    <Escena>
      <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-28 md:px-10">
        <header className="grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <h1 className="titulo-grande">Novedades.</h1>
            <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-tinta/80">
              La bitácora de Dolphin: lo que se puede ver al usarlo, día por día. Sale del{" "}
              <a href={`${REPO}/commits/master`} className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
                historial del repo
              </a>
              .
            </p>
          </div>
          <LaminaDeArchivo nombre="delfin" className="w-full max-w-sm justify-self-end max-lg:justify-self-start" />
        </header>

        {/* Cuánto se movió cada día: lo nuevo en claro, los arreglos apagados. */}
        <figure className="mt-16 max-w-3xl">
          <div className="flex h-32 items-end gap-2 md:gap-3" role="img" aria-label={`${total} cambios y ${arreglos} arreglos en ${NOVEDADES.length} días.`}>
            {enOrden.map((d) => (
              <a key={d.fecha} href={`#${d.fecha}`} className="group flex h-full flex-1 flex-col justify-end gap-px" aria-label={fechaLarga(d.fecha).dia}>
                <span className="w-full bg-apagado/55 transition-colors group-hover:bg-apagado" style={{ height: `${(d.arreglos / maximo) * 100}%` }} />
                <span className="w-full bg-espuma/85 transition-colors group-hover:bg-espuma" style={{ height: `${(d.cambios.length / maximo) * 100}%` }} />
              </a>
            ))}
          </div>
          <div className="flex gap-2 border-t border-espuma/10 pt-2 md:gap-3">
            {enOrden.map((d) => (
              <span key={d.fecha} className="min-w-0 flex-1 text-center font-codigo text-[10px] tabular-nums text-tinta/55 md:text-[11px]">
                {Number(d.fecha.slice(8))}/{Number(d.fecha.slice(5, 7))}
              </span>
            ))}
          </div>
          <figcaption className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-tinta/55">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 bg-espuma/85" /> {total} cosas nuevas
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 bg-apagado/55" /> {arreglos} arreglos
            </span>
          </figcaption>
        </figure>

        <ol className="mt-16">
          {NOVEDADES.map((d) => {
            const f = fechaLarga(d.fecha);
            return (
              <li key={d.fecha} id={d.fecha} className="scroll-mt-28 border-t border-espuma/10 py-8 md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
                <h2 className="font-codigo text-[15px] tabular-nums text-espuma">
                  {f.dia}
                  <span className="mt-1 block text-[13px] text-apagado">{f.semana}</span>
                </h2>
                <div className="mt-4 max-w-2xl md:mt-0">
                  <ul className="flex flex-col gap-2.5">
                    {d.cambios.map((c) => (
                      <li key={c.hash} className="relative pl-6 text-[16px] leading-relaxed text-tinta/85 [overflow-wrap:anywhere]">
                        <span aria-hidden="true" className="absolute top-[0.7em] left-1 size-1.5 rounded-full bg-espuma/70" />
                        {c.texto}
                      </li>
                    ))}
                  </ul>
                  {d.arreglos > 0 && (
                    <p className="mt-4 text-[14px] text-tinta/60">
                      Y {d.arreglos} {d.arreglos === 1 ? "arreglo" : "arreglos"} de cosas que no andaban.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Escena>
  );
}
