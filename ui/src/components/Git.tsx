import { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3, GitBranch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cuandoFue } from "@/lib/datos";
import { traerCommits, traerRamas, type Commit, type EstadoDeTabla, type Rama } from "@/lib/git";
import { cn } from "@/lib/utils";
import { GitAdentro, type PasoGit } from "./GitAdentro";
import { Caras, Chip, Distancia, EstadoDeRama, segmento, Tira } from "./GitPiezas";
import { Issues } from "./Issues";
import { Aviso, Cabecera, Pagina } from "./Pagina";

/**
 * Git: las ramas, los commits y los issues del proyecto que estás mirando, en una tabla con filtro,
 * columnas a elegir y las caras de quién trabajó en cada cosa (pedido de Nico, 28/10, sobre una
 * tabla de contribuidores de 21st.dev). Adaptada a la consola: filas tonales sin líneas, el chrome
 * en blanco y negro y el estado en su color (el mismo de todas las vistas), solo cuando no es el
 * de siempre.
 *
 * Los issues tienen su propia vista (Issues.tsx): cada fila es trabajo que se puede empezar, así
 * que lleva el contexto debajo del título y el botón que lo manda al compositor. Las ramas y los
 * commits se leen, y para leer alcanza con esta tabla.
 */

type Que = "ramas" | "commits" | "issues";
type Estado<T> = EstadoDeTabla<T>;

interface Columna<T> {
  readonly id: string;
  readonly titulo: string;
  readonly ancho?: string;
  /** Se esconde en anchos chicos (el panel del escritorio mide ~700 px): lo de abajo de la columna principal. */
  readonly oculta?: string;
  /** La que nombra la fila: ahí va el botón que entra (estirado a toda la fila). */
  readonly principal?: boolean;
  readonly celda: (fila: T) => React.ReactNode;
}

const RAMAS: Columna<Rama>[] = [
  {
    id: "rama",
    titulo: "Rama",
    ancho: "w-[220px]",
    principal: true,
    celda: (r) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium" title={r.nombre}>
          {r.nombre}
        </span>
        {r.deDolphin && <Chip>Dolphin</Chip>}
      </span>
    ),
  },
  { id: "commit", titulo: "Último commit", celda: (r) => <span className="text-muted-foreground block truncate" title={r.mensaje}>{r.mensaje}</span> },
  { id: "quienes", titulo: "Quiénes", ancho: "w-[140px]", oculta: "max-[560px]:hidden", celda: (r) => <Caras personas={r.autores} /> },
  { id: "distancia", titulo: "Contra la base", ancho: "w-[120px]", oculta: "max-[760px]:hidden", celda: (r) => <Distancia rama={r} /> },
  { id: "fecha", titulo: "Actualizada", ancho: "w-[120px]", oculta: "max-[1000px]:hidden", celda: (r) => <span className="text-muted-foreground whitespace-nowrap">{cuandoFue(r.fecha)}</span> },
  { id: "estado", titulo: "Estado", ancho: "w-[150px]", celda: (r) => <EstadoDeRama rama={r} /> },
];

const COMMITS: Columna<Commit>[] = [
  { id: "hash", titulo: "Commit", ancho: "w-[90px]", celda: (c) => <code className="text-muted-foreground font-mono text-[12px]" title={c.hash}>{c.hashCorto}</code> },
  { id: "mensaje", titulo: "Mensaje", principal: true, celda: (c) => <span className="block truncate" title={c.mensaje}>{c.mensaje}</span> },
  {
    id: "autor",
    titulo: "Autor",
    ancho: "w-[200px]",
    celda: (c) => (
      <span className="flex min-w-0 items-center gap-2">
        <Caras personas={[c.autor]} />
        <span className="truncate">{c.autor.nombre}</span>
      </span>
    ),
  },
  { id: "ramas", titulo: "Ramas", ancho: "w-[200px]", oculta: "max-[900px]:hidden", celda: (c) => <span className="flex flex-wrap gap-1">{c.refs.slice(0, 3).map((r) => <Chip key={r}>{r}</Chip>)}</span> },
  { id: "fecha", titulo: "Cuándo", ancho: "w-[120px]", oculta: "max-[560px]:hidden", celda: (c) => <span className="text-muted-foreground whitespace-nowrap">{cuandoFue(c.fecha)}</span> },
];

