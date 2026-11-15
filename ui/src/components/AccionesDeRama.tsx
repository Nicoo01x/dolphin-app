import { useState } from "react";
import { ExternalLink, GitMerge, GitPullRequest } from "lucide-react";
import type { Cosecha, EstadoDeRama } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Aviso, conTono } from "./Pagina";
import { Chip } from "./Ramas";

type Accion = "mergear" | "descartar" | "pr";

/**
 * La rama elegida, como en DOLPHIN: en qué estado está —se le pregunta a git—
 * y qué se puede hacer con ella. Mergear toca el repo de verdad; el
 * servidor no mergea con cambios sin commitear ni en otra rama, y si choca
 * no toca nada. Abrir un PR sube la rama y la deja en revisión, con la
 * evidencia del portón de descripción. Descartar se confirma en el lugar.
 *
 * Con la política «aprobar», el motivo se lee ANTES del clic y los botones
 * dicen lo que hacen: «Aprobar y mergear» es el visto bueno, no un trámite.
 */
export function AccionesDeRama({
  entregada,
  estado,
  alRama,
  sinProbar = false,
  puedePr = false,
  pr,
  pideAprobacion,
}: {
  entregada: NonNullable<Cosecha["entregada"]>;
  estado: EstadoDeRama;
  /** Devuelve el motivo si no se pudo, o null si salió. */
  alRama: (accion: Accion, aprobado?: boolean) => Promise<string | null>;
  /** No corrió ninguna fase: está lista, pero nadie la probó. */
  sinProbar?: boolean;
  /** Hay un remoto adonde subirla. */
  puedePr?: boolean;
  pr?: { readonly url: string };
  /** Por qué mergearla o abrirle un PR necesita tu visto bueno. */
  pideAprobacion?: string;
}) {
  const [ocupado, setOcupado] = useState<Accion | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destino = entregada.ramaBase ?? "tu rama";
  const abierta = estado === "probada" || estado === "en-revision";

  const hacer = async (accion: Accion) => {
    setOcupado(accion);
    setError(null);
    // Descartar nunca necesitó permiso; lo que la lleva a main, con la política, sí.
    const motivo = await alRama(accion, accion !== "descartar" && pideAprobacion !== undefined);
    setOcupado(null);
    setConfirmando(false);
    if (motivo) setError(motivo);
  };

  const rotulo =
    estado === "probada"
      ? sinProbar
        ? "sin probar, sin mergear"
        : "probada, sin mergear"
      : estado === "en-revision"
        ? "en revisión"
        : estado === "mergeada"
          ? `mergeada en ${destino}`
          : "descartada";

  // Mergeada es lo que terminó bien (verde); abierta y probada, o en revisión, te espera a vos
  // (turquesa); sin probar también, aunque esté lista. Descartada, gris: ya no es nada.
  const tono =
    estado === "descartada" ? undefined : estado === "mergeada" || (estado === "probada" && !sinProbar) ? "var(--paso)" : "var(--revisar)";

  return (
    // El título «La rama» ya lo pone el panel: acá van el estado y lo que se hace con ella.
    <section aria-label="Qué hacer con la rama" className="px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Chip {...(tono ? { tono } : {})}>
          {estado === "mergeada" && <GitMerge aria-hidden="true" className="size-3" />}
          {estado === "en-revision" && <GitPullRequest aria-hidden="true" className="size-3" />}
          {rotulo}
        </Chip>
        <code className="text-muted-foreground min-w-0 truncate font-mono text-[12px]" title={entregada.rama}>
          {entregada.rama}
        </code>
      </div>

      {pr && (
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-revisar mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden="true" className="size-3" />
          ver el PR
        </a>
      )}

      {abierta && !confirmando && pideAprobacion && (
        <p className="con-tono mt-3 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug" style={conTono("var(--revisar)")}>
          <span className="font-semibold">Necesita tu aprobación:</span>{" "}
          <span className="text-foreground">
            {pideAprobacion}. Puede ser lo que pedía la tarea; si no, se puso verde cambiando la prueba.
          </span>
        </p>
      )}

      {abierta && !confirmando && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="lg" disabled={ocupado !== null} onClick={() => void hacer("mergear")}>
            <GitMerge aria-hidden="true" />
            {ocupado === "mergear" ? "Mergeando…" : pideAprobacion ? `Aprobar y mergear a ${destino}` : `Mergear a ${destino}`}
          </Button>
          {estado === "probada" && puedePr && (
            <Button variant="secondary" size="lg" disabled={ocupado !== null} onClick={() => void hacer("pr")}>
              <GitPullRequest aria-hidden="true" />
              {ocupado === "pr" ? "Abriendo…" : pideAprobacion ? "Aprobar y abrir PR" : "Abrir PR"}
            </Button>
          )}
          <Button variant="ghost" size="lg" disabled={ocupado !== null} onClick={() => setConfirmando(true)}>
            Descartar
          </Button>
        </div>
      )}

      {confirmando && (
        <div className="bg-secondary/60 mt-3 rounded-2xl px-3.5 py-3">
          <p className="text-[13px] leading-snug">Se borran la rama y su carpeta. El commit queda en el reflog un tiempo, por las dudas.</p>
          <div className="mt-2.5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={ocupado !== null} onClick={() => void hacer("descartar")}>
              {ocupado === "descartar" ? "Descartando…" : "Sí, descartar"}
            </Button>
          </div>
        </div>
      )}

      {error && <Aviso className="mt-2">No se pudo: {error}.</Aviso>}
    </section>
  );
}
