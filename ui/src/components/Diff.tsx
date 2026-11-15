import { useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { filasDelDiff, iconoDeArchivo } from "@/lib/datos";
import { lenguajeDe, resaltar, type ClaseDeToken } from "@/lib/resaltar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** El código de una línea, con su sintaxis en colores (ver lib/resaltar.ts). */
function Codigo({ texto, archivo, className }: { texto: string; archivo: string; className?: string }) {
  const lenguaje = lenguajeDe(archivo);
  if (lenguaje === "ninguno") return <span className={className}>{texto || " "}</span>;
  return (
    <span className={className}>
      {resaltar(texto, lenguaje).map((t, i) =>
        t.clase === "normal" ? t.texto : (
          <span key={i} className={CLASE[t.clase]}>
            {t.texto}
          </span>
        ),
      )}
      {texto === "" && " "}
    </span>
  );
}

const CLASE: Record<Exclude<ClaseDeToken, "normal">, string> = {
  comentario: "sx-comentario",
  cadena: "sx-cadena",
  numero: "sx-numero",
  palabra: "sx-palabra",
  constante: "sx-constante",
  tipo: "sx-tipo",
  funcion: "sx-funcion",
  propiedad: "sx-propiedad",
  operador: "sx-operador",
  etiqueta: "sx-tipo",
};

/**
 * El diff como lo lee una persona: cada archivo con su ícono y lo que sumó y
 * sacó, los números de línea en su canaleta y cada línea agregada o quitada
 * con su fondo, en los colores de siempre (verde pasó, rojo se fue).
 *
 * Y, cuando se lo pide, se puede marcar una línea: la canaleta del número es
 * también el botón de comentar, así no hay un botón de más por renglón
 * ensuciando la lectura. Lo que se marca se lee ahí mismo, debajo de su línea,
 * alineado con el código: un comentario sobre la línea 42 no es una tarjeta
 * aparte, es parte del diff.
 *
 * Teclado: el bloque tiene UNA parada de tab, no una por línea —un diff de 300
 * renglones serían 300 paradas—. Con el foco adentro, ↑ y ↓ mueven de línea y
 * Enter la marca, que es el mismo teclado que ya usa la vista de cosechas.
 */

/** Una marca que ya existe, como viene en los comentarios de la tarjeta. */
export interface MarcaDeLinea {
  readonly archivo: string;
  readonly linea: number;
  readonly texto: string;
  readonly quien: string;
}

export interface MarcaNueva {
  readonly archivo: string;
  readonly linea: number;
  readonly texto: string;
  /** Lo vuelve una regla candidata de la memoria, que el portón chequea para siempre. */
  readonly patron?: string;
}

export function LineasDiff({
  texto,
  marcas,
  alMarcar,
  noLaRegla,
}: {
  texto: string;
  marcas?: readonly MarcaDeLinea[];
  /** Sin esto el diff es de solo lectura, como en la vista Git. */
  alMarcar?: (m: MarcaNueva) => Promise<void>;
  /** Por qué el patrón de la última marca no se pudo guardar. */
  noLaRegla?: string;
}) {
  const bloque = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);

  const filas = filasDelDiff(texto);
  // Cada línea con el archivo al que pertenece: las filas de archivo vienen
  // antes que sus líneas, así que alcanza con ir recordando la última.
  let enArchivo = "";
  const deQuienEs = filas.map((f) => (f.tipo === "archivo" ? (enArchivo = f.ruta) : enArchivo));

  // Se marcan las líneas que siguen existiendo en el archivo: las agregadas y las
  // de contexto, que son las que llevan la numeración nueva. Una línea borrada ya
  // no está, y además choca: la quitada y la agregada de un mismo cambio son las
  // dos «la 2» —una numera el archivo viejo y la otra el nuevo—, así que marcar
  // una abría el cuadro en las dos y «exportar.ts:2» no decía cuál de las dos era.
  const comentables = filas.flatMap((f, i) => (f.tipo === "linea" && f.clase !== "menos" && alMarcar ? [i] : []));
  const clave = (archivo: string, linea: number) => `${archivo}:${linea}`;
  const marcasDe = (archivo: string, linea: number) => (marcas ?? []).filter((m) => m.archivo === archivo && m.linea === linea);

  const irA = (donde: number) => {
    const siguiente = comentables[Math.max(0, Math.min(comentables.length - 1, donde))];
    if (siguiente === undefined) return;
    setFoco(siguiente);
    bloque.current?.querySelector<HTMLElement>(`[data-fila="${siguiente}"]`)?.focus();
  };

  const porTeclado = (evento: React.KeyboardEvent, i: number, archivo: string, linea: number) => {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      const donde = comentables.indexOf(i);
      irA(evento.key === "ArrowDown" ? donde + 1 : donde - 1);
      return;
    }
    // Un div con role="button" no se activa solo con el teclado, como sí lo hace
    // un <button>: Enter y la barra hay que atenderlos acá o la línea solo se
    // puede marcar con el mouse.
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      setAbierta((previa) => (previa === clave(archivo, linea) ? null : clave(archivo, linea)));
    }
  };

  // La primera línea comentable es la que recibe el tab; si no hay ninguna, ninguna.
  const conFoco = comentables.includes(foco) ? foco : comentables[0];

  return (
    // min-w-max: las líneas largas desplazan el bloque entero, no se parten.
    <div ref={bloque} className="min-w-max">
      {filas.map((f, i) => {
        if (f.tipo === "archivo") {
          const icono = iconoDeArchivo(f.ruta);
          return (
            <div key={i} data-archivo={f.ruta} className="mt-4 mb-1.5 flex items-center gap-2 font-sans text-[12px] first:mt-0">
              {icono.src ? (
                <img src={icono.src} alt="" className="size-3.5 flex-none" loading="lazy" />
              ) : (
                <span className="bg-secondary text-muted-foreground flex-none rounded-sm px-1 font-mono text-[10px] leading-[14px] font-semibold">
                  {icono.rotulo}
                </span>
              )}
              <span className="text-foreground/90 font-mono font-medium">{f.ruta}</span>
              <span className="font-mono tabular-nums">
                <span className="text-paso">+{f.agregadas}</span> <span className="text-murio">−{f.quitadas}</span>
              </span>
            </div>
          );
        }
        if (f.tipo === "trozo") {
          return (
            <div key={i} className="text-muted-foreground/70 mt-2 pl-14 text-[12px] whitespace-pre">
              {f.texto || "···"}
            </div>
          );
        }

        const archivo = deQuienEs[i] ?? "";
        const marcable = comentables.includes(i);
        const puestas = marcable ? marcasDe(archivo, f.numero) : [];
        const estaAbierta = marcable && abierta === clave(archivo, f.numero);
        const linea = (
          <div
            key={i}
            {...(marcable
              ? {
                  "data-fila": i,
                  role: "button",
                  tabIndex: conFoco === i ? 0 : -1,
                  "aria-label": `Marcar la línea ${f.numero} de ${archivo}`,
                  onFocus: () => setFoco(i),
                  onKeyDown: (ev: React.KeyboardEvent) => porTeclado(ev, i, archivo, f.numero),
                  onClick: () => setAbierta(estaAbierta ? null : clave(archivo, f.numero)),
                }
              : {})}
            className={cn(
              "flex rounded-[4px]",
              f.clase === "mas" && "bg-paso/10",
              f.clase === "menos" && "bg-murio/10",
              // Una línea marcada se dice con el borde, no con un símbolo pegado al
              // número: la canaleta es tabular y cualquier cosa de más la corre.
              puestas.length > 0 && "border-l-2 border-l-white/35",
              marcable && "group hover:bg-secondary/70 focus-visible:bg-secondary/70 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/25",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-10 flex-none pr-3 text-right tabular-nums select-none",
                puestas.length > 0 ? "text-foreground/80" : "text-muted-foreground/50",
              )}
            >
              {/* La canaleta del número es el botón: con el puntero encima o el
                  foco puesto, el número se vuelve el ícono de comentar. */}
              {marcable ? (
                <>
                  <span className="group-hover:hidden group-focus-visible:hidden">{f.numero}</span>
                  <MessageSquarePlus className="ml-auto hidden size-3.5 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                f.numero
              )}
            </span>
            <span className={cn("w-4 flex-none select-none", f.clase === "mas" ? "text-paso" : f.clase === "menos" ? "text-murio" : "")}>
              {f.clase === "mas" ? "+" : f.clase === "menos" ? "−" : " "}
            </span>
            {/* El color de la sintaxis manda sobre el de la línea: lo agregado y lo quitado ya se
                dicen con el fondo y el signo, así que el texto puede decir qué es cada cosa. En las
                de contexto el código va apagado, que es lo que hace resaltar el cambio. */}
            <Codigo
              texto={f.texto}
              archivo={archivo}
              className={cn("whitespace-pre pr-3", f.clase === "ctx" ? "text-foreground/60 opacity-70" : "text-foreground/90")}
            />
          </div>
        );

        if (puestas.length === 0 && !estaAbierta) return linea;
        return (
          <div key={i}>
            {linea}
            {/* Alineado con el código, no con la canaleta: se lee como parte del diff. */}
            {/* sticky: el bloque del diff es tan ancho como su línea más larga, y
                sin esto un comentario en prosa quedaba corrido a la derecha, fuera
                de la pantalla. Pegado al borde visible, se lee siempre. */}
            <div className="sticky left-0 flex w-[min(72ch,calc(100vw-5rem))] flex-col gap-1.5 py-1.5 pl-14 font-sans">
              {puestas.map((m, j) => (
                <p key={j} className="bg-secondary/60 rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap">
                  <span className="text-muted-foreground">{m.quien}: </span>
                  {m.texto}
                </p>
              ))}
              {estaAbierta && alMarcar && (
                <CuadroDeMarca
                  archivo={archivo}
                  linea={f.numero}
                  noLaRegla={noLaRegla}
                  alGuardar={async (m) => {
                    await alMarcar(m);
                    setAbierta(null);
                  }}
                  alCerrar={() => setAbierta(null)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Lo que se escribe sobre una línea. El patrón es la opción de adentro: casi nunca se usa. */
function CuadroDeMarca({
  archivo,
  linea,
  noLaRegla,
  alGuardar,
  alCerrar,
}: {
  archivo: string;
  linea: number;
  noLaRegla?: string;
  alGuardar: (m: MarcaNueva) => Promise<void>;
  alCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [patron, setPatron] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    try {
      await alGuardar({ archivo, linea, texto, ...(patron?.trim() ? { patron: patron.trim() } : {}) });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-secondary/60 flex flex-col gap-2 rounded-xl p-2.5">
      <textarea
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") alCerrar();
          // Mandar con Ctrl+Enter, como en cualquier cuadro de comentario.
          if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && texto.trim()) void guardar();
        }}
        rows={2}
        maxLength={2000}
        autoFocus
        aria-label={`Qué hay que cambiar en ${archivo}, línea ${linea}`}
        placeholder="Qué hay que cambiar acá…"
        className="bg-background placeholder:text-muted-foreground w-full resize-none rounded-lg px-3 py-2 text-[13px] [field-sizing:content]"
      />
      {patron === null ? (
        <button
          type="button"
          onClick={() => setPatron("")}
          className="presionable text-muted-foreground hover:text-foreground self-start text-[12px]"
        >
          {/* Entre un campo y dos botones, sin el signo se leía como texto de ayuda
              y no como algo que se puede tocar. */}
          + Que el portón lo chequee siempre
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <input
            value={patron}
            onChange={(ev) => setPatron(ev.target.value)}
            maxLength={200}
            aria-label="La expresión regular que no tiene que volver a aparecer"
            placeholder="console[.]log"
            className="bg-background placeholder:text-muted-foreground w-full rounded-lg px-3 py-1.5 font-mono text-[12px]"
          />
          <span className="text-muted-foreground text-[12px]">
            Queda propuesto a la memoria y lo aprobás vos: desde ahí el portón corta cualquier rama que lo traiga.
          </span>
        </div>
      )}
      {noLaRegla && <span className="text-murio text-[12px]">{noLaRegla}</span>}
      <div className="flex items-center gap-2">
        <Button onClick={() => void guardar()} disabled={enviando || texto.trim().length === 0}>
          Marcar
        </Button>
        <Button variant="ghost" onClick={alCerrar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
