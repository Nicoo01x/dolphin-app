import type { FaseDelPorton, InformeDeRendimiento, RendimientoDeModelo } from "@/lib/api";
import type { EstadoRendimiento } from "@/lib/use-rendimiento";
import { logoDeModelo, plata, reloj } from "@/lib/datos";
import { cn } from "@/lib/utils";
import { Gauge, ListChecks } from "lucide-react";
import { Shell, Vacio } from "./widgets";
import { Aviso } from "./Pagina";
import { Button } from "@/components/ui/button";

/**
 * Lo que el router consulta, a la vista (ver src/nucleo/rendimiento.ts):
 * cuánto pasa y cuánto cuesta cada modelo en cada tipo de tarea, y qué
 * decidiría con esas cifras la próxima siembra. Mismo molde que el resto
 * de En vivo; una tabla, porque son números para comparar en columna.
 */

export function WidgetRendimiento({
  estado,
  alElegirTipo,
  suscripcion = false,
}: {
  estado: EstadoRendimiento;
  alElegirTipo: (tipo: string) => void;
  /** Todo corrió con suscripción: la plata no se muestra. */
  suscripcion?: boolean;
}) {
  if (estado.que !== "listo") {
    return (
      <Shell titulo="Quién rinde">
        {estado.que === "cargando" ? (
          <p className="text-muted-foreground my-auto text-[13px]">Leyendo las cifras…</p>
        ) : (
          <Aviso className="my-auto">No pude leer las cifras: {estado.motivo}</Aviso>
        )}
      </Shell>
    );
  }
  const { informe } = estado;
  if (informe.tipos.length === 0) {
    return (
      <Shell titulo="Quién rinde">
        <Vacio icono={<Gauge />} titulo="Todavía no hay cifras">
          Cada rama que escribe un modelo deja una: con {informe.minimo} por modelo en un tipo de tarea, Dolphin elige quién
          escribe con ellas en vez de con la tabla.
        </Vacio>
      </Shell>
    );
  }

  return (
    <Shell titulo="Quién rinde" meta={<Tipos informe={informe} alElegir={alElegirTipo} />}>
      {/* Si en un widget angosto igual no entra, scrollea: cortado al pie no se lee. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[13px] whitespace-nowrap">
          <caption className="sr-only">
            Rendimiento por modelo en {informe.tipo ? nombreDe(informe) : "todas las tareas"}
          </caption>
          <thead>
            <tr className="text-muted-foreground text-left text-[12px]">
              <th scope="col" className="pr-3 pb-2 font-medium">
                modelo
              </th>
              <th scope="col" className="pr-3 pb-2 font-medium">
                pasan
              </th>
              {!suscripcion && (
                <th scope="col" className="pr-3 pb-2 text-right font-medium @max-[400px]:pr-0" title="Todo lo gastado sobre las ramas que pasaron">
                  por rama que pasa
                </th>
              )}
              <th scope="col" className="pb-2 text-right font-medium @max-[400px]:hidden">
                tarda
              </th>
            </tr>
          </thead>
          <tbody>
            {informe.modelos.slice(0, 5).map((m, i) => (
              // Angosto (el teléfono), los dos más medidos: el resto no entra sin cortar la conclusión.
              <FilaDeModelo key={m.modelo} m={m} minimo={informe.minimo} suscripcion={suscripcion} angostoOculta={i >= 2} />
            ))}
          </tbody>
        </table>
        <Decision informe={informe} />
      </div>
    </Shell>
  );
}

const nombreDe = (informe: InformeDeRendimiento) => informe.tipos.find((t) => t.tipo === informe.tipo)?.nombre ?? informe.tipo ?? "";

/** Los tipos de tarea con cifras, para elegir cuál mirar. */
function Tipos({ informe, alElegir }: { informe: InformeDeRendimiento; alElegir: (tipo: string) => void }) {
  const opciones = [...informe.tipos.slice(0, 3).map((t) => ({ tipo: t.tipo, nombre: t.nombre })), { tipo: "todos", nombre: "todo" }];
  const elegido = informe.tipo ?? "todos";
  return (
    <span role="group" aria-label="Tipo de tarea" className="flex flex-wrap gap-1">
      {opciones.map((o) => (
        <Button
          key={o.tipo}
          size="xs"
          variant={o.tipo === elegido ? "secondary" : "ghost"}
          aria-pressed={o.tipo === elegido}
          onClick={() => alElegir(o.tipo)}
        >
          {o.nombre}
        </Button>
      ))}
    </span>
  );
}

function FilaDeModelo({
  m,
  minimo,
  suscripcion,
  angostoOculta,
}: {
  m: RendimientoDeModelo;
  minimo: number;
  suscripcion: boolean;
  angostoOculta: boolean;
}) {
  const logo = logoDeModelo(m.modelo);
  const pocas = m.intentos < minimo;
  return (
    <tr className={cn(angostoOculta && "@max-[400px]:hidden")}>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-2">
          <img src={logo.src} alt="" className="size-3.5 flex-none" loading="lazy" />
          <span className="truncate font-medium">{m.modelo}</span>
        </span>
      </td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-2 tabular-nums" title={pocas ? `Pocas ramas para creerle: Dolphin pide ${minimo}.` : undefined}>
          <span aria-hidden="true" className="bg-foreground/10 relative block h-[3px] w-12 flex-none overflow-hidden rounded-full @max-[400px]:w-8">
            <span className="bg-paso absolute inset-y-0 left-0 rounded-full" style={{ width: `${m.tasa * 100}%` }} />
          </span>
          <span className={cn(pocas && "text-muted-foreground")}>
            {m.pasaron} de {m.intentos}
          </span>
        </span>
      </td>
      {!suscripcion && (
        <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums @max-[400px]:pr-0">
          {m.costoPorAcierto !== null ? (
            plata(m.costoPorAcierto)
          ) : m.pasaron === 0 ? (
            "ninguna pasó"
          ) : (
            <span title="Este motor no informa cuánto cuesta: no se lo compara por plata">sin dato</span>
          )}
        </td>
      )}
      <td className="text-muted-foreground py-2 text-right tabular-nums @max-[400px]:hidden">{reloj(m.msMedio)}</td>
    </tr>
  );
}

/** Qué haría el router con estas cifras en la próxima siembra de este tipo. */
function Decision({ informe }: { informe: InformeDeRendimiento }) {
  const r = informe.router;
  // Pegada a la tabla y no al pie: con dos modelos, al pie quedaba un hueco
  // que separaba la conclusión de los números de los que sale.
  if (!r) return null;
  const estrategia = r.estrategia === "economia" ? "economía" : r.estrategia;
  // Una sola oración: en un widget angosto, dos párrafos se cortaban al pie.
  const midiendo = r.explorar ? ` Para medirlo, 1 de cada 4 siembras de este tipo la escribe ${r.explorar}.` : "";
  let texto: string;
  if (r.fijado) {
    texto = `Quién escribe está fijado a mano en dolphin.config.json${r.escribe ? `: ${r.escribe}` : ""}. Las cifras se juntan igual, pero no mandan.`;
  } else if (r.porDatos) {
    texto = `${r.porDatos}${midiendo}`;
  } else {
    const faltan = r.faltan.map((f, i) => `${f.modelo} ${i === 0 ? "tiene " : ""}${f.tiene}`).join(", ");
    texto = `Dolphin elige quién escribe con ${informe.minimo} ramas por modelo${faltan ? ` y ${faltan}` : ""}: hasta entonces escribe ${r.escribe ?? "el de la tabla"}.${midiendo}`;
  }
  // La estrategia (calidad, equilibrada, economía) va en el title: es configuración, no la conclusión.
  return (
    <p title={`Estrategia: ${estrategia}`} className="text-foreground/85 mt-4 text-[12px] leading-snug whitespace-normal">
      {texto}
    </p>
  );
}

/**
 * El portón fase por fase: cuánto pasa en cada una y cuánto cuesta. Las
 * gratis van primero y cortan casi todo: es la promesa del producto, y
 * acá se ve si se cumple.
 */
export function WidgetFases({ estado, suscripcion = false }: { estado: EstadoRendimiento; suscripcion?: boolean }) {
  const informe = estado.que === "listo" ? estado.informe : null;
  const fases = informe?.fases ?? [];
  const meta = informe ? (informe.tipo ? `en ${nombreDe(informe)}` : "todas las tareas") : undefined;
  return (
    <Shell titulo="El portón, fase por fase" meta={meta}>
      {fases.length === 0 && estado.que === "listo" ? (
        <Vacio icono={<ListChecks />} titulo="Ninguna rama pasó por el portón todavía">
          Las fases gratis van primero: acá se ve cuánto cortan antes de gastar en la revisión con modelo.
        </Vacio>
      ) : estado.que === "error" ? (
        <Aviso className="my-auto">No pude leer las fases: {estado.motivo}</Aviso>
      ) : fases.length === 0 ? (
        <p className="text-muted-foreground my-auto text-[13px]">
          {estado.que === "cargando" ? "Leyendo las fases…" : "Ninguna rama pasó por el portón todavía."}
        </p>
      ) : (
        <dl className="my-auto space-y-2">
          {fases.slice(0, 4).map((f) => (
            <FilaDeFase key={f.fase} f={f} suscripcion={suscripcion} />
          ))}
          {fases.length > 4 && <p className="text-muted-foreground text-[12px]">y {fases.length - 4} fases más</p>}
        </dl>
      )}
    </Shell>
  );
}

function FilaDeFase({ f, suscripcion }: { f: FaseDelPorton; suscripcion: boolean }) {
  const tasa = f.pasaron / f.corridas;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <dt className="flex w-[38%] min-w-0 items-baseline gap-2">
        <span className="truncate font-medium" title={f.fase}>
          {f.fase}
        </span>
        <span className="text-muted-foreground flex-none text-[12px]">{f.costo}</span>
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className="bg-foreground/10 relative block h-[3px] flex-1 overflow-hidden rounded-full">
          <span className="bg-paso absolute inset-y-0 left-0 rounded-full" style={{ width: `${tasa * 100}%` }} />
        </span>
        <span className="text-muted-foreground flex-none tabular-nums">
          {/* Corridas, no ramas: una rama que se corrige pasa por la misma fase más de una vez. */}
          pasa {f.pasaron} de {f.corridas} {f.corridas === 1 ? "corrida" : "corridas"}
        </span>
        {!suscripcion && f.gastado > 0 && <span className="text-muted-foreground flex-none tabular-nums">· {plata(f.gastado)}</span>}
      </dd>
    </div>
  );
}
