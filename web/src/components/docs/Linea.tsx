import { Fragment } from "react";

/** Un texto de la doc: `así` es código y [esto](/docs/x) es un link. Nada más, a propósito. */
export function Linea({ texto }: { texto: string }) {
  const partes = texto.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 1) {
          return (
            <code key={i} className="rounded-[2px] bg-lienzo-2 px-1.5 py-0.5 font-codigo text-[0.86em] text-espuma [overflow-wrap:anywhere]">
              {p.slice(1, -1)}
            </code>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (link) {
          return (
            <a key={i} href={link[2]} className="text-espuma underline decoration-espuma/35 underline-offset-4 transition-colors hover:decoration-espuma">
              {link[1]}
            </a>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
