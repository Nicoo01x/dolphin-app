import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { leerMemoria, recordar } from "./memoria.js";
import { enFilaDeNotas, guardarNotas, leerNotas, type Nota, type Origen, type Vista } from "./notas.js";
import { carpetaDeDolphin } from "./escritura.js";

/**
 * El sueño: pasa notas del corto plazo (ver notas.ts) a la memoria de verdad,
 * pero solo las que se ganaron el lugar. Es el «dreaming» de OpenClaw
 * (extensions/memory-core/src/short-term-promotion.ts), portado con sus
 * pesos y adaptado a lo que Dolphin sabe:
 *
 *   relevancia     0,30  qué tan fuerte es cada señal, en promedio
 *   frecuencia     0,24  ln(1+señales) / ln(11)
 *   diversidad     0,15  tareas distintas / 5
 *   recencia       0,15  vida media de 14 días desde la última vez que se vio
 *   consolidación  0,10  en cuántos días distintos se vio, y en cuánto lapso
 *   (OpenClaw suma 0,06 por conceptos etiquetados: Dolphin no etiqueta, así
 *   que ese 0,06 no se reparte y el máximo es 0,94.)
 *
 * Las señales de Dolphin no son búsquedas, como en OpenClaw, sino hechos: el
 * portón volvió a ver lo mismo en otra tarea (relevancia 0,85, porque es un
 * hecho medido), un agente lo anotó (0,62, el valor del «daily» de
 * OpenClaw), o la nota viajó como pista en un prompt y la siembra salió
 * (0,9) o no (0,4).
 *
 * Calibración (ver los tests): un hecho visto en 3 tareas distintas suma
 * ~0,65 en el momento y entra; visto en 2, no llega (~0,59); visto 3 veces
 * pero hace 20 días, tampoco (~0,56): ya no describe al repo de hoy.
 *
 * Lo que viene de afuera (untrusted) nunca entra solo: queda esperando el
 * visto bueno del dueño. OpenClaw no tiene esa puerta; Dolphin sí, porque
 * hay cosas de un issue que valen y alguien tiene que poder decirlo.
 */

export interface Umbrales {
  readonly minPuntaje: number;
  readonly minSenales: number;
  readonly minTareas: number;
  readonly vidaMediaDias: number;
  /** Una nota que no se vuelve a ver en este lapso se olvida (el diario la conserva). */
  readonly maxEdadDias: number;
  /** Cuántas entran por sueño, como máximo: la memoria crece de a poco. */
  readonly porSueno: number;
}

export const UMBRALES: Umbrales = {
  minPuntaje: 0.6,
  minSenales: 3,
  minTareas: 3,
  vidaMediaDias: 14,
  maxEdadDias: 30,
  porSueno: 10,
};

const PESOS = { relevancia: 0.3, frecuencia: 0.24, diversidad: 0.15, recencia: 0.15, consolidacion: 0.1 } as const;

/**
 * Qué tan fuerte es una señal si la vista no lo dice (notas viejas): según
 * quién la dio. Las nuevas traen la fuerza de su clase (ver notas.ts).
 */
const RELEVANCIA_DE: Readonly<Record<Origen, number>> = { owner: 0.9, sistema: 0.85, agente: 0.62, sesion: 0.9, untrusted: 0.62 };

export interface Puntaje {
  readonly total: number;
  readonly senales: number;
  readonly tareas: number;
  readonly dias: number;
  readonly partes: Readonly<Record<keyof typeof PESOS, number>>;
}

const DIA = 86_400_000;
const acotar = (x: number) => Math.min(1, Math.max(0, x));

