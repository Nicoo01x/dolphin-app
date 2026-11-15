import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Turno } from "@/lib/tipos";
import { plataDe, tituloDeTarea } from "@/lib/datos";
import {
  horaCorta,
  momentoDe,
  resultadoDe,
  resumenDe,
  seccionesDe,
  type Entrada,
  type TituloDeSeccion,
} from "@/lib/secciones";
import { cn } from "@/lib/utils";

/**
 * La barra lateral: las tareas por sección —hoy, ayer, la semana—, cada
 * una UNA vez aunque se haya sembrado varias; sus corridas se abren
 * adentro cuando la tarea está elegida. En angosto se pliega detrás de
 * un botón con la tarea que estás mirando.
 */
export function Turnos({
  turnos,
  turnoId,
  alElegir,
}: {
  turnos: readonly Turno[];
  turnoId: string | null;
  alElegir: (id: string) => void;
}) {
  const secciones = useMemo(() => seccionesDe(turnos), [turnos]);
  const [abierta, setAbierta] = useState(false);
  const actual = turnos.find((t) => t.id === turnoId);

  const elegir = (id: string) => {
    setAbierta(false);
    alElegir(id);
  };

  return (
    <aside
      aria-label="Tareas"
      className="bg-card/50 flex h-full min-h-0 flex-col max-[880px]:h-auto"
    >
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls="lista-de-tareas"
        onClick={() => setAbierta((v) => !v)}
        className="hover:bg-secondary/60 hidden min-h-11 w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left transition-colors duration-150 max-[880px]:flex"
      >
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[12px]">Tareas</span>
          <span className="block truncate text-[13px] font-medium" title={actual?.tarea}>
            {actual ? tituloDeTarea(actual.tarea) : "Tareas anteriores"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("text-muted-foreground size-4 flex-none transition-transform duration-150", abierta && "rotate-180")}
        />
      </button>

      <nav
        id="lista-de-tareas"
        aria-label="Tareas por fecha"
        className={cn(
          "min-h-0 flex-1 overflow-auto px-2 pt-2 pb-3 max-[880px]:max-h-[60vh]",
          !abierta && "max-[880px]:hidden",
        )}
      >
        {secciones.length === 0 ? (
          <p className="text-muted-foreground px-2.5 py-4 text-[13px]">Todavía no hay tareas.</p>
        ) : (
          secciones.map((seccion, i) => (
            <section key={seccion.titulo} aria-labelledby={`seccion-${i}`} className="mt-4 first:mt-1">
              <h2 id={`seccion-${i}`} className="text-muted-foreground px-2.5 pb-1 text-xs font-medium">
                {seccion.titulo}
              </h2>
              <ul className="space-y-px">
                {seccion.entradas.map((entrada) => (
                  <Fila
                    key={entrada.corridas[0]!.id}
                    entrada={entrada}
                    seccion={seccion.titulo}
                    turnoId={turnoId}
                    alElegir={elegir}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>
    </aside>
  );
}

function Fila({
  entrada,
  seccion,
  turnoId,
  alElegir,
}: {
  entrada: Entrada;
  seccion: TituloDeSeccion;
  turnoId: string | null;
  alElegir: (id: string) => void;
}) {
  const nueva = entrada.corridas[0]!;
  const elegida = entrada.corridas.some((t) => t.id === turnoId);
  const veces = entrada.corridas.length;

  return (
    <li>
      <button
        type="button"
        aria-current={nueva.id === turnoId ? "true" : undefined}
        onClick={() => alElegir(nueva.id)}
        title={entrada.tarea}
        className={cn(
          "hover:bg-secondary/60 flex w-full cursor-pointer items-start gap-2.5 rounded-2xl px-2.5 py-2 text-left transition-colors duration-150",
          elegida && "bg-secondary",
        )}
      >
        <Punto turno={nueva} />
        {/* El título se lleva todo el ancho: la hora va abajo, con el resultado. */}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              title={entrada.tarea}
              className={cn("min-w-0 truncate text-[13px]", elegida ? "text-foreground font-medium" : "text-foreground/80")}
            >
              {tituloDeTarea(entrada.tarea)}
            </span>
            {veces > 1 && <span className="text-muted-foreground flex-none text-[12px]">· {veces} veces</span>}
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[12px] tabular-nums">
            <span className="min-w-0 flex-1 truncate">{lineaDe(nueva)}</span>
            <span className="text-muted-foreground flex-none">{horaCorta(nueva.cuando, seccion)}</span>
          </span>
        </span>
      </button>

      {/* Las corridas de la tarea, solo cuando está elegida: el resto del
          tiempo una tarea ocupa una fila, se haya sembrado las veces que sea. */}
      {elegida && veces > 1 && (
        <ul aria-label={`Corridas de «${entrada.tarea}»`} className="mt-px mb-1 space-y-px pl-6">
          {entrada.corridas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === turnoId ? "true" : undefined}
                onClick={() => alElegir(t.id)}
                className={cn(
                  "hover:bg-secondary/60 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[12px] tabular-nums transition-colors duration-150",
                  t.id === turnoId ? "bg-secondary/70 text-foreground" : "text-muted-foreground",
                )}
              >
                <Punto turno={t} chico />
                <span className="min-w-0 flex-1 truncate">{lineaDe(t)}</span>
                <span className="flex-none">{momentoDe(t.cuando)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Lo que dice cada corrida: el resultado y —solo si se pagó por uso— la plata.
 *  La duración vive en la cabecera de la tarea: acá sería ruido. */
function lineaDe(t: Turno): string {
  const partes = [resumenDe(t)];
  if (!t.suscripcion && (t.gastado > 0 || t.costoDesconocido)) partes.push(plataDe(t.gastado, t.costoDesconocido));
  return partes.join(" · ");
}

/** El estado en un punto: verde si alguna rama pasó, rojo si no. Señala, no grita. */
function Punto({ turno, chico = false }: { turno: Turno; chico?: boolean }) {
  const paso = resultadoDe(turno) === "paso";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex-none rounded-full",
        chico ? "size-1.5" : "mt-[7px] size-1.5",
        paso ? "bg-paso" : "bg-murio/80",
      )}
    />
  );
}
