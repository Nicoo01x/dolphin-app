import { COMANDOS } from "@/lib/docs/cli";
import { REPO } from "@/lib/contenido";
import { Codigo } from "./Bloques";
import { Linea } from "./Linea";

const ancla = (id: string) => `cmd-${id}`;

export const SECCIONES_CLI = COMANDOS.map((c) => ({ id: ancla(c.id), texto: c.id === "dolphin" ? "dolphin" : `dolphin ${c.id}` }));

/** La referencia de la CLI: un índice de comandos y, para cada uno, su uso, sus flags y de dónde sale. */
export function ReferenciaCli() {
  return (
    <>
      <p className="my-4 text-[17px] leading-[1.7] text-tinta/85">
        Cada comando corre igual desde cualquier carpeta. Casi todos aceptan <Linea texto="`--repo <ruta>`" /> y, si no lo pasás, trabajan sobre la carpeta donde estás.
        Sin argumentos, la mayoría imprime su propia ayuda.
      </p>
      {/* El índice de comandos es un índice impreso, no una fila de píldoras. */}
      <nav aria-label="Comandos" className="mt-8 border-t border-espuma/10 pt-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {COMANDOS.map((c) => (
            <li key={c.id}>
              <a href={`#${ancla(c.id)}`} className="flex min-h-11 items-center font-codigo text-[13px] text-tinta/75 transition-colors hover:text-espuma">
                {c.id}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {COMANDOS.map((c) => (
        <section key={c.id} id={ancla(c.id)} className="mt-14 scroll-mt-28 border-t border-espuma/10 pt-6">
          <h2 className="font-codigo text-[20px] text-espuma">
            <a href={`#${ancla(c.id)}`}>{c.id === "dolphin" ? "dolphin" : `dolphin ${c.id}`}</a>
          </h2>
          <p className="mt-3 text-[17px] leading-[1.7] text-tinta/85">
            <Linea texto={c.que} />
          </p>
          <Codigo codigo={c.uso.join("\n")} titulo="uso" />
          {c.flags.length > 0 && (
            <div className="my-8 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[15px]">
                <thead>
                  <tr className="border-b border-espuma/20">
                    {["Flag", "Por defecto", "Qué hace"].map((col) => (
                      <th key={col} scope="col" className="py-2.5 pr-4 text-[11px] font-medium text-tinta/55 last:pr-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.flags.map((f) => (
                    <tr key={f.flag} className="border-b border-espuma/10">
                      <td className="py-2.5 pr-4 align-top font-codigo text-[13px] whitespace-nowrap text-espuma">
                        {f.flag}
                        {f.valor && <span className="text-tinta/60"> {`<${f.valor}>`}</span>}
                      </td>
                      <td className="py-2.5 pr-4 align-top text-[14px] text-tinta/70">{f.defecto ?? "—"}</td>
                      <td className="py-2.5 align-top leading-snug text-tinta/85">
                        <Linea texto={f.que} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.notas?.map((n) => (
            <p key={n} className="my-4 border-l-2 border-espuma/25 pl-5 text-[15px] leading-relaxed text-tinta/80">
              <Linea texto={n} />
            </p>
          ))}
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-tinta/60">
            <a href={`${REPO}/blob/main/${c.archivo}`} className="font-codigo hover:text-espuma">
              {c.archivo}
            </a>
            {c.doc && (
              <a href={`/docs/${c.doc}`} className="text-tinta/80 underline decoration-tinta/30 underline-offset-4 hover:text-espuma">
                Cómo se usa
              </a>
            )}
          </p>
        </section>
      ))}
    </>
  );
}