export function puntuar(nota: Pick<Nota, "origen" | "vistas">, ahora: Date, u: Umbrales = UMBRALES): Puntaje {
  const vistas = nota.vistas;
  const n = vistas.length;
  if (n === 0) return { total: 0, senales: 0, tareas: 0, dias: 0, partes: { relevancia: 0, frecuencia: 0, diversidad: 0, recencia: 0, consolidacion: 0 } };

  const relevancia = acotar(vistas.reduce((s, v) => s + (v.relevancia ?? RELEVANCIA_DE[nota.origen]), 0) / n);
  const frecuencia = acotar(Math.log(1 + n) / Math.log(11));
  const tareas = new Set(vistas.map((v) => v.tarea.trim().toLowerCase())).size;
  const diversidad = acotar(tareas / 5);
  const tiempos = vistas.map((v) => new Date(v.cuando).getTime()).filter((t) => !Number.isNaN(t));
  const ultima = Math.max(...tiempos);
  const edad = Math.max(0, (ahora.getTime() - ultima) / DIA);
  const recencia = Math.exp((-Math.LN2 * edad) / u.vidaMediaDias);
  const dias = new Set(vistas.map((v) => v.cuando.slice(0, 10))).size;
  const lapso = (ultima - Math.min(...tiempos)) / DIA;
  const consolidacion = dias === 0 ? 0 : dias === 1 ? 0.2 : 0.55 * acotar(Math.log(dias) / Math.log(5)) + 0.45 * acotar(lapso / 7);

  const partes = { relevancia, frecuencia, diversidad, recencia, consolidacion };
  const total = (Object.keys(PESOS) as (keyof typeof PESOS)[]).reduce((s, k) => s + PESOS[k] * partes[k], 0);
  return { total: Math.round(total * 1000) / 1000, senales: n, tareas, dias, partes };
}

/** ¿Le alcanza para entrar? Sin mirar el origen: eso lo decide el sueño. */
export const alcanza = (p: Puntaje, u: Umbrales = UMBRALES): boolean =>
  p.total >= u.minPuntaje && p.senales >= u.minSenales && p.tareas >= u.minTareas;

export interface Sueno {
  readonly promovidas: readonly { readonly nota: Nota; readonly puntaje: Puntaje }[];
  /** De afuera y con puntaje para entrar: esperan el visto bueno del dueño. */
  readonly esperando: readonly { readonly nota: Nota; readonly puntaje: Puntaje }[];
  readonly olvidadas: number;
}

/**
 * Un sueño: olvida lo que no se volvió a ver, promueve lo que alcanza y deja
 * esperando lo que viene de afuera. Corre después de cada siembra; también
 * a mano (`npm run sonar`). Escribe DREAMS.md solo si pasó algo.
 */
export function sonar(repo: string, ahora: Date = new Date(), u: Umbrales = UMBRALES): Promise<Sueno> {
  // En la fila de las notas: un sueño a la vez que una siembra anota perdía la nota nueva (ver notas.ts).
  return enFilaDeNotas(repo, () => sonarAhora(repo, ahora, u));
}

