import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CircleCheck, CircleDot, EllipsisVertical, ExternalLink, Link2, ListFilter, LoaderCircle, Plus, RotateCw, Search, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { anotarTarjeta } from "@/lib/api";
import { ABIERTOS, alternarTermino, CERRADOS, filtrarIssues, MIOS, mismaConsulta, tieneTermino } from "@/lib/consulta";
import { haceCuanto } from "@/lib/datos";
import { traerIssues, traerTareaDeIssue, type Issue } from "@/lib/git";
import { cn } from "@/lib/utils";
import { Caras } from "./GitPiezas";
import { Aviso } from "./Pagina";

/**
 * Los issues del repo, con la pantalla de DOLPHIN (Nico, 01/11: «así se tiene que ver», y después
 * «no se ven igual que en DOLPHIN, así que sacá los de DOLPHIN»).
 *
 * La forma está portada de `escritorio/src/renderer/src/components/task-page/github/`
 * (`List.tsx` y `Rows.tsx`, que es el fork de DOLPHIN que vive en este repo), no aproximada de
 * memoria: una grilla y no una tabla, la barra de filtros y la lista pegadas como una sola
 * tarjeta, encabezados en versales, filas de 48 px separadas por un filete, el número en una
 * pastilla con su circulito, el contexto debajo del título y la acción a la derecha.
 *
 * Dos cosas quedan en el idioma de Dolphin a propósito:
 * - **Abierto es azul y cerrado es verde**: el verde es de lo que terminó bien, en todas las
 *   vistas (regla de Nico). DOLPHIN pinta «Abierto» de verde.
 * - **Comenzar no siembra de una.** Deja la tarea escrita en «Nueva», donde se elige el motor y
 *   cuántas ramas. Un botón que gasta plata de un clic, sin elegir con qué, no existe en Dolphin.
 */

/** La grilla de la lista, de DOLPHIN: ID · título y contexto · asignados · estado · actualizado · acciones. */
const GRILLA = "grid min-w-[790px] grid-cols-[72px_minmax(320px,1fr)_84px_100px_92px_122px] gap-3 px-3";
/** La superficie del encabezado pegajoso: un cuarto de tono sobre el fondo. */
const FONDO_ENCABEZADO = "[background:color-mix(in_srgb,var(--muted)_25%,var(--background))]";
/** Las dos primeras columnas quedan fijas al desplazar de costado; el `before` tapa el hueco del gap. */
const ID_FIJA = "sticky left-3 z-20 flex items-center before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-3 before:bg-inherit";
const TITULO_FIJA =
  "sticky left-[92px] z-20 flex min-w-0 flex-col justify-center border-r border-border/40 pr-2 before:absolute before:-left-2 before:top-0 before:bottom-0 before:w-2 before:bg-inherit";
const FONDO_FILA = "bg-background transition-colors group-hover/fila:bg-accent";

/** Los botones de arriba: tres preguntas, la misma consulta de texto. */
const SOLAPAS: readonly { nombre: string; consulta: string; pideSesion?: boolean }[] = [
  { nombre: "Abiertos", consulta: ABIERTOS },
  { nombre: "Asignados a mí", consulta: MIOS, pideSesion: true },
  { nombre: "Cerrados", consulta: CERRADOS },
];

type Estado =
  | { que: "cargando" }
  | { que: "listo"; issues: Issue[]; repo?: string; nuevoIssue?: string; yo?: string }
  | { que: "nada"; porQue: string }
  | { que: "error"; porQue: string };

