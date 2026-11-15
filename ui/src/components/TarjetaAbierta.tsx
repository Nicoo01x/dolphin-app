import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Hourglass, Users, X } from "lucide-react";
import { BotonCopiar } from "./BotonCopiar";
import { Button } from "@/components/ui/button";
import {
  COLUMNAS,
  comentarTarjeta,
  editarTarjeta,
  esperarTarjeta,
  laFrenan,
  NOMBRE_DE_COLUMNA,
  soltarTarjeta,
  TONO_DE_COLUMNA,
  type Columna,
  type Tarjeta,
  type TipoDeTarjeta,
} from "@/lib/api";
import { cuandoFue } from "@/lib/datos";
import { cn } from "@/lib/utils";
import { Aviso, conTono, Pagina, Seccion } from "./Pagina";
import { RevisarTarjeta } from "./RevisarTarjeta";

/**
 * Una tarjeta abierta: en qué columna está (y moverla), qué hay que hacer, cómo se sabe que está
 * terminada, quién la toma, los comentarios y por dónde pasó. Lo escrito se guarda al salir del
 * campo, y se dice que se guardó.
 */

type Campo = "titulo" | "detalle" | "terminado" | "quien";

const TIPOS: readonly { id: TipoDeTarjeta; nombre: string; tono?: string }[] = [
  { id: "tarea", nombre: "Tarea" },
  { id: "bug", nombre: "Bug", tono: "var(--murio)" },
  { id: "idea", nombre: "Idea", tono: "var(--idea)" },
];

