import { useCallback, useEffect, useRef, useState } from "react";
import { Hourglass, MessageSquare, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { anotarTarjeta, COLUMNAS, laFrenan, moverTarjeta, NOMBRE_DE_COLUMNA, TONO_DE_COLUMNA, traerTablero, type Columna, type Tarjeta } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Aviso, Cabecera, conTono, Pagina } from "./Pagina";
import { DaleDeTarjeta } from "./DaleDeTarjeta";
import { TarjetaAbierta } from "./TarjetaAbierta";

/**
 * El tablero: lo que hay que hacer en el proyecto, en cinco columnas fijas (ver docs/idea.md). Se
 * anota en Ideas o en Para hacer, se arrastra entre columnas y se abre para escribir el detalle,
 * cómo se sabe que está terminada y los comentarios. Cada columna con su color (app.css): el mismo
 * punto en la columna, en la tarjeta abierta y en la barra de arriba.
 */

/** Dónde se puede anotar: lo demás llega moviendo (Haciendo lo arranca un equipo, Hecho lo integra alguien). */
const SE_ANOTA: readonly Columna[] = ["ideas", "para-hacer"];

/**
 * Pasar a Haciendo es darle «dale» al equipo, salvo que la tome una persona: ahí solo se mueve.
 * Lo que ya está en Haciendo, o más adelante, no se vuelve a arrancar.
 */
const loArrancaElEquipo = (t: Tarjeta) => (t.columna === "ideas" || t.columna === "para-hacer") && (!t.quien || t.quien === "agentes");

/** La tarjeta abierta vive en la dirección (#tareas/<id>): atrás la cierra y se puede pasar el link. */
const abiertaDeLaUrl = () => /^#tareas\/(.+)$/.exec(window.location.hash)?.[1] ?? null;