export function Issues({ alContar, alComenzar }: { alContar?: (cuantos: number | null) => void; alComenzar: (tarea: string) => void }) {
  const [estado, setEstado] = useState<Estado>({ que: "cargando" });
  const [consulta, setConsulta] = useState(ABIERTOS);
  /** El issue que está yendo al compositor: su botón es el que espera, no todos. */
  const [yendo, setYendo] = useState<number | null>(null);
  const [dicho, setDicho] = useState<string | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    setEstado({ que: "cargando" });
    traerIssues().then(
      (r) =>
        setEstado(
          !r.esGit
            ? { que: "nada", porQue: "Este proyecto no es un repo de git." }
            : r.disponible
              ? { que: "listo", issues: r.issues, ...(r.repo ? { repo: r.repo } : {}), ...(r.nuevoIssue ? { nuevoIssue: r.nuevoIssue } : {}), ...(r.yo ? { yo: r.yo } : {}) }
              : { que: "nada", porQue: r.porQue },
        ),
      (e) => setEstado({ que: "error", porQue: e instanceof Error ? e.message : String(e) }),
    );
  }, []);

  useEffect(cargar, [cargar]);

  const todos = estado.que === "listo" ? estado.issues : [];
  const yo = estado.que === "listo" ? estado.yo : undefined;
  const repo = estado.que === "listo" ? estado.repo : undefined;
  const nuevoIssue = estado.que === "listo" ? estado.nuevoIssue : undefined;
  const filas = useMemo(() => filtrarIssues(todos, consulta, yo), [todos, consulta, yo]);
  useEffect(() => alContar?.(estado.que === "listo" ? filas.length : null), [alContar, estado.que, filas.length]);

  /** Las etiquetas que de verdad están en este repo: un menú con etiquetas que nadie usa no filtra nada. */
  const etiquetas = useMemo(() => [...new Set(todos.flatMap((i) => i.etiquetas))].sort((a, b) => a.localeCompare(b, "es")).slice(0, 20), [todos]);

  const comenzar = async (issue: Issue) => {
    setYendo(issue.numero);
    setFalla(null);
    try {
      const r = await traerTareaDeIssue(issue.numero);
      alComenzar(r.esGit ? r.tarea : `${issue.titulo}\n(issue: ${issue.url})`);
    } catch (error) {
      setFalla(`No pude leer el issue #${issue.numero}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setYendo(null);
    }
  };

  const anotar = async (issue: Issue) => {
    setFalla(null);
    try {
      // Con la marca «GitHub #N» adentro, traer los issues al tablero después no la duplica
      // (ver nucleo/issues-al-tablero.ts: la huella es el número, no el título).
      await anotarTarjeta({
        titulo: issue.titulo,
        columna: "ideas",
        tipo: /\b(bug|error|falla|roto|crash)\b/i.test(`${issue.titulo} ${issue.etiquetas.join(" ")}`) ? "bug" : "tarea",
        detalle: `GitHub #${issue.numero}\n${issue.url}`,
      });
      setDicho(`Anotada en el tablero: «${issue.titulo}».`);
    } catch (error) {
      setFalla(`No pude anotarla: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    // Ocupa lo que queda de la vista: la lista se desplaza adentro y el encabezado queda pegado
    // arriba, como en DOLPHIN; si scrollea la página entera, el encabezado se va con ella.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* La barra de filtros: es la parte de arriba de la misma tarjeta que la lista. */}
      <div className="flex min-w-0 flex-col gap-2.5 rounded-md rounded-b-none border border-border/50 bg-muted/35 px-3 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {SOLAPAS.filter((s) => !s.pideSesion || yo).map((s) => {
            const elegida = mismaConsulta(consulta, s.consulta);
            return (
              <button
                key={s.nombre}
                type="button"
                aria-pressed={elegida}
                onClick={() => setConsulta(s.consulta)}
                className={cn(
                  "presionable cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium",
                  elegida ? "border-border/50 bg-foreground/90 text-background shadow-xs" : "border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60",
                )}
              >
                {s.nombre}
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md border border-border/60 bg-background px-2.5 text-xs shadow-xs">
                <ListFilter aria-hidden="true" className="size-3.5" />
                Filtros
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuCheckboxItem checked={tieneTermino(consulta, "no:assignee")} onCheckedChange={() => setConsulta((c) => alternarTermino(c, "no:assignee"))} onSelect={(e) => e.preventDefault()}>
                Sin asignar
              </DropdownMenuCheckboxItem>
              {etiquetas.length > 0 && <DropdownMenuSeparator />}
              {etiquetas.length > 0 && <DropdownMenuLabel className="text-muted-foreground text-[12px] font-normal">Etiquetas</DropdownMenuLabel>}
              {etiquetas.map((e) => {
                // Con un espacio adentro, el término va entre comillas o se parte en dos.
                const termino = `label:${/\s/.test(e) ? `"${e}"` : e}`;
                return (
                  <DropdownMenuCheckboxItem key={e} checked={tieneTermino(consulta, termino)} onCheckedChange={() => setConsulta((c) => alternarTermino(c, termino))} onSelect={(ev) => ev.preventDefault()}>
                    <span className="truncate">{e}</span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative min-w-48 flex-1">
            <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              ref={campo}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="is:open label:bug assignee:@me"
              aria-label="Buscar issues, como en GitHub"
              spellCheck={false}
              className="placeholder:text-muted-foreground focus-visible:outline-ring h-8 w-full rounded-md border border-border/60 bg-background pr-8 pl-8 font-mono text-xs shadow-xs focus-visible:outline-2 focus-visible:-outline-offset-1"
            />
            {consulta !== "" && (
              <button
                type="button"
                aria-label="Vaciar la búsqueda"
                onClick={() => {
                  setConsulta("");
                  campo.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>

          {nuevoIssue && (
            <Button variant="outline" size="icon-sm" asChild className="rounded-md border border-border/60 bg-background shadow-xs">
              <a href={nuevoIssue} target="_blank" rel="noreferrer" title={`Abrir un issue nuevo en ${repo}`} aria-label={`Abrir un issue nuevo en ${repo}`}>
                <Plus aria-hidden="true" className="size-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={cargar}
            disabled={estado.que === "cargando"}
            aria-label="Volver a leer los issues"
            title="Volver a leer los issues"
            className="rounded-md border border-border/60 bg-background shadow-xs"
          >
            <RotateCw aria-hidden="true" className={cn("size-3.5", estado.que === "cargando" && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* La lista: la parte de abajo de la misma tarjeta, sin borde arriba ni esquinas. */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
        <div className="min-h-0 flex-initial overflow-auto" style={{ scrollbarGutter: "stable" }}>
          <div className={cn("sticky top-0 z-40 h-8 border-b border-border/50 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase [&>span]:flex [&>span]:items-center", FONDO_ENCABEZADO, GRILLA)}>
            <span className={cn("sticky left-3 z-30 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-3 before:bg-inherit", FONDO_ENCABEZADO)}>ID</span>
            <span className={cn("sticky left-[92px] z-30 border-r border-border/40 before:absolute before:-left-2 before:top-0 before:bottom-0 before:w-2 before:bg-inherit", FONDO_ENCABEZADO)}>Título / contexto</span>
            <span>Asignados</span>
            <span>Estado</span>
            <span>Actualizado</span>
            <span />
          </div>

          {falla && (
            <div className="border-b border-border/50 px-4 py-3">
              <Aviso>{falla}</Aviso>
            </div>
          )}
          {dicho && (
            <p role="status" className="text-muted-foreground border-b border-border/50 px-4 py-2.5 text-[13px]">
              {dicho}
            </p>
          )}

          {estado.que === "cargando" && (
            <div className="divide-y divide-border/40" aria-busy="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={cn("min-h-12 py-2.5", GRILLA)}>
                  <div className={ID_FIJA}>
                    <div className="h-6 w-16 animate-pulse rounded-md bg-muted/70" />
                  </div>
                  <div className={TITULO_FIJA}>
                    <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted/70" />
                    <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="flex items-center">
                    <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="flex items-center">
                    <div className="h-5 w-14 animate-pulse rounded-full bg-muted/70" />
                  </div>
                  <div className="flex items-center">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="flex items-center justify-start lg:justify-end">
                    <div className="h-7 w-16 animate-pulse rounded-md bg-muted/70" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {estado.que === "error" && (
            <div className="px-4 py-10 text-center">
              <p className="text-foreground text-base font-medium">No pude leer los issues</p>
              <p className="text-muted-foreground mt-2 text-sm">{estado.porQue}</p>
              <Button variant="outline" size="sm" onClick={cargar} className="mt-4">
                Reintentar
              </Button>
            </div>
          )}

          {estado.que === "nada" && (
            <div className="px-4 py-10 text-center">
              <p className="text-foreground text-base font-medium">Sin issues para mostrar</p>
              <p className="text-muted-foreground mt-2 text-sm">{estado.porQue}</p>
            </div>
          )}

          {estado.que === "listo" && filas.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-foreground text-base font-medium">{todos.length === 0 ? "Este repo no tiene issues en GitHub" : "Ningún issue coincide con esa búsqueda"}</p>
              {todos.length > 0 && (
                <p className="text-muted-foreground mt-2 text-sm">
                  <button type="button" onClick={() => setConsulta(ABIERTOS)} className="text-foreground cursor-pointer underline underline-offset-4">
                    Ver los abiertos
                  </button>
                </p>
              )}
            </div>
          )}

          {estado.que === "listo" && filas.length > 0 && (
            <div className="divide-y divide-border/40">
              {filas.map((issue) => (
                <Fila key={issue.numero} issue={issue} repo={repo} yendo={yendo === issue.numero} alComenzar={() => void comenzar(issue)} alAnotar={() => void anotar(issue)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fila({ issue, repo, yendo, alComenzar, alAnotar }: { issue: Issue; repo?: string; yendo: boolean; alComenzar: () => void; alAnotar: () => void }) {
  const Icono = issue.abierto ? CircleDot : CircleCheck;
  // Abierto es lo que queda por hacer (azul); cerrado, lo que ya salió (verde).
  const tono = issue.abierto ? "--hacer" : "--paso";
  return (
    <div className={cn("group/fila min-h-12 py-2.5 text-left transition-colors hover:bg-accent", GRILLA)}>
      <div className={cn(ID_FIJA, FONDO_FILA)}>
        {/* Sin relleno: una pastilla teñida se suma al hover de la fila y se lee como un segundo tono. */}
        <span className="text-muted-foreground inline-flex items-center gap-1 rounded-md border border-border/40 px-1.5 py-0.5" aria-label={`Issue #${issue.numero}`}>
          <Icono aria-hidden="true" className={cn("size-3", issue.abierto ? "text-hacer" : "text-paso")} />
          <span className="font-mono text-[11px] font-normal">#{issue.numero}</span>
        </span>
      </div>

      <div className={cn(TITULO_FIJA, FONDO_FILA)}>
        <div className="flex min-w-0 items-center gap-2">
          <a href={issue.url} target="_blank" rel="noreferrer" className="text-foreground truncate text-[13px] font-medium hover:underline" title={issue.titulo}>
            {issue.titulo}
          </a>
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px]">
          <span>{issue.autor?.login ?? issue.autor?.nombre ?? "sin autor"}</span>
          {repo && <span>{repo.split("/")[1]}</span>}
          {issue.etiquetas.slice(0, 3).map((e) => (
            <span key={e} className="text-muted-foreground rounded-full border border-border/40 bg-muted/30 px-1.5 py-0 text-[10px]">
              {e}
            </span>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground flex min-w-0 items-center text-xs">{issue.asignados.length > 0 ? <Caras personas={issue.asignados} max={3} /> : <span>—</span>}</div>

      <div className="flex items-center">
        <span
          className="con-tono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap"
          style={{ "--tono": `var(${tono})` } as React.CSSProperties}
        >
          <span aria-hidden="true" className="punto-tono size-1.5 flex-none rounded-full" />
          {issue.abierto ? "Abierto" : "Cerrado"}
        </span>
      </div>

      <div className="text-muted-foreground flex items-center text-[11px]" title={new Date(issue.actualizado).toLocaleString("es-AR")}>
        {haceCuanto(issue.actualizado)}
      </div>

      <div className="flex items-center justify-start gap-1 lg:justify-end">
        {issue.abierto && (
          <Button type="button" variant="outline" size="xs" onClick={alComenzar} disabled={yendo} className="min-w-[72px] gap-1 rounded-md border border-border/60 bg-background/80 font-semibold shadow-xs">
            {yendo ? <LoaderCircle aria-hidden="true" className="size-3 animate-spin" /> : null}
            Comenzar
            {!yendo && <ArrowRight aria-hidden="true" className="size-3" />}
          </Button>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer rounded-lg p-1.5 transition" aria-label={`Qué más hacer con el issue #${issue.numero}`}>
              <EllipsisVertical aria-hidden="true" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={alAnotar}>
              <SquarePen aria-hidden="true" className="size-4" /> Anotar en el tablero
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(issue.url)}>
              <Link2 aria-hidden="true" className="size-4" /> Copiar el link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={issue.url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" className="size-4" /> Abrir en GitHub
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
