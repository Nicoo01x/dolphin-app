import { tituloDeTarea } from "./entrega.js";
import { decirSalteadas, fasesSalteadas } from "./porton.js";
import { nombreDeRama } from "./elegir.js";
import type { Cosecha } from "./tipos.js";
import type { Asunto } from "./bandeja.js";
import type { Turno } from "./calendario.js";
import type { Recuerdo } from "./memoria.js";

/**
 * La actividad del proyecto: lo que hizo Dolphin y lo que hiciste vos, en
 * una sola línea de tiempo.
 *
 * No se guarda aparte. Se arma cada vez de lo que ya está en `.dolphin/`
 * —cosechas, bandeja, calendario y memoria—, así que no puede contradecir a
 * ninguna de esas fuentes ni quedarse vieja: si algo no tiene hora (una
 * idea rechazada, un turno cancelado), no se inventa una.
 */

export type TipoDeActividad =
  | "siembra"
  | "pr"
  | "merge"
  | "descarte"
  | "idea"
  | "error"
  | "arreglo"
  | "turno"
  | "memoria";

export type TonoDeActividad = "neutro" | "bien" | "mal";

export interface Actividad {
  /** Estable entre lecturas: el tipo más el id de lo que la originó. */
  readonly id: string;
  readonly tipo: TipoDeActividad;
  /** Cuándo pasó (ISO). */
  readonly en: string;
  /** Qué pasó, en voz humana. El resultado va acá, no solo en el color. */
  readonly titulo: string;
  /** Sobre qué: la tarea, la idea, la regla. */
  readonly sobre?: string;
  /** Un dato más, chico: dónde pasó, por qué se cortó. */
  readonly nota?: string;
  readonly tono: TonoDeActividad;
  /** Quién escribió, para mostrar su logo. */
  readonly modelo?: string;
  /** El id de la cosecha, para abrirla desde la actividad. */
  readonly cosecha?: string;
}

export interface FuentesDeActividad {
  readonly cosechas: readonly { readonly id: string; readonly cosecha: Cosecha & { readonly cuando?: string } }[];
  readonly asuntos: readonly Asunto[];
  readonly turnos: readonly Turno[];
  readonly recuerdos: readonly Recuerdo[];
}

const esFecha = (texto: string | undefined): texto is string =>
  typeof texto === "string" && !Number.isNaN(new Date(texto).getTime());

/** Cuántos eventos devuelve la actividad como mucho: los más nuevos. */
export const TOPE_DE_ACTIVIDAD = 60;