/** Los filtros rápidos de cada tabla: una pregunta en una palabra. `fija`: con él, todas las filas tienen el mismo estado. */
const FILTROS: Record<Que, readonly { id: string; nombre: string; fija?: boolean }[]> = {
  ramas: [
    { id: "todas", nombre: "Todas" },
    { id: "integrar", nombre: "Por integrar", fija: true },
    { id: "mergeadas", nombre: "Mergeadas", fija: true },
    { id: "dolphin", nombre: "De Dolphin" },
  ],
  commits: [],
  issues: [],
};

const pasa: { [K in Que]: (fila: K extends "ramas" ? Rama : Commit, filtro: string) => boolean } = {
  ramas: (r, f) => f === "todas" || (f === "integrar" && r.adelante > 0 && !r.mergeada) || (f === "mergeadas" && r.mergeada) || (f === "dolphin" && r.deDolphin),
  commits: () => true,
  issues: () => true,
};

const texto = (fila: Rama | Commit): string =>
  "autores" in fila
    ? `${fila.nombre} ${fila.mensaje} ${fila.autores.map((p) => `${p.nombre} ${p.login ?? ""}`).join(" ")}`
    : `${fila.hashCorto} ${fila.mensaje} ${fila.autor.nombre} ${fila.refs.join(" ")}`;

const NOMBRE: Record<Que, string> = { ramas: "las ramas", commits: "los commits", issues: "los issues" };

