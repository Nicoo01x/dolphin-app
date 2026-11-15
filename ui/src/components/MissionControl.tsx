import { useEffect, useMemo, useRef, useState } from "react";
import { Sprout } from "lucide-react";
import DraggableWidgetGrid, { type WidgetItem } from "@/components/ui/draggable-widget-grid";
import { MarDeSimbolos } from "./Mar";
import { DelfinDeSimbolos } from "./Delfin";
import { Cabecera, Pagina } from "./Pagina";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { Turno } from "@/lib/tipos";
import type { Vivo } from "@/lib/vivo";
import { medir } from "@/lib/metricas";
import { useCola } from "@/lib/use-cola";
import { useCalendario } from "@/lib/use-calendario";
import { mandarCalendario } from "@/lib/api";
import { useActividad } from "@/lib/use-actividad";
import { useRendimiento } from "@/lib/use-rendimiento";
import { useGuardian } from "@/lib/use-guardian";
import { WidgetActividad } from "./Actividad";
import { WidgetFases, WidgetRendimiento } from "./Rendimiento";
import {
  BotonNueva,
  WidgetAgenda,
  WidgetCola,
  WidgetCosto,
  WidgetGratis,
  WidgetGuardian,
  WidgetPrimera,
  WidgetSiembras,
  WidgetTasa,
  WidgetUltima,
  WidgetVelocidad,
  WidgetVivo,
} from "./widgets";

/**
 * Mission Control: la vista «En vivo» de dolphin (el hash sigue siendo #tablero).
 *
 * Widgets arrastrables con los números reales del repo — siembras,
 * costos, dónde se cortan los intentos, qué modelo escribe — y, cuando
 * hay una siembra en curso, su tarjeta en vivo primero. Un centro de
 * control de ingeniería, no un chatbot agrandado.
 */

type Clase =
  | "vivo"
  | "agenda"
  | "cola"
  | "guardian"
  | "ultima"
  | "actividad"
  | "siembras"
  | "tasa"
  | "costo"
  | "fases"
  | "rendimiento"
  | "velocidad"
  | "gratis"
  | "primera";

const CLAVE_ORDEN = "dolphin.tablero.orden";

function ordenGuardado(): string[] | null {
  try {
    const crudo = localStorage.getItem(CLAVE_ORDEN);
    return crudo ? (JSON.parse(crudo) as string[]) : null;
  } catch {
    return null;
  }
}

function guardarOrden(items: WidgetItem[]): void {
  try {
    localStorage.setItem(CLAVE_ORDEN, JSON.stringify(items.map((x) => x.id)));
  } catch {
    // Sin storage (ventana privada) el tablero vuelve al orden de fábrica.
  }
}