export function Tareas() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  const [error, setError] = useState<{ texto: string; deCarga: boolean } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(abiertaDeLaUrl);
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [encima, setEncima] = useState<Columna | null>(null);
  /** La tarjeta a la que se le está por dar «dale», y quién abrió la ventana (ahí vuelve el foco). */
  const [dale, setDale] = useState<{ id: string; quienAbrio: HTMLElement | null } | null>(null);
  const ultima = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTarjetas((await traerTablero()).tarjetas);
      setError(null);
    } catch (e) {
      setError({ texto: e instanceof Error ? e.message : String(e), deCarga: true });
    }
  }, []);
  useEffect(() => {
    void cargar();
    // Los agentes y la terminal también mueven tarjetas: se relee al volver a la pestaña.
    const alVolver = () => document.visibilityState === "visible" && void cargar();
    const alMoverse = () => setAbierta(abiertaDeLaUrl());
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("popstate", alMoverse);
    window.addEventListener("hashchange", alMoverse);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("popstate", alMoverse);
      window.removeEventListener("hashchange", alMoverse);
    };
  }, [cargar]);

  const abrir = (id: string) => {
    ultima.current = id;
    window.history.pushState(null, "", `#tareas/${encodeURIComponent(id)}`);
    setAbierta(id);
  };
  // Al cerrar, el foco vuelve a la tarjeta que se abrió: con el teclado no se pierde el lugar.
  const cerrar = useCallback(() => {
    window.history.pushState(null, "", "#tareas");
    setAbierta(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tarjeta="${CSS.escape(ultima.current ?? "")}"]`)?.focus());
  }, []);

  // Se ve movida al instante; si el servidor dice que no, vuelve a donde estaba y el error se lanza
  // para que lo muestre quien movió (el tablero, o la tarjeta abierta).
  const mover = async (id: string, columna: Columna) => {
    const antes = tarjetas;
    const ahora = new Date().toISOString();
    setTarjetas((v) => v?.map((t) => (t.id === id && t.columna !== columna ? { ...t, columna, movida: ahora } : t)) ?? v);
    try {
      const movida = await moverTarjeta(id, columna);
      setTarjetas((v) => v?.map((t) => (t.id === id ? movida : t)) ?? v);
    } catch (e) {
      setTarjetas(antes);
      throw e;
    }
  };
  const moverDesdeElTablero = (id: string, columna: Columna) =>
    void mover(id, columna).catch((e: unknown) => setError({ texto: e instanceof Error ? e.message : String(e), deCarga: false }));
  /**
   * Llevarla a una columna desde el tablero o desde la tarjeta abierta. A Haciendo, si la toma el
   * equipo, abre el «dale»; si espera a otra, no se mueve y se dice a cuál.
   */
  const llevar = (t: Tarjeta, columna: Columna, quienAbrio: HTMLElement | null): "dale" | "frenada" | "movida" => {
    if (columna !== "haciendo" || !loArrancaElEquipo(t)) return "movida";
    const frenan = laFrenan(t, tarjetas ?? []);
    if (frenan.length > 0) return "frenada";
    setError(null);
    setDale({ id: t.id, quienAbrio });
    return "dale";
  };
  const frenadaPor = (t: Tarjeta) => `«${t.titulo}» espera a ${laFrenan(t, tarjetas ?? []).map((x) => `«${x.titulo}»`).join(" y ")}: primero eso.`;
  const soltarEn = (id: string, columna: Columna) => {
    const t = tarjetas?.find((x) => x.id === id);
    if (!t || t.columna === columna) return;
    const que = llevar(t, columna, document.querySelector<HTMLElement>(`[data-tarjeta="${CSS.escape(id)}"]`));
    if (que === "frenada") setError({ texto: frenadaPor(t), deCarga: false });
    else if (que === "movida") moverDesdeElTablero(id, columna);
  };
  const ventanaDelDale = (() => {
    const t = dale ? tarjetas?.find((x) => x.id === dale.id) : undefined;
    if (!dale || !t) return null;
    return (
      <DaleDeTarjeta
        tarjeta={t}
        quienAbrio={dale.quienAbrio}
        alArrancar={(movida) => setTarjetas((v) => v?.map((x) => (x.id === movida.id ? movida : x)) ?? v)}
        alHacerloYo={() => mover(t.id, "haciendo")}
        alCerrado={() => setDale(null)}
      />
    );
  })();

  const reemplazar = (t: Tarjeta) => setTarjetas((v) => v?.map((x) => (x.id === t.id ? t : x)) ?? v);
  const actual = abierta ? tarjetas?.find((t) => t.id === decodeURIComponent(abierta)) : undefined;
  if (actual) {
    return (
      <>
        <TarjetaAbierta
          tarjeta={actual}
          tablero={tarjetas ?? []}
          alCambiar={reemplazar}
          alMover={(c, quienAbrio) => {
            const que = llevar(actual, c, quienAbrio);
            if (que === "frenada") return Promise.reject(new Error(frenadaPor(actual)));
            return que === "dale" ? Promise.resolve() : mover(actual.id, c);
          }}
          alDale={(quienAbrio) => setDale({ id: actual.id, quienAbrio })}
          alAbrir={abrir}
          alCerrar={cerrar}
        />
        {ventanaDelDale}
      </>
    );
  }

  const cuantas = (c: Columna) => tarjetas?.filter((t) => t.columna === c).length ?? 0;
  return (
    <Pagina>
      <Cabecera titulo="Tablero" detalle={tarjetas && tarjetas.length > 0 ? <Reparto cuantas={cuantas} total={tarjetas.length} /> : undefined} />
      {error && (
        <Aviso alReintentar={error.deCarga ? () => void cargar() : undefined}>
          {error.deCarga ? `No pude leer el tablero: ${error.texto}` : error.texto}
        </Aviso>
      )}
      {tarjetas === null && !error ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true">
          {COLUMNAS.map((c) => (
            <Skeleton key={c} className="h-64 min-w-[232px] flex-1 rounded-3xl" />
          ))}
        </div>
      ) : tarjetas === null ? null : (
        // En el panel del escritorio (~700 px) no entran las cinco: se desliza de a una columna.
        <div className="-mx-5 flex min-h-[320px] flex-1 snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 max-[640px]:-mx-4 max-[640px]:scroll-px-4 max-[640px]:px-4">
          {COLUMNAS.map((columna) => {
            const estas = tarjetas.filter((t) => t.columna === columna);
            return (
              <section
                key={columna}
                aria-label={NOMBRE_DE_COLUMNA[columna]}
                style={conTono(TONO_DE_COLUMNA[columna])}
                onDragOver={(e) => {
                  if (!arrastrada) return;
                  e.preventDefault();
                  setEncima(columna);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima((x) => (x === columna ? null : x));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastrada) soltarEn(arrastrada, columna);
                  setArrastrada(null);
                  setEncima(null);
                }}
                className={cn(
                  // Toda la altura: se puede soltar en cualquier lugar de la columna, aunque esté vacía.
                  "superficie-tono flex min-w-[232px] flex-1 basis-0 max-[640px]:min-w-[84%] snap-start flex-col gap-1.5 rounded-3xl p-2 transition-[background-color,box-shadow] duration-150",
                  encima === columna && "shadow-[inset_0_0_0_2px_var(--tono)]",
                )}
              >
                <h2 className="flex items-center gap-2 px-2 pt-1.5 pb-1 text-[13px] font-semibold">
                  <span aria-hidden="true" className={cn("punto-tono size-2 flex-none rounded-full", columna === "haciendo" && estas.length > 0 && "animate-pulso-vivo")} />
                  {NOMBRE_DE_COLUMNA[columna]}
                  <span className={cn("ml-auto rounded-full px-2 py-px text-[12px] font-medium tabular-nums", estas.length > 0 ? "con-tono" : "text-muted-foreground")}>{estas.length}</span>
                </h2>
                {estas.map((t) => (
                  <FichaDeTarjeta key={t.id} tarjeta={t} frenan={columna === "hecho" ? [] : laFrenan(t, tarjetas)} arrastrando={arrastrada === t.id} alAbrir={() => abrir(t.id)} alArrastrar={setArrastrada} />
                ))}
                {SE_ANOTA.includes(columna) && (
                  <Anotar
                    columna={columna}
                    alAnotar={(t) => setTarjetas((v) => [t, ...(v ?? [])])}
                    alFallar={(texto) => setError({ texto, deCarga: false })}
                    vacio={tarjetas.length === 0 && columna === "para-hacer"}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
      {ventanaDelDale}
    </Pagina>
  );
}

/** Cuánto hay en cada columna, como una barra de cinco tramos con sus colores: se lee de un vistazo. */
function Reparto({ cuantas, total }: { cuantas: (c: Columna) => number; total: number }) {
  const texto = COLUMNAS.map((c) => `${cuantas(c)} ${NOMBRE_DE_COLUMNA[c].toLowerCase()}`).join(", ");
  return (
    <span role="img" aria-label={texto} title={texto} className="bg-secondary inline-flex h-2 w-40 gap-0.5 overflow-hidden rounded-full align-middle max-[480px]:w-24">
      {COLUMNAS.filter((c) => cuantas(c) > 0).map((c) => (
        <span key={c} className="punto-tono h-full" style={{ ...conTono(TONO_DE_COLUMNA[c]), flexGrow: cuantas(c), flexBasis: 0, minWidth: 4 }} />
      ))}
      {total === 0 && <span className="flex-1" />}
    </span>
  );
}

function FichaDeTarjeta({
  tarjeta: t,
  frenan,
  arrastrando,
  alAbrir,
  alArrastrar,
}: {
  tarjeta: Tarjeta;
  /** Las que tiene que esperar: mientras haya, la ficha se ve en pausa y dice a cuál espera. */
  frenan: readonly Tarjeta[];
  arrastrando: boolean;
  alAbrir: () => void;
  alArrastrar: (id: string | null) => void;
}) {
  const n = t.comentarios.length;
  // El tipo se marca solo cuando dice algo: una idea en Ideas ya es obvia.
  const tipo = t.tipo === "bug" ? { nombre: "Bug", tono: "var(--murio)" } : t.tipo === "idea" && t.columna !== "ideas" ? { nombre: "Idea", tono: "var(--idea)" } : null;
  return (
    <button
      type="button"
      draggable
      data-tarjeta={t.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        alArrastrar(t.id);
      }}
      onDragEnd={() => alArrastrar(null)}
      onClick={alAbrir}
      className={cn(
        "ficha flex w-full cursor-pointer flex-col gap-2 rounded-2xl px-3 py-2.5 text-left text-[13px] transition-[background-color,opacity] duration-150",
        arrastrando && "opacity-40",
      )}
    >
      <span className={cn("line-clamp-3 leading-snug font-medium", frenan.length > 0 && "text-foreground/70")}>{t.titulo}</span>
      {frenan.length > 0 && (
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[12px]" title={frenan.map((x) => x.titulo).join(" · ")}>
          <Hourglass aria-hidden="true" className="size-3.5 flex-none" />
          <span className="truncate">espera a «{frenan[0]!.titulo}»{frenan.length > 1 ? ` y ${frenan.length - 1} más` : ""}</span>
        </span>
      )}
      {(tipo || t.quien || n > 0) && (
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[12px]">
          {tipo && (
            <span className="con-tono flex-none rounded-full px-2 py-px font-medium" style={conTono(tipo.tono)}>
              {tipo.nombre}
            </span>
          )}
          {t.quien && <span className="bg-background/60 truncate rounded-full px-2 py-px">{t.quien}</span>}
          {n > 0 && (
            <span className="ml-auto flex flex-none items-center gap-1 tabular-nums" aria-label={n === 1 ? "1 comentario" : `${n} comentarios`}>
              <MessageSquare aria-hidden="true" className="size-3.5" />
              {n}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/** Anotar sin salir del tablero: se escribe el título, enter, y queda listo para la siguiente. */
function Anotar({ columna, alAnotar, alFallar, vacio }: { columna: Columna; alAnotar: (t: Tarjeta) => void; alFallar: (e: string) => void; vacio: boolean }) {
  const [abierto, setAbierto] = useState(vacio);
  const [titulo, setTitulo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  const anotar = async () => {
    if (!titulo.trim() || guardando) return;
    setGuardando(true);
    try {
      alAnotar(await anotarTarjeta({ titulo, columna, ...(columna === "ideas" ? { tipo: "idea" as const } : {}) }));
      setTitulo("");
      campo.current?.focus();
    } catch (e) {
      alFallar(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex cursor-pointer items-center gap-1.5 rounded-2xl px-3 py-2 text-left text-[13px] transition-colors duration-150">
        <Plus aria-hidden="true" className="size-4" /> {columna === "ideas" ? "Anotar una idea" : "Anotar"}
      </button>
    );
  }
  return (
    <div className="ficha focus-within:ring-ring flex flex-col gap-2 rounded-2xl p-2 focus-within:ring-2">
      <textarea
        ref={campo}
        data-sin-anillo
        value={titulo}
        rows={2}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void anotar();
          } else if (e.key === "Escape") {
            setTitulo("");
            setAbierto(false);
          }
        }}
        aria-label={columna === "ideas" ? "La idea" : "Lo que hay que hacer"}
        placeholder={vacio ? "Lo primero que haya que hacer…" : columna === "ideas" ? "Una idea…" : "Lo que hay que hacer…"}
        className="placeholder:text-muted-foreground w-full resize-none bg-transparent px-1 text-[13px] outline-none"
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => (setTitulo(""), setAbierto(false))}>
          Cerrar
        </Button>
        <Button size="sm" onClick={() => void anotar()} disabled={!titulo.trim() || guardando}>
          {guardando ? "Anotando…" : "Anotar"}
        </Button>
      </div>
    </div>
  );
}