export function armarActividad(fuentes: FuentesDeActividad, tope = TOPE_DE_ACTIVIDAD): Actividad[] {
  const lista: Actividad[] = [];
  const sumar = (a: Actividad) => {
    if (esFecha(a.en)) lista.push(a);
  };

  for (const { id, cosecha: c } of fuentes.cosechas) {
    const modelo = c.ganador?.modelo ?? c.candidatos[0]?.modelo;
    // El título y no la tarea entera: la de un pedido en vivo trae abajo el elemento que se tocó.
    const titulo = tituloDeTarea(c.tarea);
    if (c.cuando) sumar({ id: `siembra:${id}`, tipo: "siembra", en: c.cuando, ...resultadoDe(c), sobre: titulo, cosecha: id, ...(modelo ? { modelo } : {}) });

    const rama = c.entregada?.rama;
    const base = c.entregada?.ramaBase ?? "la rama principal";
    if (c.pr?.en) sumar({ id: `pr:${id}`, tipo: "pr", en: c.pr.en, titulo: "Se abrió un PR en borrador", sobre: titulo, nota: c.pr.url, tono: "neutro", cosecha: id });
    if (c.mergeadaEn && rama)
      sumar({ id: `merge:${id}`, tipo: "merge", en: c.mergeadaEn, titulo: `Mergeaste ${rama} en ${base}`, sobre: titulo, tono: "bien", cosecha: id });
    if (c.descartadaEn && rama)
      sumar({ id: `descarte:${id}`, tipo: "descarte", en: c.descartadaEn, titulo: `Descartaste ${rama}`, sobre: titulo, tono: "neutro", cosecha: id });
  }

  for (const a of fuentes.asuntos) {
    if (a.tipo === "idea") {
      const fuente = a.fuentes?.[0];
      sumar({
        id: `idea:${a.id}`,
        tipo: "idea",
        en: a.creado,
        titulo: "Idea nueva",
        sobre: a.titulo,
        tono: "neutro",
        ...(fuente ? { nota: `vista en ${hostDe(fuente.url)}` } : {}),
      });
    } else {
      sumar({
        id: `error:${a.id}`,
        tipo: "error",
        en: a.creado,
        titulo: "Encontró un error antes que vos",
        sobre: a.titulo,
        tono: "mal",
        ...(a.donde ? { nota: `en ${a.donde}` } : {}),
      });
    }
    // Lo cierra la prueba, no una persona: por eso merece su propia línea.
    if (a.resueltoEn) {
      sumar({
        id: `arreglo:${a.id}`,
        tipo: "arreglo",
        en: a.resueltoEn,
        titulo: "Ya no pasa: lo comprobó al volver a probar",
        sobre: a.titulo,
        tono: "bien",
      });
    }
  }

  for (const t of fuentes.turnos) {
    const [primera, ...resto] = t.tareas;
    const sobre = `${primera ? tituloDeTarea(primera) : "sin tarea"}${resto.length > 0 ? ` y ${resto.length} más` : ""}`;
    // Cada vuelta, también las de un diario: vuelve a «agendado» y antes no dejaba rastro.
    // Un turno de antes de las vueltas cuenta la única que tiene, si terminó.
    const vueltas =
      t.corridas ??
      ((t.estado === "hecho" || t.estado === "fallo") && t.corrio
        ? [{ cuando: t.corrio, salio: t.estado === "hecho", ...(t.porQue ? { porQue: t.porQue } : {}) }]
        : []);
    for (const v of vueltas) {
      sumar({
        id: `turno:${t.id}:${v.cuando}`,
        tipo: "turno",
        en: v.cuando,
        titulo: v.salio ? "El calendario corrió un turno solo" : "Un turno del calendario no salió",
        sobre,
        tono: v.salio ? "neutro" : "mal",
        ...((!v.salio || v.porQue?.includes("Esperé al reinicio del cupo")) && v.porQue ? { nota: v.porQue } : t.host ? { nota: `en ${t.host}` } : {}),
      });
    }
  }

  for (const r of fuentes.recuerdos) {
    sumar({
      id: `memoria:${r.id}`,
      tipo: "memoria",
      en: r.creado,
      // Una candidata todavía no se aprendió: se propuso, y espera el ok del dueño.
      titulo: r.candidato ? "Propuso una regla" : QUE_APRENDIO[r.tipo ?? "regla"],
      sobre: r.dicho,
      tono: "neutro",
      ...(r.candidato ? { nota: "espera tu ok" } : r.activo ? {} : { nota: "apagada" }),
    });
  }

  return lista.sort((a, b) => new Date(b.en).getTime() - new Date(a.en).getTime() || a.id.localeCompare(b.id)).slice(0, tope);
}

const QUE_APRENDIO: Record<NonNullable<Recuerdo["tipo"]>, string> = {
  regla: "Aprendió una regla",
  error: "Anotó un error que no se repite",
  decision: "Anotó una decisión del proyecto",
  nota: "Anotó una nota del proyecto",
};

/** Cómo le fue a una siembra, dicho como lo diría una persona. */
function resultadoDe(c: Cosecha): Pick<Actividad, "titulo" | "tono" | "nota"> {
  const total = c.candidatos.length;
  const vivos = c.candidatos.filter((x) => x.vivo);

  // «Ninguna de las 0 ramas pasó» no dice nada: lo que pasó es que no hubo ramas.
  if (total === 0) return { titulo: "No se abrió ninguna rama", tono: "mal" };
  if (total === 1) {
    const unica = c.candidatos[0]!;
    if (!unica.vivo) {
      return { titulo: `Se cortó en ${unica.murioEn ?? "el testing"}`, tono: "mal", ...(unica.porQue ? { nota: unica.porQue } : {}) };
    }
    if (unica.pasadas.length === 0) return { titulo: "Terminó sin fases: no se probó nada", tono: "neutro" };
    const salteadas = fasesSalteadas(unica);
    return salteadas.length > 0
      ? { titulo: `Pasó, pero ${decirSalteadas(salteadas)}`, tono: "neutro" }
      : { titulo: "Pasó todas las fases", tono: "bien" };
  }

  if (vivos.length === 0) return { titulo: `Ninguna de las ${total} ramas pasó`, tono: "mal" };
  return {
    titulo: `${vivos.length} de ${total} ramas pasaron`,
    tono: "bien",
    ...(c.ganador ? { nota: `quedó ${nombreDeRama(c.ganador)}` } : {}),
  };
}

function hostDe(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
