import { Fragment, useMemo } from "react";
import { logoDeModelo } from "@/lib/datos";
import { partirEnInsignias, type Trozo } from "@/lib/insignias";
import { referenciasEn, type ClaseDeReferencia, type LoQueExiste } from "@/lib/referencias";
import { cn } from "@/lib/utils";
import { Referencia } from "./Referencia";

/**
 * Un texto escrito por Claude o un agente, con sus datos como insignias (ver lib/insignias.ts):
 * se encuentra el número, el archivo o el modelo sin leer el párrafo entero. Cada clase de dato
 * tiene su color (plata, porcentajes, tiempos, cantidades, código, términos, modelos), y el color
 * vive en app.css para que el claro y el oscuro lleguen a AA.
 *
 * Y lo que el texto nombra del proyecto —un issue, un PR, una rama, un commit— sale como una
 * pastilla que se toca, con su ficha al pasar por encima (ver lib/referencias.ts y Referencia).
 * Pedido de Nico (01/11). Las referencias se buscan ANTES que las insignias: `#412` tiene que ser
 * un issue y no el número 412 suelto.
 *
 * El signo pegado a una insignia viaja con ella: «(40,6 %» no deja el paréntesis solo al final de
 * una línea con la insignia en la siguiente, ni «implementando.» deja el punto en otra.
 */
export function Leible({
  texto,
  className,
  existe,
}: {
  texto: string;
  className?: string;
  /** Las ramas del repo: sin la lista solo se marcan las ramas de Dolphin, que no se confunden. */
  existe?: LoQueExiste;
}) {
  const partes = useMemo(() => partirConReferencias(texto, existe), [texto, existe]);
  return (
    <span className={className}>
      {partes.map((parte, n) =>
        parte.tipo === "referencia" ? (
          <Referencia key={n} clase={parte.clase} id={parte.id} texto={parte.texto} />
        ) : (
          <TextoConInsignias key={n} texto={parte.texto} />
        ),
      )}
    </span>
  );
}

type ParteDelTexto =
  | { readonly tipo: "texto"; readonly texto: string }
  | { readonly tipo: "referencia"; readonly clase: ClaseDeReferencia; readonly id: string; readonly texto: string };

/** Primero las referencias; lo que queda entre ellas sigue su camino por las insignias. */
function partirConReferencias(texto: string, existe: LoQueExiste | undefined): ParteDelTexto[] {
  const hallazgos = referenciasEn(texto, existe ?? {});
  if (hallazgos.length === 0) return [{ tipo: "texto", texto }];
  const partes: ParteDelTexto[] = [];
  let desde = 0;
  for (const h of hallazgos) {
    if (h.desde > desde) partes.push({ tipo: "texto", texto: texto.slice(desde, h.desde) });
    partes.push({ tipo: "referencia", clase: h.clase, id: h.id, texto: h.texto });
    desde = h.hasta;
  }
  if (desde < texto.length) partes.push({ tipo: "texto", texto: texto.slice(desde) });
  return partes;
}

function TextoConInsignias({ texto }: { texto: string }) {
  const piezas = useMemo(() => juntarSignos(partirEnInsignias(texto)), [texto]);
  return (
    <>
      {piezas.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : p.antes || p.despues ? (
          <span key={i} className="whitespace-nowrap">
            {p.antes}
            <Insignia trozo={p.trozo} />
            {p.despues}
          </span>
        ) : (
          <Insignia key={i} trozo={p.trozo} />
        ),
      )}
    </>
  );
}

type Dato = Exclude<Trozo, { tipo: "texto" }>;

/** Lo que abre pegado antes de una insignia y lo que cierra pegado después (sin espacio en el medio). */
const ABRE = /[([{«“‘"'¿¡]+$/u;
const CIERRA = /^[)\]}»”’"'.,;:!?…%]+/u;

/** Separa de cada texto vecino los signos que van pegados a la insignia, para no partirlos de ella. */
function juntarSignos(trozos: readonly Trozo[]): (string | { trozo: Dato; antes: string; despues: string })[] {
  const textos = trozos.map((t) => (t.tipo === "texto" ? t.valor : null));
  const piezas: (string | { trozo: Dato; antes: string; despues: string })[] = [];
  trozos.forEach((t, i) => {
    if (t.tipo === "texto") return;
    let antes = "";
    let despues = "";
    const previo = textos[i - 1];
    if (typeof previo === "string") {
      antes = previo.match(ABRE)?.[0] ?? "";
      textos[i - 1] = previo.slice(0, previo.length - antes.length);
    }
    const siguiente = textos[i + 1];
    if (typeof siguiente === "string") {
      despues = siguiente.match(CIERRA)?.[0] ?? "";
      textos[i + 1] = siguiente.slice(despues.length);
    }
    piezas.push({ trozo: t, antes, despues });
  });
  // Se arma en orden: cada texto ya recortado, entre sus insignias.
  const salida: (string | { trozo: Dato; antes: string; despues: string })[] = [];
  let k = 0;
  trozos.forEach((t, i) => {
    if (t.tipo === "texto") {
      if (textos[i]) salida.push(textos[i]!);
    } else salida.push(piezas[k++]!);
  });
  return salida;
}

function Insignia({ trozo }: { trozo: Dato }) {
  const logo = trozo.tipo === "modelo" ? logoDeModelo(trozo.valor) : null;
  return (
    <span
      data-insignia={trozo.tipo === "dato" ? trozo.clase : trozo.tipo}
      {...(logo ? { "data-marca": logo.nombre } : {})}
      className={cn(
        // Sin margen y con 3 px de aire: a los costados solo queda el espacio que trae el texto.
        "insignia inline-flex items-baseline gap-1 rounded-md px-[3px] align-baseline font-medium whitespace-nowrap",
        trozo.tipo === "dato" && "tabular-nums",
        trozo.tipo === "codigo" && "font-mono text-[0.88em]",
      )}
    >
      {logo && <img src={logo.src} alt="" aria-hidden="true" className="size-[0.9em] self-center" />}
      {trozo.valor}
    </span>
  );
}