export function TarjetaAbierta({
  tarjeta: t,
  tablero,
  alCambiar,
  alMover,
  alDale,
  alAbrir,
  alCerrar,
}: {
  tarjeta: Tarjeta;
  /** Todas: para saber a quién espera y a quién se puede esperar. */
  tablero: readonly Tarjeta[];
  alCambiar: (t: Tarjeta) => void;
  /** Rechaza si no se movió (o si espera a otra): el error se muestra acá, donde se tocó. */
  alMover: (c: Columna, quienAbrio: HTMLElement | null) => Promise<void>;
  /** Abrir el «dale»: el plan del líder y arrancar el equipo. */
  alDale: (quienAbrio: HTMLElement | null) => void;
  alAbrir: (id: string) => void;
  alCerrar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Campo | "tipo" | null>(null);
  // El foco va al título de la vista (para el lector de pantalla), no al campo: abrir no es editar.
  const encabezado = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    encabezado.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      // Adentro de un campo, esc es del campo (deshace lo escrito), no de la tarjeta.
      if (e.key !== "Escape" || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      alCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);
  useEffect(() => {
    if (!guardado) return;
    const reloj = window.setTimeout(() => setGuardado(null), 1400);
    return () => window.clearTimeout(reloj);
  }, [guardado]);

  const guardar = async (cambio: Partial<Record<Campo, string>> & { tipo?: TipoDeTarjeta }) => {
    try {
      alCambiar(await editarTarjeta(t.id, cambio));
      setError(null);
      setGuardado((Object.keys(cambio)[0] as Campo | "tipo") ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const mover = (c: Columna, quienAbrio: HTMLElement | null) =>
    void alMover(c, quienAbrio).then(
      () => setError(null),
      (e: unknown) => setError(`No se movió a ${NOMBRE_DE_COLUMNA[c]}: ${e instanceof Error ? e.message : String(e)}`),
    );

  return (
    <Pagina>
      <div className="flex w-full max-w-[760px] flex-col gap-6">
        <nav aria-label="Por dónde viniste" className="flex min-w-0 items-center gap-1 text-[13px]">
          <Button variant="secondary" size="icon" onClick={alCerrar} aria-label="Volver al tablero" className="mr-2">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <span className="text-muted-foreground">Tablero</span>
          <ChevronRight aria-hidden="true" className="text-muted-foreground size-3.5 flex-none" />
          <span aria-current="page" className="flex items-center gap-1.5 truncate font-medium" style={conTono(TONO_DE_COLUMNA[t.columna])}>
            <span aria-hidden="true" className="punto-tono size-2 rounded-full" />
            {NOMBRE_DE_COLUMNA[t.columna]}
          </span>
        </nav>

        <header className="flex flex-col gap-4">
          <h1 ref={encabezado} tabIndex={-1} className="sr-only">
            {t.titulo}
          </h1>
          <TituloEditable valor={t.titulo} guardado={guardado === "titulo"} alGuardar={(v) => void guardar({ titulo: v })} />
          {/* Moverla es elegir la columna: lo mismo que arrastrarla en el tablero. En angosto se desliza. */}
          <div role="group" aria-label="Columna" className="bg-secondary sin-barra -mx-1 flex max-w-full overflow-x-auto rounded-full p-0.5">
            {COLUMNAS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={t.columna === c}
                onClick={(e) => mover(c, e.currentTarget)}
                style={conTono(TONO_DE_COLUMNA[c])}
                className={cn(
                  "presionable flex flex-none cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap",
                  t.columna === c ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span aria-hidden="true" className={cn("punto-tono size-2 rounded-full", t.columna !== c && "opacity-50")} />
                {NOMBRE_DE_COLUMNA[c]}
              </button>
            ))}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            <div role="group" aria-label="Qué es" className="flex gap-1">
              {TIPOS.map((tipo) => (
                <button
                  key={tipo.id}
                  type="button"
                  aria-pressed={t.tipo === tipo.id}
                  onClick={() => t.tipo !== tipo.id && void guardar({ tipo: tipo.id })}
                  style={tipo.tono ? conTono(tipo.tono) : undefined}
                  className={cn(
                    "presionable cursor-pointer rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                    t.tipo === tipo.id ? (tipo.tono ? "con-tono" : "bg-secondary text-foreground") : "hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {tipo.nombre}
                </button>
              ))}
            </div>
            <span>
              anotada {cuandoFue(t.creada)} por {t.origen}
            </span>
          </div>
        </header>

        {error && <Aviso>{error}</Aviso>}

        <div className="flex flex-col gap-4">
          <Campo etiqueta="Qué hay que hacer" valor={t.detalle ?? ""} guardado={guardado === "detalle"} placeholder="Contalo como se lo contarías a alguien del equipo." alGuardar={(v) => void guardar({ detalle: v })} />
          <Campo etiqueta="Está terminada cuando…" valor={t.terminado ?? ""} guardado={guardado === "terminado"} placeholder="Lo que el portón tiene que poder probar." alGuardar={(v) => void guardar({ terminado: v })} />
          <Campo etiqueta="La toma" valor={t.quien ?? ""} guardado={guardado === "quien"} placeholder="Una persona, o «agentes»" una alGuardar={(v) => void guardar({ quien: v })} />
        </div>

        <ElEquipo tarjeta={t} frenan={laFrenan(t, tablero)} alDale={alDale} alCambiar={alCambiar} />
        <Espera tarjeta={t} tablero={tablero} alCambiar={alCambiar} alAbrir={alAbrir} />
        <Comentarios tarjeta={t} alCambiar={alCambiar} />
        <Recorrido tarjeta={t} />
      </div>
    </Pagina>
  );
}

/**
 * El equipo y la tarjeta: con rama, lo que hizo se revisa acá mismo (ver RevisarTarjeta); en Para
 * hacer, el «dale» (o el comando para la terminal). El equipo la mueve solo (ver equipo/con-tarjeta.ts).
 */
function ElEquipo({
  tarjeta: t,
  frenan,
  alDale,
  alCambiar,
}: {
  tarjeta: Tarjeta;
  frenan: readonly Tarjeta[];
  alDale: (quienAbrio: HTMLElement | null) => void;
  alCambiar: (t: Tarjeta) => void;
}) {
  // Con rama ya no manda a la vista Git a buscarla: cosechar dejó de ser una puerta aparte.
  if (t.rama) return <RevisarTarjeta tarjeta={t} alCambiar={alCambiar} />;
  if (t.columna !== "para-hacer") return null;
  const comando = `/hacer ${t.id.slice(0, 12)}`;
  return (
    <Seccion titulo="Que la haga el equipo">
      <div className="bg-secondary/60 flex flex-col gap-3 rounded-2xl p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={(e) => alDale(e.currentTarget)} disabled={frenan.length > 0}>
            <Users aria-hidden="true" /> Que lo haga el equipo
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 text-[12px]">
            {frenan.length > 0
              ? `Espera a ${frenan.map((x) => `«${x.titulo}»`).join(" y ")}: se destraba cuando ${frenan.length === 1 ? "esté" : "estén"} en Hecho.`
              : "El líder la parte y te dice cuánto cuesta antes de arrancar. Si pasa el portón, vuelve a Para revisar con su rama."}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
          <span>o en la terminal:</span>
          <code className="text-foreground/80 font-mono">{comando}</code>
          <BotonCopiar alCopiar={() => navigator.clipboard.writeText(comando).then(() => true, () => false)} rotulo="Copiar" chico />
        </div>
      </div>
    </Seccion>
  );
}

/** El título, editable en el lugar: se ve como título, ocupa los renglones que necesite y enter lo guarda. */
const TituloEditable = ({ valor, guardado, alGuardar }: { valor: string; guardado: boolean; alGuardar: (v: string) => void }) => {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  return (
    <div className="relative">
      <textarea
        value={texto}
        rows={1}
        aria-label="Título"
        onChange={(e) => setTexto(e.target.value.replace(/\n/g, " "))}
        onBlur={() => texto.trim() && texto !== valor && alGuardar(texto)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") setTexto(valor);
        }}
        className="titulo-vista hover:bg-secondary/60 focus:bg-secondary/60 field-sizing-content -mx-2 block w-[calc(100%+16px)] resize-none rounded-2xl bg-transparent px-2 py-1 transition-colors duration-150"
      />
      <Guardado visible={guardado} className="absolute -top-5 right-0" />
    </div>
  );
};

function Guardado({ visible, className }: { visible: boolean; className?: string }) {
  return (
    <span aria-live="polite" className={cn("text-paso flex items-center gap-1 text-[12px] transition-opacity duration-150", visible ? "opacity-100" : "opacity-0", className)}>
      {visible && (
        <>
          <Check aria-hidden="true" className="size-3.5" /> Guardado
        </>
      )}
    </span>
  );
}

function Campo({ etiqueta, valor, placeholder, una, guardado, alGuardar }: { etiqueta: string; valor: string; placeholder: string; una?: boolean; guardado: boolean; alGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const comun = {
    value: texto,
    placeholder,
    onBlur: () => texto !== valor && alGuardar(texto),
    className: "bg-secondary/60 placeholder:text-muted-foreground hover:bg-secondary focus:bg-secondary w-full rounded-2xl px-3.5 py-2.5 text-[13px] transition-colors duration-150",
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="titulo-seccion">{etiqueta}</span>
        <Guardado visible={guardado} />
      </span>
      {una ? (
        <input {...comun} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      ) : (
        <textarea {...comun} rows={3} onChange={(e) => setTexto(e.target.value)} className={cn(comun.className, "field-sizing-content min-h-[80px] resize-none")} />
      )}
    </label>
  );
}

function Comentarios({ tarjeta: t, alCambiar }: { tarjeta: Tarjeta; alCambiar: (t: Tarjeta) => void }) {
  const [texto, setTexto] = useState("");
  const [mandando, setMandando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comentar = async () => {
    if (!texto.trim() || mandando) return;
    setMandando(true);
    try {
      alCambiar(await comentarTarjeta(t.id, texto));
      setTexto("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMandando(false);
    }
  };
  return (
    <Seccion titulo="Comentarios" extra={t.comentarios.length > 0 ? t.comentarios.length : undefined}>
      {t.comentarios.map((c, i) => (
        <article key={i} className="bg-secondary/40 rounded-2xl px-3.5 py-2.5 text-[13px]">
          <p className="text-muted-foreground mb-1 text-[12px]">
            <span className="text-foreground/80 font-medium">{c.quien}</span> · {cuandoFue(c.cuando)}
            {/* De qué línea es: el mismo comentario se lee arriba, sobre el diff, y acá quedaba suelto. */}
            {c.donde && (
              <>
                {" · "}
                <code className="font-mono">
                  {c.donde.archivo}:{c.donde.linea}
                </code>
              </>
            )}
          </p>
          <p className="whitespace-pre-wrap">{c.texto}</p>
        </article>
      ))}
      <div className="bg-secondary/60 focus-within:ring-ring flex flex-col gap-2 rounded-2xl p-2 focus-within:ring-2">
        <textarea
          data-sin-anillo
          value={texto}
          rows={2}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void comentar();
          }}
          aria-label="Un comentario"
          placeholder="Un comentario…"
          className="placeholder:text-muted-foreground field-sizing-content min-h-[52px] w-full resize-none bg-transparent px-1.5 text-[13px] outline-none"
        />
        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-[12px] pointer-coarse:hidden">ctrl + enter</span>
          <Button size="sm" onClick={() => void comentar()} disabled={!texto.trim() || mandando}>
            {mandando ? "Comentando…" : "Comentar"}
          </Button>
        </div>
      </div>
      {error && <Aviso>{error}</Aviso>}
    </Seccion>
  );
}

/** Por dónde pasó: cada paso con el punto de su columna, lo último arriba. */
function Recorrido({ tarjeta: t }: { tarjeta: Tarjeta }) {
  if (t.historial.length < 2) return null;
  return (
    <Seccion titulo="Por dónde pasó">
      <ol className="flex flex-col gap-1.5 text-[13px]">
        {[...t.historial].reverse().map((h, i) => (
          <li key={i} className="flex items-center gap-2.5" style={conTono(TONO_DE_COLUMNA[h.columna])}>
            <span aria-hidden="true" className={cn("punto-tono size-2 flex-none rounded-full", i > 0 && "opacity-50")} />
            <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{NOMBRE_DE_COLUMNA[h.columna]}</span>
            <span className="text-muted-foreground text-[12px]">{cuandoFue(h.cuando)}</span>
          </li>
        ))}
      </ol>
    </Seccion>
  );
}

/**
 * A quién espera: no arranca hasta que esas estén en Hecho. Cada una se abre tocándola y se suelta
 * con la ×; «Esperar a…» suma otra. Abajo, las que la esperan a ella: lo que se destraba al terminarla.
 */
function Espera({ tarjeta: t, tablero, alCambiar, alAbrir }: { tarjeta: Tarjeta; tablero: readonly Tarjeta[]; alCambiar: (t: Tarjeta) => void; alAbrir: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const espera = (t.esperaA ?? []).map((id) => tablero.find((x) => x.id === id) ?? null);
  const esperan = tablero.filter((x) => x.esperaA?.includes(t.id));
  const candidatas = tablero.filter((x) => x.id !== t.id && !t.esperaA?.includes(x.id) && x.columna !== "hecho");
  if (t.columna === "hecho" && espera.length === 0 && esperan.length === 0) return null;

  const cambiar = async (pedido: Promise<Tarjeta>) => {
    try {
      alCambiar(await pedido);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const fila = "bg-secondary/40 flex min-h-11 items-center gap-2.5 rounded-2xl px-3.5 py-1.5 text-[13px]";

  return (
    <Seccion titulo="Espera a" extra={espera.length > 0 ? espera.length : undefined}>
      {espera.map((o, i) =>
        o ? (
          <div key={o.id} className={fila} style={conTono(TONO_DE_COLUMNA[o.columna])}>
            <span aria-hidden="true" className="punto-tono size-2 flex-none rounded-full" />
            <button type="button" onClick={() => alAbrir(o.id)} className={cn("min-w-0 flex-1 cursor-pointer truncate text-left hover:underline", o.columna === "hecho" && "text-muted-foreground line-through")}>
              {o.titulo}
            </button>
            <span className="text-muted-foreground flex-none text-[12px]">{NOMBRE_DE_COLUMNA[o.columna]}</span>
            <Button variant="ghost" size="icon" aria-label={`Dejar de esperar a «${o.titulo}»`} onClick={() => void cambiar(soltarTarjeta(t.id, o.id))}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div key={t.esperaA![i]} className={cn(fila, "text-muted-foreground")}>
            <span className="flex-1">Una tarjeta que ya no está</span>
            <Button variant="ghost" size="icon" aria-label="Soltarla" onClick={() => void cambiar(soltarTarjeta(t.id, t.esperaA![i]!))}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ),
      )}
      {t.columna !== "hecho" && candidatas.length > 0 && (
        <label className="text-muted-foreground flex items-center gap-2 text-[13px]">
          <Hourglass aria-hidden="true" className="size-4 flex-none" />
          <span className="sr-only">Esperar a otra tarjeta</span>
          <select
            value=""
            onChange={(e) => e.target.value && void cambiar(esperarTarjeta(t.id, e.target.value))}
            className="bg-secondary/60 hover:bg-secondary h-9 min-w-0 flex-1 cursor-pointer rounded-full px-3 text-[13px] transition-colors duration-150"
          >
            <option value="">Esperar a…</option>
            {COLUMNAS.filter((c) => c !== "hecho").map((c) => {
              const deEsta = candidatas.filter((x) => x.columna === c);
              return deEsta.length === 0 ? null : (
                <optgroup key={c} label={NOMBRE_DE_COLUMNA[c]}>
                  {deEsta.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.titulo}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      )}
      {error && <Aviso>{error}</Aviso>}
      {esperan.length > 0 && (
        <p className="text-muted-foreground text-[12px]">
          La {esperan.length === 1 ? "espera" : "esperan"}:{" "}
          {esperan.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ", "}
              <button type="button" onClick={() => alAbrir(x.id)} className="text-foreground/80 cursor-pointer hover:underline">
                {x.titulo}
              </button>
            </span>
          ))}
        </p>
      )}
    </Seccion>
  );
}
