import { Maximize2 } from "lucide-react";
import { BotonCopiar } from "./BotonCopiar";
import type { RespuestaDiff } from "@/lib/tipos";
import { LineasDiff } from "./Diff";
import { Button } from "@/components/ui/button";
import { Aviso } from "./Pagina";

export type EstadoCodigo =
  | { que: "nada" }
  | { que: "leyendo" }
  | { que: "sin-worktree"; id: string }
  | { que: "error"; motivo: string }
  | { que: "diff"; diff: RespuestaDiff };

/**
 * El código del universo elegido, acá mismo y sin abrir nada: es lo que
 * una persona viene a ver. «En grande» lo pasa al visor arrastrable.
 */
export function Codigo({
  estado,
  alCopiar,
  alAgrandar,
}: {
  estado: EstadoCodigo;
  alCopiar: () => Promise<boolean>;
  alAgrandar: (trigger: HTMLElement) => void;
}) {
  const diff = estado.que === "diff" ? estado.diff : null;
  const hay = Boolean(diff?.hay && diff.texto);

  return (
    // Nunca menos de ~18 renglones: con pocas ramas llena el resto, con
    // muchas queda abajo con su altura y la columna scrollea hasta él.
    <section aria-label="Lo que escribió" className="bg-background flex flex-1 flex-col lg:min-h-[min(420px,60dvh)]">
      {/* En angosto, los botones bajan juntos a su renglón: el título no se parte. */}
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 pb-2.5">
        <h2 className="titulo-seccion whitespace-nowrap">Lo que escribió</h2>
        <span className="text-muted-foreground text-[12px] whitespace-nowrap tabular-nums">
          {hay && diff
            ? `${diff.lineas} ${diff.lineas === 1 ? "línea" : "líneas"}${diff.recortado ? " · se muestran las primeras 1200" : ""}`
            : estado.que === "leyendo"
              ? "leyendo el worktree…"
              : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <BotonCopiar alCopiar={alCopiar} rotulo="Copiar" disabled={!hay} chico />
          <Button variant="secondary" data-agrandar disabled={!hay} onClick={(ev) => alAgrandar(ev.currentTarget)}>
            <Maximize2 aria-hidden="true" className="size-3.5" />
            <span>En grande</span>
          </Button>
        </div>
      </header>

      <div
        data-desplazable
        aria-label="El diff"
        className="min-h-0 flex-1 overflow-auto px-5 pb-5 font-mono text-xs leading-relaxed max-[880px]:max-h-[60vh]"
        tabIndex={0}
      >
        {estado.que === "nada" && <Nada>Elegí una rama.</Nada>}
        {estado.que === "leyendo" && <Nada>Leyendo el diff…</Nada>}
        {estado.que === "sin-worktree" && (
          <Nada>
            El worktree de <b className="text-foreground/80 font-semibold">{estado.id}</b> ya se limpió: solo queda en
            disco la rama elegida. Para mirar todas, la próxima vez prendé «Guardar el código de todas las ramas» en
            Nueva (o sembrá con{" "}
            <code className="bg-secondary text-foreground/80 rounded-xl px-1.5 py-0.5">--sucio</code>).
          </Nada>
        )}
        {estado.que === "error" && <Aviso className="font-sans">No pude leer el diff: {estado.motivo}</Aviso>}
        {diff && !diff.hay && <Nada>{diff.porQue ?? "Esta rama no tiene cambios para mostrar."}</Nada>}
        {hay && diff?.texto && (
          <>
            <LineasDiff texto={diff.texto} />
            {diff.recortado && (
              <p className="text-muted-foreground mt-3 font-sans text-[12px]">
                El diff sigue. Abrí el worktree para verlo entero.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const Nada = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground max-w-[60ch] py-1.5 font-sans text-[13px]">{children}</p>
);