export function MissionControl({
  turnos,
  vivo,
  alAbrirCosecha,
  alCambiarCola,
  alNueva,
  alBandeja,
}: {
  turnos: readonly Turno[];
  vivo: Vivo | null;
  alAbrirCosecha: (id: string | null) => void;
  /** Una tarea de la cola terminó: sus cosechas ya están, hay que releer el historial. */
  alCambiarCola?: () => void;
  /** Ir a escribir una tarea: es lo único que tiene sentido en un tablero vacío. */
  alNueva?: () => void;
  /** Ir a la Bandeja: donde Guardian deja la tarjeta de lo que se rompió. */
  alBandeja?: () => void;
}) {
  const metricas = useMemo(() => medir(turnos), [turnos]);
  const cola = useCola();
  const hayCola = cola.length > 0;
  const { turnos: agenda, refrescar: refrescarAgenda } = useCalendario();
  const hayAgenda = agenda.some((t) => t.estado !== "cancelado");
  const terminadas = cola.filter((t) => t.estado !== "esperando" && t.estado !== "trabajando").length;
  const vistas = useRef<number | null>(null);
  useEffect(() => {
    if (vistas.current !== null && terminadas !== vistas.current) alCambiarCola?.();
    vistas.current = terminadas;
  }, [terminadas, alCambiarCola]);
  const ultimo = turnos[0] ?? null;
  // Termina una siembra → llega un turno nuevo → la actividad se vuelve a leer.
  const actividad = useActividad(ultimo?.id ?? null);
  // Las cifras del router, del tipo de tarea elegido (sin elegir: el más medido).
  const [tipo, setTipo] = useState<string | undefined>(undefined);
  const rendimiento = useRendimiento(tipo, ultimo?.id ?? null);
  // Guardian corre aparte: su tarjeta aparece cuando ya miró este repo.
  const guardian = useGuardian();
  const hayGuardian = guardian?.ultima !== undefined;
  // En rojo va primero: es lo único del tablero que pide que hagas algo ya.
  const guardianRojo = hayGuardian && (guardian?.regresiones.length ?? 0) > 0;
  const todoSuscripcion = metricas.todoSuscripcion;
  const haySiembras = turnos.length > 0;

  // La entrada animada es para cuando abrís el tablero, no para cada vez que la grilla se rearma.
  const primeraVez = useRef(true);
  useEffect(() => {
    primeraVez.current = false;
  }, []);

  const items = useMemo<WidgetItem[]>(() => {
    const base: WidgetItem[] = [
      ...(guardianRojo ? [{ id: "guardian", size: "lg" as const, label: "Guardian" }] : []),
      ...(vivo ? [{ id: "vivo", size: "wide" as const, label: "Sembrando ahora" }] : []),
      ...(hayAgenda ? [{ id: "agenda", size: "wide" as const, label: "Agenda" }] : []),
      ...(hayCola ? [{ id: "cola", size: "wide" as const, label: "Cola" }] : []),
    ];
    if (!haySiembras) {
      // Sin ninguna siembra terminada, las cifras serían todas cero: una sola tarjeta dice qué falta.
      base.push(
        // Ancha y no grande: es un renglón y un botón; en dos filas quedaba un hueco al medio.
        { id: "primera", size: "wide", label: "Tu primera siembra" },
        { id: "actividad", size: "lg", label: "Actividad" },
        ...(hayGuardian && !guardianRojo ? [{ id: "guardian", size: "wide" as const, label: "Guardian" }] : []),
      );
    } else base.push(
      { id: "ultima", size: "lg", label: "Última siembra" },
      { id: "actividad", size: "lg", label: "Actividad" },
      { id: "siembras", size: "sm", label: "Siembras" },
      { id: "tasa", size: "sm", label: "Pasan todas las fases" },
      { id: "rendimiento", size: "lg", label: "Quién rinde" },
      // Con suscripción no se paga por uso: la tarjeta del costo no tiene nada que decir.
      ...(todoSuscripcion ? [] : [{ id: "costo", size: "wide" as const, label: "Costo" }]),
      { id: "fases", size: "wide", label: "El portón, fase por fase" },
      { id: "velocidad", size: "sm", label: "Cuánto tarda" },
      { id: "gratis", size: "sm", label: "Cortes sin gastar" },
      ...(hayGuardian && !guardianRojo ? [{ id: "guardian", size: "wide" as const, label: "Guardian" }] : []),
    );
    return base;
  }, [vivo, hayCola, hayAgenda, hayGuardian, guardianRojo, todoSuscripcion, haySiembras]);

  // El orden que arrastraste manda en la pantalla ancha; apilada (embebida, teléfono) va el de
  // fábrica, que pone primero lo que pide algo de vos.
  const ordenados = useMemo(() => {
    const orden = ordenGuardado();
    if (!orden) return items;
    // El orden guardado manda, pero los widgets nuevos no desaparecen.
    return [...items].sort((a, b) => {
      const ia = orden.indexOf(a.id);
      const ib = orden.indexOf(b.id);
      return (ia < 0 ? items.indexOf(a) + orden.length : ia) - (ib < 0 ? items.indexOf(b) + orden.length : ib);
    });
  }, [items]);

  const pintar = (item: WidgetItem) => {
    switch (item.id as Clase) {
      case "vivo":
        return vivo ? <WidgetVivo vivo={vivo} alAbrir={() => alAbrirCosecha(null)} /> : null;
      case "guardian":
        return guardian ? <WidgetGuardian estado={guardian} alAbrirBandeja={() => alBandeja?.()} /> : null;
      case "agenda":
        return (
          <WidgetAgenda
            turnos={agenda}
            alCancelar={(id) =>
              void mandarCalendario({ accion: "cancelar", id })
                // Si no se pudo, la agenda vuelve a leerse igual y el turno sigue ahí: eso ya lo dice.
                .catch(() => undefined)
                .finally(refrescarAgenda)
            }
          />
        );
      case "cola":
        return <WidgetCola tareas={cola} />;
      case "ultima":
        return <WidgetUltima turno={ultimo} alAbrir={() => alAbrirCosecha(ultimo?.id ?? null)} />;
      case "actividad":
        return <WidgetActividad estado={actividad} alAbrirCosecha={alAbrirCosecha} />;
      case "siembras":
        return <WidgetSiembras m={metricas} turnos={turnos} />;
      case "tasa":
        return <WidgetTasa m={metricas} />;
      case "costo":
        return <WidgetCosto m={metricas} />;
      case "rendimiento":
        return <WidgetRendimiento estado={rendimiento} alElegirTipo={setTipo} suscripcion={metricas.todoSuscripcion} />;
      case "fases":
        return <WidgetFases estado={rendimiento} suscripcion={metricas.todoSuscripcion} />;
      case "velocidad":
        return <WidgetVelocidad turnos={turnos} />;
      case "gratis":
        return <WidgetGratis m={metricas} />;
      case "primera":
        return <WidgetPrimera alNueva={alNueva} />;
    }
  };

  // El primer uso: diez tarjetas en cero no le dicen nada a quien recién
  // llega. Se dice qué va a pasar y se lleva a Nueva; si el scout o el
  // explorador ya dejaron algo, la actividad se ve igual.
  if (turnos.length === 0 && !vivo && !hayCola && !hayAgenda) {
    const hayActividad = actividad.que === "lista" && actividad.actividad.length > 0;
    return (
      <Pagina className="relative">
        <MarDeSimbolos opacity={0.22} />
        {/* La marca, viva, como en Nueva: solo acá, donde todavía no hay datos que leer.
            Con la vista llena, nada se mueve detrás de los números. */}
        <DelfinDeSimbolos legibles="h1, p, button, li" />
        <div className="relative z-10 mx-auto flex w-full max-w-[640px] flex-col pt-5">
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sprout aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle as="h1" className="titulo-vista">
                Todavía no corre nada
              </EmptyTitle>
            </EmptyHeader>
            {alNueva && (
              <EmptyContent>
                <BotonNueva alNueva={alNueva} />
              </EmptyContent>
            )}
          </Empty>
          {hayActividad && (
            <div className="vidrio in-data-[tema=claro]:bg-card/95! overflow-hidden rounded-3xl">
              <WidgetActividad estado={actividad} alAbrirCosecha={alAbrirCosecha} />
            </div>
          )}
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina className="relative">
      <MarDeSimbolos opacity={0.22} />
      {/* Al mismo borde izquierdo que las otras vistas: el título no salta al cambiar de vista. */}
      <div className="relative z-10 flex w-full max-w-[1760px] flex-col gap-5">
        <Cabecera titulo="En vivo" />
        <DraggableWidgetGrid
          // La grilla guarda sus widgets del primer render: si aparece uno
          // (la cola, la siembra en vivo), se rearma. El orden que arrastraste
          // vive en localStorage, así que no se pierde.
          key={items.map((i) => i.id).join(",")}
          items={ordenados}
          stackItems={items}
          stackBelow={760}
          onChange={guardarOrden}
          renderItem={pintar}
          maxColumns={4}
          cellSize={225}
          gap={12}
          radius={24}
          rowRatio={0.78}
          minRowHeight={176}
          animateEntrance={primeraVez.current}
        />
      </div>
    </Pagina>
  );
}