async function sonarAhora(repo: string, ahora: Date, u: Umbrales): Promise<Sueno> {
  const notas = await leerNotas(repo);
  const vigentes = notas.filter((n) => n.promovida || n.descartada || edadDias(n, ahora) <= u.maxEdadDias);
  const olvidadas = notas.length - vigentes.length;

  const candidatas = vigentes
    .filter((n) => !n.promovida && !n.descartada)
    .map((nota) => ({ nota, puntaje: puntuar(nota, ahora, u) }))
    .filter((c) => alcanza(c.puntaje, u))
    .sort((a, b) => b.puntaje.total - a.puntaje.total);

  const confiables = candidatas.filter((c) => c.nota.origen !== "untrusted").slice(0, u.porSueno);
  const esperando = candidatas.filter((c) => c.nota.origen === "untrusted");

  const promovidas: { nota: Nota; puntaje: Puntaje }[] = [];
  const yaEstaban: Nota[] = [];
  let resultado = vigentes;
  for (const c of confiables) {
    // Si la memoria ya lo sabía (lo dijo el dueño, o entró por otro lado), la
    // nota queda resuelta pero no se cuenta como algo nuevo: el sueño no se adjudica lo que ya estaba.
    const antes = await yaEstaEnLaMemoria(repo, c.nota.texto);
    const recuerdo = await recordar(repo, c.nota.texto, undefined, "nota", { origen: c.nota.origen, porQue: porQueEntro(c.nota, c.puntaje) });
    resultado = resultado.map((n) => (n.id === c.nota.id ? { ...n, promovida: { cuando: ahora.toISOString(), recuerdo: recuerdo.id } } : n));
    if (antes) yaEstaban.push(c.nota);
    else promovidas.push(c);
  }

  if (olvidadas > 0 || promovidas.length > 0 || yaEstaban.length > 0) await guardarNotas(repo, resultado);
  // Solo lo nuevo que espera: lo que ya estaba esperando no se vuelve a anunciar.
  const nuevasEsperando = esperando.filter((c) => !c.nota.anunciada);
  if (nuevasEsperando.length > 0) {
    const ids = new Set(nuevasEsperando.map((c) => c.nota.id));
    resultado = resultado.map((n) => (ids.has(n.id) ? { ...n, anunciada: ahora.toISOString() } : n));
    await guardarNotas(repo, resultado);
  }
  if (promovidas.length > 0 || nuevasEsperando.length > 0 || olvidadas > 0 || yaEstaban.length > 0) {
    await escribirSueno(repo, ahora, { promovidas, esperando: nuevasEsperando, olvidadas, yaEstaban });
  }
  return { promovidas, esperando, olvidadas };
}

async function yaEstaEnLaMemoria(repo: string, texto: string): Promise<boolean> {
  const { recuerdos } = await leerMemoria(repo);
  return recuerdos.some((r) => r.dicho === texto.trim());
}

/** El dueño aprueba una nota (de afuera o no): entra a la memoria con eso como motivo. */
export function aprobarNota(repo: string, id: string, ahora: Date = new Date()): Promise<boolean> {
  return enFilaDeNotas(repo, () => aprobarAhora(repo, id, ahora));
}

async function aprobarAhora(repo: string, id: string, ahora: Date): Promise<boolean> {
  const notas = await leerNotas(repo);
  const nota = notas.find((n) => n.id === id && !n.promovida && !n.descartada);
  if (!nota) return false;
  const puntaje = puntuar(nota, ahora);
  const porQue = `la aprobó el dueño · ${resumenDe(nota, puntaje)}`;
  const antes = await yaEstaEnLaMemoria(repo, nota.texto);
  const recuerdo = await recordar(repo, nota.texto, undefined, "nota", { origen: nota.origen, porQue });
  await guardarNotas(repo, notas.map((n) => (n.id === id ? { ...n, promovida: { cuando: ahora.toISOString(), recuerdo: recuerdo.id } } : n)));
  await escribirSueno(repo, ahora, {
    promovidas: [],
    esperando: [],
    olvidadas: 0,
    ...(antes ? { yaEstaban: [nota] } : { aprobada: { nota, porQue } }),
  });
  return true;
}

/** El dueño la descarta: no vuelve a ser candidata, aunque se siga viendo. */
export function descartarNota(repo: string, id: string, ahora: Date = new Date()): Promise<boolean> {
  return enFilaDeNotas(repo, async () => {
    const notas = await leerNotas(repo);
    if (!notas.some((n) => n.id === id)) return false;
    await guardarNotas(repo, notas.map((n) => (n.id === id ? { ...n, descartada: ahora.toISOString() } : n)));
    return true;
  });
}

function edadDias(nota: Nota, ahora: Date): number {
  const ultima = Math.max(...nota.vistas.map((v) => new Date(v.cuando).getTime()));
  return (ahora.getTime() - ultima) / DIA;
}

const coma = (x: number) => x.toFixed(2).replace(".", ",");

