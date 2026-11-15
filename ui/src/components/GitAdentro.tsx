import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cuandoFue, iconoDeArchivo } from "@/lib/datos";
import { traerCommit, traerRama, type Commit, type DetalleDeCommit } from "@/lib/git";
import { cn } from "@/lib/utils";
import { LineasDiff } from "./Diff";
import { Caras, Chip } from "./GitPiezas";
import { Aviso, Cabecera, Pagina } from "./Pagina";

/**
 * Adentro de Git: los commits de una rama (los propios arriba, lo que ya está en la base apagado) y
 * un commit entero, con su mensaje, sus archivos y el diff. Pedido de Nico (28/10): «que se pueda
 * entrar al commit y todo». Arriba, las migas de por dónde se vino; esc vuelve un paso.
 */

export type PasoGit = { readonly que: "rama"; readonly rama: string } | { readonly que: "commit"; readonly commit: Commit };

type Leido<T> = { que: "cargando" } | { que: "listo"; datos: T } | { que: "error"; porQue: string };

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Lee al montar, cada vez que cambia la clave y al reintentar; lo que llega tarde de un paso viejo se tira. */
function useLeer<T>(clave: string, leer: () => Promise<{ esGit: boolean } & Partial<T>>): [Leido<T>, () => void] {
  const [estado, setEstado] = useState<Leido<T>>({ que: "cargando" });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    setEstado({ que: "cargando" });
    leer().then(
      (r) => vigente && setEstado(r.esGit ? { que: "listo", datos: r as unknown as T } : { que: "error", porQue: "Este proyecto no es un repo de git." }),
      (e) => vigente && setEstado({ que: "error", porQue: motivo(e) }),
    );
    return () => {
      vigente = false;
    };
    // La clave dice cuándo leer de nuevo: `leer` es una función nueva en cada render.
  }, [clave, intento]);
  return [estado, useCallback(() => setIntento((n) => n + 1), [])];
}

