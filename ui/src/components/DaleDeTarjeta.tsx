import { useCallback, useEffect, useRef, useState } from "react";
import { darDale, pensarTarjeta, type EstimacionDelPlan, type Plan, type Tarjeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Aviso } from "./Pagina";
import { dolares, PlanEditable } from "./PlanEditable";
import { Visor } from "./Visor";

/**
 * El «dale» de una tarjeta (ver docs/idea.md): al soltarla en Haciendo, el líder la parte en tareas y
 * dice cuánto va a costar con lo que costó de verdad en este repo. Se puede corregir el plan antes de
 * arrancar; «Que lo haga el equipo» lo arranca y la tarjeta se mueve sola. Si la vas a hacer vos, «La
 * hago yo» la pasa a Haciendo sin gastar nada.
 *
 * Es una ventana: se cierra arrastrándola, con la física de /nico-mockup (la del Visor).
 */

/** Con quién trabaja el equipo. La demo de la consola lo cambia por el de mentira del lado del servidor. */
const AGENTE = "claude" as const;

type Estado =
  | { que: "pensando" }
  | { que: "error"; porQue: string }
  | { que: "plan"; plan: Plan; estimacion: EstimacionDelPlan; suscripcion: boolean };

export function DaleDeTarjeta({
  tarjeta: t,
  quienAbrio,
  alArrancar,
  alHacerloYo,
  alCerrado,
}: {
  tarjeta: Tarjeta;
  quienAbrio: HTMLElement | null;
  /** El equipo arrancó: la tarjeta ya está en Haciendo. */
  alArrancar: (t: Tarjeta) => void;
  alHacerloYo: () => Promise<void>;
  alCerrado: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ que: "pensando" });
  const [enviando, setEnviando] = useState(false);
  const [porQue, setPorQue] = useState<string | undefined>();
  const adentro = useRef<HTMLDivElement>(null);
  // Cerrar con la misma animación que la × (el Visor escucha `data-cerrar`).
  const cerrar = () => adentro.current?.closest("[role=dialog]")?.querySelector<HTMLElement>("[data-cerrar]")?.click();

  const pensar = useCallback(() => {
    setEstado({ que: "pensando" });
    pensarTarjeta(t.id, AGENTE).then(
      (r) => setEstado({ que: "plan", plan: r.plan, estimacion: r.estimacion, suscripcion: r.suscripcion === true }),
      (e: unknown) => setEstado({ que: "error", porQue: e instanceof Error ? e.message : String(e) }),
    );
  }, [t.id]);
  useEffect(pensar, [pensar]);

  const dale = async (plan: Plan) => {
    setEnviando(true);
    setPorQue(undefined);
    try {
      alArrancar(await darDale(t.id, plan, AGENTE));
      cerrar();
    } catch (e) {
      setPorQue(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  };
  const hacerloYo = async () => {
    setEnviando(true);
    try {
      await alHacerloYo();
      cerrar();
    } catch (e) {
      setPorQue(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  };

  const laHagoYo = (
    <Button variant="ghost" size="lg" onClick={() => void hacerloYo()} disabled={enviando}>
      La hago yo
    </Button>
  );

  return (
    <Visor quienAbrio={quienAbrio} titulo={t.titulo} sub="Así la parte el líder. Corregilo antes de arrancar." onCerrado={alCerrado} ancho={680} variante="formulario">
      <div ref={adentro}>
        {estado.que === "pensando" && (
          <div role="status" aria-busy="true" className="flex flex-col gap-2">
            <p className="text-muted-foreground text-[13px]">El líder lee el repo y la parte en tareas. No escribe nada todavía.</p>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
            <footer className="mt-2 flex justify-start">{laHagoYo}</footer>
          </div>
        )}
        {estado.que === "error" && (
          <div className="flex flex-col gap-3">
            <Aviso alReintentar={pensar}>No pude pensar el plan: {estado.porQue}</Aviso>
            <footer className="flex justify-start">{laHagoYo}</footer>
          </div>
        )}
        {estado.que === "plan" && (
          <>
            {!estado.suscripcion && (
              <p className="text-muted-foreground mb-3 text-[13px]">
                Lo esperable: <span className="text-foreground font-medium tabular-nums">{dolares(estado.estimacion.estimado)}</span>
                {estado.estimacion.conHistorial > 0
                  ? `, con lo que costaron ${estado.estimacion.conHistorial === 1 ? "una tarea parecida" : `${estado.estimacion.conHistorial} tareas parecidas`} en este repo.`
                  : ". Todavía no hay historial en este repo: el número es el tope de cada tarea."}
              </p>
            )}
            <PlanEditable
              plan={estado.plan}
              conClaude
              suscripcion={estado.suscripcion}
              enviando={enviando}
              {...(porQue ? { porQue } : {})}
              alCambiar={(plan) => setEstado({ ...estado, plan })}
              alAprobar={() => void dale(estado.plan)}
              alDescartar={cerrar}
              enVentana
              rotuloAprobar="Que lo haga el equipo"
              rotuloEnviando="Arrancando…"
              rotuloDescartar="Ahora no"
              otraSalida={laHagoYo}
            />
          </>
        )}
      </div>
    </Visor>
  );
}
