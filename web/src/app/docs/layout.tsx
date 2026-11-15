import { Escena } from "@/components/Escena";
import { Lateral, type EntradaDelIndice } from "@/components/docs/Lateral";
import { PAGINAS } from "@/lib/docs/paginas";
import { GRUPOS } from "@/lib/docs/tipos";

const INDICE: EntradaDelIndice[] = [...PAGINAS]
  .sort((a, b) => GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo))
  .map((p) => ({
    slug: p.slug,
    titulo: p.titulo,
    grupo: p.grupo,
    secciones: p.bloques.flatMap((b) => (b.t === "h2" ? [{ id: b.id, texto: b.texto }] : [])),
  }));

export default function LayoutDeDocs({ children }: { children: React.ReactNode }) {
  return (
    <Escena>
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 pt-10 pb-28 md:px-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <div>
          <Lateral entradas={INDICE} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Escena>
  );
}