function resumenDe(nota: Nota, p: Puntaje): string {
  const visto = `${p.senales} ${p.senales === 1 ? "vez" : "veces"} en ${p.tareas} ${p.tareas === 1 ? "tarea" : "tareas"}, ${p.dias} ${p.dias === 1 ? "día" : "días"}`;
  return `puntaje ${coma(p.total)} (${visto}; ${QUIEN[nota.origen]})`;
}

const QUIEN: Readonly<Record<Origen, string>> = {
  owner: "lo dijo el dueño",
  sistema: "lo midió el portón",
  agente: "lo anotó un agente",
  sesion: "salió de una sesión",
  untrusted: "vino de afuera",
};

function porQueEntro(nota: Nota, p: Puntaje): string {
  return `entró soñando · ${resumenDe(nota, p)}`;
}

const ENCABEZADO = `# Los sueños de Dolphin

Qué pasó de las notas de corto plazo a la memoria, y por qué. Lo escribe Dolphin
después de cada siembra (ver src/nucleo/sueno.ts); no hace falta editarlo.
Una nota entra cuando se vio al menos en 3 tareas distintas y su puntaje llega a 0,60.
Lo que viene de afuera no entra solo: espera tu visto bueno en la vista Memoria.
`;

async function escribirSueno(
  repo: string,
  ahora: Date,
  s: {
    promovidas: readonly { nota: Nota; puntaje: Puntaje }[];
    esperando: readonly { nota: Nota; puntaje: Puntaje }[];
    olvidadas: number;
    aprobada?: { nota: Nota; porQue: string };
    yaEstaban?: readonly Nota[];
  },
): Promise<void> {
  const ruta = join(repo, ".dolphin", "DREAMS.md");
  await carpetaDeDolphin(repo);
  const existe = await readFile(ruta, "utf8").then(
    () => true,
    () => false,
  );
  const dos = (x: number) => String(x).padStart(2, "0");
  const cuando = `${dos(ahora.getDate())}/${dos(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;
  const lineas: string[] = ["", "---", "", `## ${cuando}`, ""];
  if (s.aprobada) {
    lineas.push("**Entró porque la aprobaste**", `- ${s.aprobada.nota.texto} — ${s.aprobada.porQue}.`, "");
  }
  if (s.promovidas.length > 0) {
    lineas.push("**Entró a la memoria**");
    for (const { nota, puntaje } of s.promovidas) {
      const p = puntaje.partes;
      const detalle = `relevancia ${coma(p.relevancia)} · frecuencia ${coma(p.frecuencia)} · diversidad ${coma(p.diversidad)} · recencia ${coma(p.recencia)} · días ${coma(p.consolidacion)}`;
      const tareas = [...new Set(nota.vistas.map((v) => v.tarea))].slice(0, 3).map((t) => `«${t.slice(0, 60)}»`).join(", ");
      lineas.push(`- ${nota.texto} — ${resumenDe(nota, puntaje)}. Pesó: ${detalle}. Se vio en ${tareas}.`);
    }
    lineas.push("");
  }
  if (s.esperando.length > 0) {
    lineas.push("**Espera tu visto bueno** (vino de afuera: no entra sola)");
    for (const { nota, puntaje } of s.esperando) lineas.push(`- ${nota.texto} — ${resumenDe(nota, puntaje)}.`);
    lineas.push("");
  }
  if (s.yaEstaban && s.yaEstaban.length > 0) {
    lineas.push("**Ya estaba en la memoria** (la nota queda resuelta, no se suma de nuevo)");
    for (const nota of s.yaEstaban) lineas.push(`- ${nota.texto} — ${QUIEN[nota.origen]}.`);
    lineas.push("");
  }
  if (s.olvidadas > 0) {
    lineas.push(`Se olvidaron ${s.olvidadas} ${s.olvidadas === 1 ? "nota que no se volvió" : "notas que no se volvieron"} a ver en 30 días (siguen en el diario de notas/).`, "");
  }
  await appendFile(ruta, `${existe ? "" : ENCABEZADO}${lineas.join("\n")}`);
}

export type { Vista };
