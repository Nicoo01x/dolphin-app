import { useMemo, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Plan, TareaDelPlan } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Leible } from "./Leible";
import { Aviso } from "./Pagina";

/**
 * El plan de Thinking antes de gastar nada: cada tarea con su título, su
 * pedido, el escalón de modelo y su tope en dólares, todo editable, y el
 * total arriba. Aprobar es lo único que encola; descartar no deja rastro.
 */

const ESCALONES = [
  { valor: "barato", rotulo: "Barato", modelo: "haiku" },
  { valor: "medio", rotulo: "Medio", modelo: "sonnet" },
  { valor: "caro", rotulo: "Caro", modelo: "opus" },
] as const;

/** «US$ 0,60» con coma, como se escribe acá. */
export function dolares(monto: number): string {
  return `US$ ${monto.toFixed(2).replace(".", ",")}`;
}

export function PlanEditable({
  plan,
  conClaude,
  suscripcion = false,
  enviando,
  porQue,
  alCambiar,
  alAprobar,
  alDescartar,
  enVentana = false,
  rotuloAprobar = "Aprobar y correr",
  rotuloEnviando = "Encolando…",
  rotuloDescartar = "Descartar",
  otraSalida,
}: {
  plan: Plan;
  /** Con Claude el escalón elige el modelo; con otro motor escribe el suyo. */
  conClaude: boolean;
  /** Con suscripción no se paga por uso: no se muestra ni un monto, ni el tope en dólares. */
  suscripcion?: boolean;
  enviando: boolean;
  /** Por qué no se pudo aprobar, si pasó. */
  porQue?: string;
  alCambiar: (plan: Plan) => void;
  alAprobar: () => void;
  alDescartar: () => void;
  /** Adentro de una ventana (el «dale» de una tarjeta): sin su propia tarjeta alrededor ni su título. */
  enVentana?: boolean;
  rotuloAprobar?: string;
  rotuloEnviando?: string;
  rotuloDescartar?: string;
  /** Un camino más, a la izquierda del pie: «La hago yo» en una tarjeta. */
  otraSalida?: ReactNode;
}) {
  const total = useMemo(() => plan.tareas.reduce((suma, t) => suma + t.presupuesto, 0), [plan.tareas]);
  const ids = new Set(plan.tareas.map((t) => t.id));

  const cambiar = (id: string, cambio: Partial<TareaDelPlan>) =>
    alCambiar({ ...plan, tareas: plan.tareas.map((t) => (t.id === id ? { ...t, ...cambio } : t)) });
  // Si se saca una tarea de la que otra dependía, la otra pasa a no depender de nadie (el servidor hace lo mismo).
  const sacar = (id: string) =>
    alCambiar({
      ...plan,
      tareas: plan.tareas.filter((t) => t.id !== id).map((t) => (t.dependeDe === id ? { ...t, dependeDe: undefined } : t)),
    });

  return (
    <section aria-label="El plan" className={cn("w-full", !enVentana && "bg-card mt-6 rounded-3xl p-4 shadow-[var(--vidrio-sombra)]")}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {!enVentana && <h2 className="titulo-seccion">El plan</h2>}
        <p className="text-muted-foreground text-[12px] tabular-nums">
          {plan.tareas.length} {plan.tareas.length === 1 ? "tarea" : "tareas"}
          {!suscripcion && ` · hasta ${dolares(total)}`}
          {!suscripcion && plan.costoDelPlan > 0 && ` · pensarlo costó ${dolares(plan.costoDelPlan)}`}
        </p>
      </header>
      {plan.resumen && <p className="text-muted-foreground mt-1 text-[13px]"><Leible texto={plan.resumen} /></p>}

      <ol className="mt-4 space-y-2">
        {plan.tareas.map((t, i) => {
          const previa = t.dependeDe && ids.has(t.dependeDe) ? plan.tareas.findIndex((x) => x.id === t.dependeDe) + 1 : 0;
          return (
            <li key={t.id} className="ficha rounded-2xl p-3">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5 w-4 flex-none text-[12px] tabular-nums" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    value={t.titulo}
                    onChange={(ev) => cambiar(t.id, { titulo: ev.target.value })}
                    aria-label={`Título de la tarea ${i + 1}`}
                    maxLength={80}
                    className="-mx-1 w-full rounded-xl bg-transparent px-1 text-[13px] font-semibold"
                  />
                  <textarea
                    value={t.tarea}
                    onChange={(ev) => cambiar(t.id, { tarea: ev.target.value })}
                    aria-label={`Pedido de la tarea ${i + 1}`}
                    rows={2}
                    maxLength={2000}
                    // Crece con el pedido: el texto entero a la vista, sin una barra de scroll adentro de cada tarea.
                    className="text-muted-foreground -mx-1 mt-1 w-full resize-none rounded-xl bg-transparent px-1 text-[13px] leading-relaxed [field-sizing:content]"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <div role="group" aria-label={`Modelo de la tarea ${i + 1}`} className="bg-background flex rounded-full p-0.5">
                      {ESCALONES.map((e) => (
                        <Button
                          key={e.valor}
                          variant="ghost"
                          size="sm"
                          aria-pressed={t.escalon === e.valor}
                          onClick={() => cambiar(t.id, { escalon: e.valor })}
                          title={conClaude ? `Escribe ${e.modelo}` : "Con este motor escribe su modelo de siempre"}
                          className={cn(
                            "gap-1",
                            t.escalon === e.valor ? "bg-secondary text-foreground hover:bg-secondary" : "hover:text-foreground hover:bg-transparent",
                          )}
                        >
                          {e.rotulo}
                          {/* En el teléfono no entra con el modelo al lado: queda en el title. */}
                          {conClaude && <span className="text-muted-foreground font-normal max-[480px]:hidden">{e.modelo}</span>}
                        </Button>
                      ))}
                    </div>
                    {!suscripcion && (
                    <label className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">tope US$</span>
                      <input
                        type="number"
                        min={0.05}
                        max={5}
                        step={0.05}
                        value={t.presupuesto}
                        onChange={(ev) => cambiar(t.id, { presupuesto: Number(ev.target.value) || 0 })}
                        className="bg-background h-7 w-16 rounded-full px-2.5 tabular-nums"
                      />
                    </label>
                    )}
                    {previa > 0 && <span className="text-muted-foreground">después de la {previa}, encima de su rama</span>}
                  </div>
                  {t.porQue && <p className="text-muted-foreground/80 mt-1.5 text-[12px]"><Leible texto={t.porQue} /></p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sacar(t.id)}
                  aria-label={`Sacar la tarea ${i + 1} del plan`}
                  className="hover:bg-background"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {!conClaude && !suscripcion && (
        <p className="text-muted-foreground mt-3 text-[12px]">
          Este motor no informa cuánto cuesta lo que escribe: el tope cuenta solo lo que se sabe, como la revisión.
        </p>
      )}
      {porQue && <Aviso className="mt-3">{porQue}</Aviso>}
      <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {otraSalida && <div className="mr-auto">{otraSalida}</div>}
        <Button variant="ghost" size="lg" onClick={alDescartar} disabled={enviando}>
          {rotuloDescartar}
        </Button>
        <Button size="lg" onClick={alAprobar} disabled={enviando || plan.tareas.length === 0}>
          {enviando ? rotuloEnviando : suscripcion ? rotuloAprobar : `${rotuloAprobar} · hasta ${dolares(total)}`}
        </Button>
      </footer>
    </section>
  );
}
