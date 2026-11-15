import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, GitMerge, GitPullRequest } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Persona, Rama } from "@/lib/git";
import { conTono } from "./Pagina";

/** Las piezas chicas de la vista Git: las caras de quién trabajó, el estado, los chips y la tira de filtros. */

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

/**
 * Las caras, una encima de otra, con el nombre al pasar. Más de cuatro: «+N». No son paradas del
 * tabulador (eran hasta 17 de más por pantalla): el nombre lo dice la etiqueta de cada una. Van por
 * encima del botón estirado de la fila para que el nombre aparezca al pasar el mouse.
 */
export function Caras({ personas, max = 4 }: { personas: readonly Persona[]; max?: number }) {
  const vistas = personas.slice(0, max);
  const resto = personas.length - vistas.length;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative z-10 flex w-fit items-center -space-x-2">
        {vistas.map((p) => (
          <Tooltip key={p.login ?? p.nombre}>
            <TooltipTrigger asChild>
              <span role="img" aria-label={p.nombre} className="rounded-full">
                <Avatar className="ring-background size-7 ring-2 hover:z-10">
                  {p.avatar && <AvatarImage src={p.avatar} alt="" />}
                  <AvatarFallback aria-hidden="true">{iniciales(p.nombre)}</AvatarFallback>
                </Avatar>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{p.nombre}</p>
              {p.login && <p className="opacity-70">@{p.login}</p>}
            </TooltipContent>
          </Tooltip>
        ))}
        {resto > 0 && <span className="bg-secondary text-muted-foreground ring-background grid size-7 place-items-center rounded-full text-[12px] font-semibold ring-2">+{resto}</span>}
      </div>
    </TooltipProvider>
  );
}

/** Los colores con significado (app.css): cada estado, siempre el mismo en todas las vistas. */
export type Tono = "hacer" | "revisar" | "paso" | "murio";

/** Una pastilla. Sin tono es neutra; con tono, el texto y el fondo del color de ese estado. */
export function Chip({ children, tono, className }: { children: React.ReactNode; tono?: Tono; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        tono ? "con-tono" : "bg-secondary text-muted-foreground",
        className,
      )}
      style={tono ? conTono(`var(--${tono})`) : undefined}
    >
      {children}
    </span>
  );
}

/**
 * El estado de una rama en una palabra, y solo cuando no es el de siempre: «al día» no dice nada.
 * Mergeada (o su PR) es lo que ya salió bien; con commits por integrar (o un PR abierto), lo que te
 * espera para revisar; la actual y un PR cerrado sin merge, neutros.
 */
export function EstadoDeRama({ rama }: { rama: Rama }) {
  if (rama.pr) {
    const tono: Tono | undefined = rama.pr.estado === "merged" ? "paso" : rama.pr.estado === "open" ? "revisar" : undefined;
    return (
      <a href={rama.pr.url} target="_blank" rel="noreferrer" className="relative z-10 inline-flex rounded-full" title={`Abrir el PR #${rama.pr.numero} en GitHub`}>
        <Chip tono={tono}>
          {rama.pr.estado === "merged" ? <GitMerge aria-hidden="true" className="size-3" /> : <GitPullRequest aria-hidden="true" className="size-3" />}
          PR #{rama.pr.numero}
          {rama.pr.estado === "merged" ? " mergeado" : rama.pr.estado === "closed" ? " cerrado" : ""}
          <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
        </Chip>
      </a>
    );
  }
  if (rama.actual) return <Chip>Actual</Chip>;
  if (rama.mergeada) return <Chip tono="paso">Mergeada</Chip>;
  if (rama.adelante > 0) return <Chip tono="revisar">Por integrar</Chip>;
  return null;
}

/** Un segmento de una tira: el elegido sube a `bg-background`, el resto queda apagado. */
export const segmento = (elegido: boolean) =>
  cn(
    "presionable flex-none cursor-pointer rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap",
    elegido ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
  );

/** Una tira de botones que, si no entra, se desliza de costado: sin barra, y el borde se desvanece mientras queda algo a la derecha. */
export function Tira({ children, className }: { children: React.ReactNode; className?: string }) {
  const tira = useRef<HTMLDivElement>(null);
  const [masADerecha, setMasADerecha] = useState(false);
  const medir = useCallback(() => {
    const t = tira.current;
    if (t) setMasADerecha(t.scrollLeft + t.clientWidth < t.scrollWidth - 1);
  }, []);
  useEffect(() => {
    const t = tira.current;
    if (!t) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(t);
    return () => observador.disconnect();
  }, [medir, children]);
  return (
    <div
      ref={tira}
      role="group"
      aria-label="Filtro"
      onScroll={medir}
      className={cn(
        "bg-secondary sin-barra flex min-w-0 overflow-x-auto rounded-full p-0.5",
        masADerecha && "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** «↑3 ↓1»: lo que tiene la rama y la base no, y al revés. */
export function Distancia({ rama }: { rama: Rama }) {
  if (rama.adelante === 0 && rama.atras === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums" title={`${rama.adelante} commits que la base no tiene, ${rama.atras} de la base que esta rama no tiene`}>
      <span className={rama.adelante ? "text-foreground" : "text-muted-foreground"}>↑{rama.adelante}</span>{" "}
      <span className="text-muted-foreground">↓{rama.atras}</span>
    </span>
  );
}