export function GitAdentro({ adentro, entrar, volver }: { adentro: readonly PasoGit[]; entrar: (p: PasoGit) => void; volver: (pasos: number) => void }) {
  const paso = adentro.at(-1)!;
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titulo.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) volver(1);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [paso, volver]);

  const migas = ["Git", ...adentro.map((p) => (p.que === "rama" ? p.rama : p.commit.hashCorto))];
  return (
    <Pagina>
      <nav aria-label="Por dónde viniste" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
        <Button variant="secondary" size="icon" onClick={() => volver(1)} aria-label="Volver" className="mr-2">
          <ArrowLeft aria-hidden="true" />
        </Button>
        {migas.map((m, i) => {
          const ultima = i === migas.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden="true" className="text-muted-foreground size-3.5 flex-none" />}
              {ultima ? (
                <span aria-current="page" className="truncate font-medium">
                  {m}
                </span>
              ) : (
                <button type="button" onClick={() => volver(migas.length - 1 - i)} className="text-muted-foreground hover:text-foreground cursor-pointer truncate rounded-full">
                  {m}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      {paso.que === "rama" ? <DeLaRama rama={paso.rama} titulo={titulo} entrar={entrar} /> : <ElCommit commit={paso.commit} titulo={titulo} />}
    </Pagina>
  );
}

function DeLaRama({ rama, titulo, entrar }: { rama: string; titulo: React.RefObject<HTMLHeadingElement | null>; entrar: (p: PasoGit) => void }) {
  const [leido, reintentar] = useLeer<{ commits: Commit[]; propios?: number }>(rama, () => traerRama(rama));
  const propios = leido.que === "listo" ? (leido.datos.propios ?? leido.datos.commits.length) : 0;
  // La base no tiene «propios»: no hay nada por integrar que contar.
  const porIntegrar = leido.que === "listo" && leido.datos.propios !== undefined && propios > 0 ? propios : 0;
  return (
    <section className="flex flex-col gap-4">
      <Cabecera ref={titulo} titulo={rama} detalle={porIntegrar > 0 && <Chip tono="revisar">{porIntegrar} por integrar</Chip>} />
      {leido.que === "cargando" && <Cargando />}
      {leido.que === "error" && <Aviso alReintentar={reintentar}>No pude leer la rama: {leido.porQue}</Aviso>}
      {leido.que === "listo" && (
        <ol className="bg-secondary/40 flex flex-col gap-0.5 rounded-3xl p-2">
          {leido.datos.commits.map((c, i) => (
            <Fragment key={c.hash}>
              {i === propios && i > 0 && (
                <li aria-hidden="true" className="text-muted-foreground px-3 pt-3 pb-1 text-[12px] font-medium">
                  Ya en la base
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => entrar({ que: "commit", commit: c })}
                  className={cn(
                    "hover:bg-background/70 flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] transition-colors",
                    i >= propios && "text-muted-foreground",
                  )}
                >
                  <code className="text-muted-foreground flex-none font-mono text-[12px]">{c.hashCorto}</code>
                  <span className="min-w-0 flex-1 truncate" title={c.mensaje}>
                    {c.mensaje}
                  </span>
                  <span className="flex flex-none items-center gap-2 max-[560px]:hidden">
                    <Caras personas={[c.autor]} />
                  </span>
                  <span className="text-muted-foreground w-[96px] flex-none text-right whitespace-nowrap max-[480px]:hidden">{cuandoFue(c.fecha)}</span>
                  <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 flex-none" />
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
    </section>
  );
}

function ElCommit({ commit, titulo }: { commit: Commit; titulo: React.RefObject<HTMLHeadingElement | null> }) {
  const [leido, reintentar] = useLeer<DetalleDeCommit>(commit.hash, () => traerCommit(commit.hash));
  const diff = useRef<HTMLDivElement>(null);
  const datos = leido.que === "listo" ? leido.datos : null;
  const [primera, ...resto] = (datos?.mensaje ?? commit.mensaje).trim().split("\n");
  const cuerpo = resto.join("\n").trim();
  const total = datos?.archivos.reduce((s, a) => [s[0]! + a.agregadas, s[1]! + a.quitadas], [0, 0]) ?? [0, 0];

  const irAlArchivo = (archivo: string) => {
    const destino = [...(diff.current?.querySelectorAll<HTMLElement>("[data-archivo]") ?? [])].find((el) => el.dataset.archivo === archivo);
    destino?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        {/* El mensaje entero, sin cortar: el título de un commit es lo que lo explica. */}
        <h1 ref={titulo} tabIndex={-1} className="titulo-vista break-words">
          {primera}
        </h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="flex items-center gap-2">
            <Caras personas={[commit.autor]} />
            <span className="text-foreground/80">{commit.autor.nombre}</span>
          </span>
          <span>{cuandoFue(commit.fecha)}</span>
          <code className="font-mono text-[12px]" title={commit.hash}>
            {commit.hashCorto}
          </code>
        </div>
        {cuerpo && <p className="text-muted-foreground max-w-[80ch] text-[13px] whitespace-pre-wrap">{cuerpo}</p>}
      </header>
      {leido.que === "cargando" && <Cargando />}
      {leido.que === "error" && <Aviso alReintentar={reintentar}>No pude leer el commit: {leido.porQue}</Aviso>}
      {datos && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-[13px] tabular-nums">
              {datos.archivos.length} {datos.archivos.length === 1 ? "archivo" : "archivos"} · <span className="text-paso">+{total[0]}</span> <span className="text-murio">−{total[1]}</span>
            </p>
            {/* Una lista y no pastillas sueltas: con la ruta entera adentro de cada una, cinco
                archivos ya eran un muro de texto. Acá el nombre va primero y en claro, la carpeta
                detrás y apagada, y los números alineados en su columna, que es lo que deja
                comparar de un vistazo cuál es el cambio grande. */}
            <ul className="bg-secondary/40 flex flex-col rounded-2xl p-1">
              {datos.archivos.map((a) => {
                const icono = iconoDeArchivo(a.archivo);
                const partes = a.archivo.split("/");
                const nombre = partes.pop() ?? a.archivo;
                // Las dos últimas carpetas alcanzan para ubicarlo: `escritorio/src/renderer/src/
                // components/lienzo/` ocupa media pantalla y lo único que distingue es el final.
                const carpeta = partes.length === 0 ? "" : `${partes.length > 2 ? "…/" : ""}${partes.slice(-2).join("/")}`;
                return (
                  <li key={a.archivo}>
                    <button
                      type="button"
                      onClick={() => irAlArchivo(a.archivo)}
                      title={a.archivo}
                      className="presionable hover:bg-background/70 flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px]"
                    >
                      {icono.src ? (
                        <img src={icono.src} alt="" className="size-3.5 flex-none" loading="lazy" />
                      ) : (
                        <span className="bg-secondary text-muted-foreground flex-none rounded-sm px-1 font-mono text-[10px] leading-[14px] font-semibold">
                          {icono.rotulo}
                        </span>
                      )}
                      {/* El nombre primero y la carpeta detrás, como en la lista de cambios de un
                          editor: lo que se busca con el ojo es el archivo, no el `web/src/` que
                          comparten todos. La ruta entera está en el title y abajo, en el diff. */}
                      <span className="min-w-0 flex-1 truncate font-mono">
                        <span className="text-foreground/90 font-medium">{nombre}</span>
                        {carpeta && <span className="text-muted-foreground"> {carpeta}</span>}
                      </span>
                      <span className="flex-none tabular-nums">
                        <span className="text-paso">+{a.agregadas}</span> <span className="text-murio">−{a.quitadas}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div ref={diff} role="region" aria-label="El diff del commit" tabIndex={0} className="bg-secondary/40 overflow-x-auto rounded-3xl p-4 font-mono text-[12px] leading-relaxed">
            {datos.diff ? <LineasDiff texto={datos.diff} /> : <p className="text-muted-foreground font-sans text-[13px]">Este commit no cambia el texto de ningún archivo.</p>}
            {datos.recortado && <p className="text-muted-foreground mt-3 font-sans text-[12px]">El diff sigue: es más largo de lo que se muestra acá.</p>}
          </div>
        </>
      )}
    </section>
  );
}

const Cargando = () => (
  <div className="flex flex-col gap-1" aria-busy="true">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-11 rounded-2xl" />
    ))}
  </div>
);
