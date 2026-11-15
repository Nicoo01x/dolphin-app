import type { Candidato } from "@/lib/tipos";
import { DICE_DE_FASE, portonDe, reloj, type Escalon, type EstadoDeFase } from "@/lib/datos";
import { cn } from "@/lib/utils";

const ESTILO: Record<EstadoDeFase, string> = {
  paso: "bg-paso/15 text-paso",
  corto: "bg-murio/15 text-murio",
  // No corrió: hueco, ni verde ni rojo.
  salteada: "text-muted-foreground border border-dashed border-muted-foreground/60",
  nollego: "celda-rayada text-muted-foreground/80",
  corriendo: "celda-corriendo text-foreground",
};

/**
 * El portón de una rama, dibujado: cada fase es un segmento con su nombre y
 * lo que tardó, en el orden en que corrieron y separadas por lo que cuestan
 * —lo gratis, lo barato, lo caro—. Verde si pasó, rojo si cortó, ámbar mientras corre, hueco si no
 * corrió. Abajo, solo lo que hay que leer: por qué cortó, por qué no corrió
 * o qué rebotó antes de pasar.
 */
export function Porton({
  c,
  escalones,
  corriendo,
  className,
}: {
  c: Candidato;
  escalones: Escalon[];
  corriendo?: string;
  className?: string;
}) {
  const grupos = portonDe(c, escalones, corriendo);
  if (grupos.length === 0) return null;
  const notas = grupos.flat().filter((f) => f.estado === "corto" || f.estado === "salteada" || f.rebote);

  return (
    <div className={className}>
      <ol aria-label="El portón, fase por fase" className="flex flex-wrap items-center gap-y-1.5">
        {grupos.flatMap((grupo, g) =>
          grupo.map((f, i) => (
            <li
              key={f.nombre}
              title={f.dijo || undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium whitespace-nowrap tabular-nums",
                // Entre fases, un respiro; entre lo gratis y lo que se paga, uno más grande.
                i > 0 ? "ml-0.5" : g > 0 ? "ml-2" : "",
                ESTILO[f.estado],
              )}
            >
              <span>{f.nombre}</span>
              {f.ms > 0 && <span>{reloj(f.ms)}</span>}
              {f.vueltas > 1 && <span className="opacity-80">×{f.vueltas}</span>}
              <span className="sr-only">, {DICE_DE_FASE[f.estado]}</span>
            </li>
          )),
        )}
      </ol>
      {notas.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px] leading-snug">
          {notas.map((f) => (
            <li key={f.nombre} className="text-muted-foreground break-words">
              <b className={cn("font-semibold", f.estado === "corto" ? "text-murio" : "text-foreground/80")}>
                {f.nombre}
              </b>{" "}
              {f.rebote ? `rebotó (${f.rebote}) y se corrigió` : f.dijo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
