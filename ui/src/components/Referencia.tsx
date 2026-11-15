import { CircleDot, GitBranch, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";
import { traerIssues, type Issue } from "@/lib/git";
import { cn } from "@/lib/utils";
import type { ClaseDeReferencia } from "@/lib/referencias";

/**
 * Lo que un texto nombró del proyecto, hecho una pastilla que se toca.
 *
 * Al pasar por encima aparece la ficha —el título del issue, si está abierto, quién lo abrió, sus
 * etiquetas— y al tocarla se abre. Es la misma idea que en el chat de la app de escritorio, con
 * una diferencia en cómo consigue los datos: acá los issues se traen UNA vez para toda la página
 * y las referencias se resuelven contra esa lista. Un parte de la memoria puede nombrar quince
 * issues; con una llamada por pastilla serían quince viajes a GitHub para dibujar un texto.
 */

const ICONO: Record<ClaseDeReferencia, typeof CircleDot> = {
  issue: CircleDot,
  pr: GitPullRequest,
  rama: GitBranch,
  commit: GitCommitHorizontal,
};

const COMO_SE_LLAMA: Record<ClaseDeReferencia, string> = {
  issue: "Issue",
  pr: "Pull request",
  rama: "Rama",
  commit: "Commit",
};

/**
 * Los issues del repo, pedidos una sola vez por carga de la página.
 *
 * La promesa se guarda, no el resultado: así dos pastillas que se dibujan en el mismo cuadro
 * esperan la misma llamada en vez de disparar dos.
 */
let pedido: Promise<ReadonlyMap<number, Issue>> | null = null;

function issuesDelRepo(): Promise<ReadonlyMap<number, Issue>> {
  pedido ??= traerIssues()
    .then((r) => {
      const mapa = new Map<number, Issue>();
      if (r.esGit && r.disponible) {
        for (const issue of r.issues) mapa.set(issue.numero, issue);
      }
      return mapa as ReadonlyMap<number, Issue>;
    })
    .catch(() => new Map() as ReadonlyMap<number, Issue>);
  return pedido;
}

/** Para los tests y para cuando el repo cambia: la próxima pastilla vuelve a pedir. */
export function olvidarIssues(): void {
  pedido = null;
}

export function Referencia({ clase, id, texto }: { clase: ClaseDeReferencia; id: string; texto: string }) {
  const [issue, setIssue] = useState<Issue | null | undefined>(undefined);
  const Icono = ICONO[clase];
  const esDeGitHub = clase === "issue" || clase === "pr";

  useEffect(() => {
    if (!esDeGitHub) return;
    let vigente = true;
    void issuesDelRepo().then((mapa) => {
      if (vigente) setIssue(mapa.get(Number(id)) ?? null);
    });
    return () => {
      vigente = false;
    };
  }, [esDeGitHub, id]);

  const rotulo = (
    <>
      <Icono aria-hidden="true" className="size-[0.92em] shrink-0 opacity-75" />
      {clase === "commit" ? id.slice(0, 7) : esDeGitHub ? `#${id}` : texto}
    </>
  );

  const clases = cn(
    "referencia inline-flex items-baseline gap-1 rounded-md px-[3px] align-baseline font-medium whitespace-nowrap",
    (clase === "rama" || clase === "commit") && "font-mono text-[0.88em]",
  );

  // Un `<a>` de verdad y no un div con onClick: se abre con el teclado, con el botón del medio y
  // con «abrir en una pestaña nueva», que es lo que alguien espera de algo que lleva a GitHub.
  const pastilla = issue ? (
    <a href={issue.url} target="_blank" rel="noreferrer" data-ref={clase} className={cn(clases, "hover:underline")}>
      {rotulo}
    </a>
  ) : (
    <span data-ref={clase} className={clases}>
      {rotulo}
    </span>
  );

  return (
    <span className="group/ref relative inline-block">
      {pastilla}
      {/* La ficha. Solo con hover y foco, y sin ocupar lugar: `absolute` desde este marco.
          `pointer-events-none` para que no se robe el hover de lo que hay debajo. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-40 hidden w-max max-w-[320px] flex-col gap-0.5 rounded-xl bg-popover p-2.5 text-popover-foreground shadow-lg ring-1 ring-white/[0.07] group-hover/ref:flex group-focus-within/ref:flex"
      >
        <span className="text-[11px] opacity-55">
          {COMO_SE_LLAMA[clase]} · {texto}
        </span>
        {esDeGitHub && issue === undefined && <span className="text-[12px] opacity-60">Buscando…</span>}
        {issue && (
          <>
            <span className="text-[13px] leading-snug font-medium text-pretty">{issue.titulo}</span>
            <span className="text-[12px] opacity-60">
              {[issue.abierto ? "abierto" : "cerrado", issue.autor ? `de ${issue.autor.nombre}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {issue.etiquetas.length > 0 && <span className="text-[12px] opacity-60">{issue.etiquetas.join(", ")}</span>}
          </>
        )}
        {esDeGitHub && issue === null && <span className="text-[12px] opacity-60">No lo encontré en este repo.</span>}
        {!esDeGitHub && (
          <span className="text-[12px] opacity-60">
            {clase === "rama" ? "Una rama de este repo." : "Un commit de este repo."}
          </span>
        )}
      </span>
    </span>
  );
}