export function Git({ alComenzar }: { alComenzar: (tarea: string) => void }) {
  const [que, setQue] = useState<Que>("ramas");
  const [ramas, setRamas] = useState<Estado<Rama>>({ que: "cargando" });
  const [commits, setCommits] = useState<Estado<Commit>>({ que: "cargando" });
  /** Cuántos issues está mostrando su vista: es lo que va al lado de la pestaña. */
  const [cuantosIssues, setCuantosIssues] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  /** Por dónde se entró (rama → commit); vacío es la tabla. */
  // #git/rama/<nombre> entra directo a esa rama: así llega una tarjeta a los cambios de su equipo.
  const [adentro, setAdentro] = useState<PasoGit[]>(() => {
    const rama = /^#git\/rama\/(.+)$/.exec(window.location.hash)?.[1];
    return rama ? [{ que: "rama", rama: decodeURIComponent(rama) }] : [];
  });
  // Al salir de lo que pidió el link, la dirección vuelve a ser la de la vista.
  useEffect(() => {
    if (adentro.length === 0 && window.location.hash.startsWith("#git/")) window.history.replaceState(null, "", "#git");
  }, [adentro.length]);
  const [filtro, setFiltro] = useState<Record<Que, string>>({ ramas: "todas", commits: "", issues: "" });
  // En el celular arranca con lo justo (la rama, quiénes y el estado); el resto se prende en «Columnas».
  const [ocultas, setOcultas] = useState<Record<Que, string[]>>(() =>
    window.innerWidth < 640 ? { ramas: ["commit", "distancia", "fecha"], commits: ["hash", "ramas", "fecha"], issues: [] } : { ramas: [], commits: [], issues: [] },
  );

  /** Lee una de las dos tablas; también es lo que hace «Reintentar». Los issues los lee su vista. */
  const cargar = useCallback((q: Que) => {
    const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const noEsGit = { que: "nada" as const, porQue: "Este proyecto no es un repo de git." };
    if (q === "ramas") {
      setRamas({ que: "cargando" });
      traerRamas().then((r) => setRamas(r.esGit ? { que: "listo", filas: r.ramas } : noEsGit), (e) => setRamas({ que: "error", porQue: motivo(e) }));
    } else if (q === "commits") {
      setCommits({ que: "cargando" });
      traerCommits().then((r) => setCommits(r.esGit ? { que: "listo", filas: r.commits } : noEsGit), (e) => setCommits({ que: "error", porQue: motivo(e) }));
    }
  }, []);

  useEffect(() => {
    cargar("ramas");
    cargar("commits");
  }, [cargar]);

  const estados = { ramas, commits } as const;
  const columnas = (que === "issues" ? [] : ({ ramas: RAMAS, commits: COMMITS }[que] as Columna<Rama | Commit>[])) as Columna<Rama | Commit>[];
  // Si el filtro ya dice el estado (todas mergeadas), la columna repetiría lo mismo en cada fila.
  const fija = FILTROS[que].find((f) => f.id === filtro[que])?.fija ?? false;
  const visibles = columnas.filter((c) => !ocultas[que].includes(c.id) && !(fija && c.id === "estado"));
  const estado: Estado<Rama | Commit> = que === "issues" ? { que: "listo", filas: [] } : estados[que];
  const filas = useMemo(() => {
    if (estado.que !== "listo") return [];
    const buscada = busqueda.trim().toLowerCase();
    const filtrar = pasa[que] as (fila: Rama | Commit, f: string) => boolean;
    return estado.filas.filter((f) => filtrar(f, filtro[que]) && (!buscada || texto(f).toLowerCase().includes(buscada)));
  }, [estado, busqueda, filtro, que]);
  const cuenta = (q: Que) => (q === "issues" ? cuantosIssues : estados[q].que === "listo" ? (estados[q] as { filas: unknown[] }).filas.length : null);
  const entrar = useCallback((p: PasoGit) => setAdentro((v) => [...v, p]), []);
  const volver = useCallback((pasos: number) => setAdentro((v) => v.slice(0, Math.max(0, v.length - pasos))), []);
  // Una rama entra a sus commits y un commit, a lo que cambió.
  const pasoDe = (fila: Rama | Commit): PasoGit | null => ("autores" in fila ? { que: "rama", rama: fila.nombre } : { que: "commit", commit: fila });
  const hayFiltros = FILTROS[que].length > 0;

  if (adentro.length > 0) return <GitAdentro adentro={adentro} entrar={entrar} volver={volver} />;

  return (
    <Pagina>
      <Cabecera titulo="Git">
        <div role="group" aria-label="Qué mirar" className="bg-secondary flex rounded-full p-0.5">
          {(["ramas", "commits", "issues"] as const).map((q) => (
            <button key={q} type="button" aria-pressed={que === q} onClick={() => setQue(q)} className={cn(segmento(que === q), "capitalize")}>
              {q}
              {cuenta(q) !== null && <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">{cuenta(q)}</span>}
            </button>
          ))}
        </div>
      </Cabecera>

      {/* Los issues tienen su propia vista: no es una tabla para leer, es trabajo para empezar. */}
      {que === "issues" ? (
        <Issues alContar={setCuantosIssues} alComenzar={alComenzar} />
      ) : (
        <>
          {/* En el teléfono: los filtros en una tira que se desliza y, debajo, el buscador a todo el ancho. */}
          <div className="-mt-1 flex flex-wrap items-center gap-2">
            {hayFiltros && (
              <Tira className="max-[640px]:flex-1">
                {FILTROS[que].map((f) => (
                  <button key={f.id} type="button" aria-pressed={filtro[que] === f.id} onClick={() => setFiltro((v) => ({ ...v, [que]: f.id }))} className={segmento(filtro[que] === f.id)}>
                    {f.nombre}
                  </button>
                ))}
              </Tira>
            )}
            <label
              className={cn(
                "bg-secondary focus-within:outline-ring ml-auto flex min-h-8 max-w-56 min-w-36 flex-1 items-center gap-2 rounded-full px-3 focus-within:outline-2 focus-within:outline-offset-2",
                hayFiltros ? "max-[640px]:order-last max-[640px]:ml-0 max-[640px]:max-w-none max-[640px]:basis-full" : "max-[640px]:ml-0 max-[640px]:max-w-none",
              )}
            >
              <Search aria-hidden="true" className="text-muted-foreground size-4 flex-none" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Filtrar…"
                aria-label="Filtrar por texto, persona o rama"
                data-sin-anillo
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* En el panel del escritorio y en el teléfono, solo el ícono: así entra en la fila de los filtros. */}
                <Button variant="secondary" aria-label="Columnas" title="Columnas" className="max-[900px]:w-8 max-[900px]:px-0">
                  <Columns3 aria-hidden="true" />
                  <span className="max-[900px]:hidden">Columnas</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {columnas.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!ocultas[que].includes(c.id)}
                    onCheckedChange={() => setOcultas((v) => ({ ...v, [que]: v[que].includes(c.id) ? v[que].filter((x) => x !== c.id) : [...v[que], c.id] }))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.titulo === "#" ? "Número" : c.titulo}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {estado.que === "cargando" && (
            <div className="flex flex-col gap-1" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 rounded-2xl" />
              ))}
            </div>
          )}
          {estado.que === "error" && (
            <Aviso alReintentar={() => cargar(que)}>
              No pude leer {NOMBRE[que]} del repo: {estado.porQue}
            </Aviso>
          )}
          {estado.que === "nada" && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitBranch aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Nada para mostrar</EmptyTitle>
                <EmptyDescription>{estado.porQue}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {estado.que === "listo" && (
            <div className="bg-secondary/40 overflow-x-auto rounded-3xl p-2">
              <table className="w-full border-separate border-spacing-y-0.5 text-[13px]">
                <thead>
                  <tr>
                    {visibles.map((c) => (
                      <th key={c.id} scope="col" className={cn("text-muted-foreground px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap", c.ancho ?? "w-full max-w-0", c.oculta)}>
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 ? (
                    <tr>
                      <td colSpan={visibles.length} className="text-muted-foreground px-3 py-10 text-center">
                        {estado.filas.length === 0
                          ? { ramas: "Este repo no tiene ramas todavía.", commits: "Este repo no tiene commits todavía." }[que]
                          : busqueda
                            ? `Nada coincide con «${busqueda}».`
                            : "No hay nada con ese filtro."}
                      </td>
                    </tr>
                  ) : (
                    filas.map((fila, n) => <Fila key={"hash" in fila ? `${fila.hash}-${n}` : n} fila={fila} visibles={visibles} paso={pasoDe(fila)} entrar={entrar} />)
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}

/**
 * Una fila de la tabla; si tiene adentro (una rama, un commit), su celda principal es un botón de
 * verdad estirado a toda la fila (el ::after cubre el `tr`, que es `relative`): se entra con un clic
 * en cualquier lado, con enter o espacio, y el lector de pantalla sigue leyendo cada celda.
 */
function Fila({ fila, visibles, paso, entrar }: { fila: Rama | Commit; visibles: Columna<Rama | Commit>[]; paso: PasoGit | null; entrar: (p: PasoGit) => void }) {
  const principal = Math.max(0, visibles.findIndex((c) => c.principal));
  return (
    <tr
      className={cn("group", paso && "relative cursor-pointer")}
      // Las caras y los links quedan por encima del botón (para el nombre al pasar): un clic ahí también entra.
      onClick={paso ? (e) => !(e.target as Element).closest("button, a") && entrar(paso) : undefined}
    >
      {visibles.map((c, i) => (
        <td
          key={c.id}
          className={cn(
            "group-hover:bg-background/70 group-has-[[data-entrar]:focus-visible]:bg-background/70 px-3 py-2.5 align-middle transition-colors pointer-coarse:h-12",
            i === 0 && "rounded-l-2xl",
            i === visibles.length - 1 && "rounded-r-2xl",
            c.ancho ?? "w-full max-w-0",
            c.oculta,
          )}
        >
          {paso && i === principal ? (
            <button
              type="button"
              data-entrar
              onClick={() => entrar(paso)}
              className={cn(
                "block w-full min-w-0 cursor-pointer text-left focus-visible:outline-none pointer-coarse:min-h-0 pointer-coarse:min-w-0",
                "after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring",
              )}
            >
              {c.celda(fila)}
            </button>
          ) : (
            c.celda(fila)
          )}
        </td>
      ))}
    </tr>
  );
}
