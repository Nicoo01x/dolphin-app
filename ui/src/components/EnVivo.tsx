import { useEffect, useMemo, useState } from "react";
import type { Turno } from "@/lib/tipos";
import { reloj, tituloDeTarea } from "@/lib/datos";
import { PedidoEntero } from "@/components/PedidoEntero";
import { cosechaDeVivo, fasesDe, haciendoDe, resumenDeVivo, type Vivo } from "@/lib/vivo";
import { Barra, type Vista } from "./Barra";
import { Turnos } from "./Turnos";
import { Ramas } from "./Ramas";
import { Detalle } from "./Detalle";

/**
 * La siembra EN CURSO: la misma consola, con la lista de ramas llenándose en
 * tiempo real. Dolphin dirigiendo: cada intento escribe, pasa al testing
 * fase por fase, y lo que se corta se apaga ahí mismo.
 */
export function EnVivo({
  vivo,
  turnos,
  repo,
  elegido,
  alElegir,
  alRefrescar,
  alCambiarVista,
  alAbrirTurno,
  desconectado = false,
}: {
  vivo: Vivo;
  turnos: readonly Turno[];
  repo: string;
  elegido: string | null;
  alElegir: (id: string) => void;
  alRefrescar: () => void;
  alCambiarVista?: (vista: Vista) => void;
  /** Tocar otra tarea de la lista: mirarla sin cortar la siembra. */
  alAbrirTurno?: (id: string) => void;
  /** Se cortó la conexión: el vivo se congela, y se tiene que decir. */
  desconectado?: boolean;
}) {
  // El reloj corre solo: un vivo quieto parece colgado.
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const cosecha = useMemo(() => cosechaDeVivo(vivo), [vivo]);
  const fases = useMemo(() => fasesDe(vivo), [vivo]);
  const haciendo = useMemo(() => haciendoDe(vivo), [vivo]);

  // La última columna, EN VIVO: qué está haciendo cada universo y hace
  // cuánto. Es lo que mata el «0 archivos +0 −0» de relleno.
  const colaVivo = useMemo(() => {
    void tic;
    const ahora = Date.now();
    const cola: Record<string, string> = {};
    for (const x of vivo.intentos) {
      if (!x.vivo) continue; // el cortado muestra su motivo, como siempre
      if (x.haciendo === "escribe") cola[x.id] = `escribiendo · ${reloj(Math.max(ahora - x.cambio, 0))}`;
      else if (x.haciendo && x.haciendo !== "espera")
        cola[x.id] = `${x.haciendo} · ${reloj(Math.max(ahora - x.cambio, 0))}`;
      else if (x.forma)
        cola[x.id] =
          `${x.forma.archivos} ${x.forma.archivos === 1 ? "archivo" : "archivos"} · +${x.forma.agregadas} −${x.forma.quitadas}`;
      else cola[x.id] = "esperando";
    }
    return cola;
  }, [vivo, tic]);

  const intento = vivo.intentos.find((x) => x.id === elegido) ?? vivo.intentos[0] ?? null;
  const candidato = cosecha.candidatos.find((c) => c.universo.id === intento?.id) ?? null;

  const estadoTexto = !intento
    ? ""
    : intento.haciendo === "escribe"
      ? "escribiendo…"
      : intento.haciendo === "espera"
        ? "esperando la próxima fase"
        : intento.haciendo
          ? `en ${intento.haciendo}`
          : intento.vivo
            ? "esperando"
            : `se cortó en ${intento.murioEn ?? "el testing"}`;

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-[880px]:block max-[880px]:h-auto max-[880px]:min-h-dvh">
      <Barra
        repo={repo}
        alRefrescar={alRefrescar}
        vista="cosecha"
        {...(alCambiarVista ? { alCambiarVista } : {})}
        nadando
        desconectado={desconectado}
      />

      <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_340px] max-[1280px]:grid-cols-[224px_minmax(0,1fr)] max-[1280px]:grid-rows-[minmax(0,1fr)_auto] max-[880px]:block">
        <div className="min-h-0 max-[1280px]:row-start-1">
          <Turnos turnos={turnos} turnoId={null} alElegir={alAbrirTurno ?? (() => {})} />
        </div>

        <main className="flex min-h-0 flex-col overflow-auto max-[1280px]:row-start-1">
          <header className="flex-none px-5 pt-5 pb-4">
            <p className="text-corriendo mb-2 flex items-center gap-2 text-[12px] font-medium">
              <span aria-hidden="true" className="bg-corriendo animate-pulso-vivo size-1.5 rounded-full" />
              sembrando ahora
            </p>
            <h1 className="titulo-vista line-clamp-2 max-w-[48ch] break-words">
              {tituloDeTarea(vivo.tarea) || "…"}
            </h1>
            <PedidoEntero key={vivo.desde} tarea={vivo.tarea} />
            <p className="text-muted-foreground mt-2 text-[13px] tabular-nums">
              {/* Solo lo que cambia de verdad se anuncia: con el reloj adentro, el lector lo decía cada segundo. */}
              <span role="status">
                {resumenDeVivo(vivo)}
                <span className="text-muted-foreground/50 mx-2">·</span>
                {vivo.intentos.length} de {vivo.universos} ramas
              </span>
              <span className="text-muted-foreground/50 mx-2">·</span>
              {reloj(Date.now() - vivo.desde)}
            </p>
          </header>

          <div className="flex-none overflow-x-auto px-5 pb-4">
            {vivo.intentos.length === 0 ? (
              <p className="text-muted-foreground py-4 text-[13px]">Abriendo las ramas…</p>
            ) : (
              <Ramas
                cosecha={cosecha}
                elegido={intento?.id ?? null}
                alElegir={alElegir}
                fases={fases}
                haciendo={haciendo}
                colaVivo={colaVivo}
              />
            )}
          </div>

          <div className="flex-1" aria-hidden="true" />
        </main>

        <div className="min-h-0 max-[1280px]:col-span-full max-[1280px]:row-start-2 max-[1280px]:max-h-[42vh] max-[1280px]:overflow-auto max-[1280px]:bg-card/50">
          <Detalle
            cosecha={cosecha}
            candidato={candidato}
            conWorktree={new Set<string>()}
            alCopiarRuta={async () => false}
            estadoTexto={estadoTexto}
            enVivo
            escalones={fases}
            {...(intento && haciendo[intento.id] ? { corriendo: haciendo[intento.id] } : {})}
          />
        </div>
      </div>
    </div>
  );
}
