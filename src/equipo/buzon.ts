import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "../nucleo/escritura.js";

export type EstadoDeCompanero = "trabajando" | "esperando" | "libre" | "terminado";

export interface MensajeDeBuzon {
  readonly de: string;
  readonly para: string;
  readonly texto: string;
  readonly cuando: string;
  readonly leido: boolean;
}

export interface RegistroDeCompanero {
  readonly nombre: string;
  readonly estado: EstadoDeCompanero;
  readonly actualizado: string;
}

export interface EstadoGuardadoDeEquipo {
  readonly companeros: readonly RegistroDeCompanero[];
  readonly retomas: Readonly<Record<string, number>>;
  readonly avisos: readonly string[];
}

const carpetaDelEquipo = (repo: string, equipo: string) => join(repo, ".dolphin", "equipos", equipo);
const rutaBuzon = (repo: string, equipo: string) => join(carpetaDelEquipo(repo, equipo), "buzon.jsonl");
const rutaEstado = (repo: string, equipo: string) => join(carpetaDelEquipo(repo, equipo), "estado.json");
const limpio = (nombre: string) => nombre.trim().replace(/^@/, "");

const vacio = (): EstadoGuardadoDeEquipo => ({ companeros: [], retomas: {}, avisos: [] });

export function leerEstadoEquipo(repo: string, equipo: string): Promise<EstadoGuardadoDeEquipo> {
  return leerEstado(rutaEstado(repo, equipo), vacio(), (datos) => {
    const d = datos as Partial<EstadoGuardadoDeEquipo> | null;
    const companeros = Array.isArray(d?.companeros)
      ? d.companeros.filter((x): x is RegistroDeCompanero => typeof x?.nombre === "string" && typeof x.estado === "string")
      : [];
    const retomas = d?.retomas && typeof d.retomas === "object" ? d.retomas : {};
    const avisos = Array.isArray(d?.avisos) ? d.avisos.filter((x): x is string => typeof x === "string") : [];
    return { companeros, retomas, avisos };
  });
}

async function guardarEstado(repo: string, equipo: string, estado: EstadoGuardadoDeEquipo): Promise<void> {
  const carpeta = await carpetaDeDolphin(repo, "equipos", equipo);
  await escribirDeUna(join(carpeta, "estado.json"), `${JSON.stringify(estado, null, 2)}\n`);
}

export function inicializarEquipo(repo: string, equipo: string, companeros: readonly string[] = []): Promise<void> {
  return enFila(rutaEstado(repo, equipo), async () => {
    const actual = await leerEstadoEquipo(repo, equipo);
    if (actual.companeros.length > 0) return;
    const ahora = new Date().toISOString();
    await guardarEstado(repo, equipo, { ...actual, companeros: companeros.map((nombre) => ({ nombre, estado: "esperando", actualizado: ahora })) });
  });
}

export function registrarCompaneros(repo: string, equipo: string, nombres: readonly string[]): Promise<void> {
  return enFila(rutaEstado(repo, equipo), async () => {
    const actual = await leerEstadoEquipo(repo, equipo);
    const ahora = new Date().toISOString();
    const anteriores = new Map(actual.companeros.map((x) => [x.nombre, x] as const));
    const companeros = nombres.map((nombre) => anteriores.get(nombre) ?? { nombre, estado: "esperando" as const, actualizado: ahora });
    await guardarEstado(repo, equipo, { ...actual, companeros });
  });
}

export function actualizarEstadoCompanero(repo: string, equipo: string, nombre: string, estado: EstadoDeCompanero): Promise<void> {
  return enFila(rutaEstado(repo, equipo), async () => {
    const actual = await leerEstadoEquipo(repo, equipo);
    const ahora = new Date().toISOString();
    const existe = actual.companeros.some((x) => x.nombre === nombre);
    const companeros = existe
      ? actual.companeros.map((x) => (x.nombre === nombre ? { ...x, estado, actualizado: ahora } : x))
      : [...actual.companeros, { nombre, estado, actualizado: ahora }];
    await guardarEstado(repo, equipo, { ...actual, companeros });
  });
}

export function anotarAvisoDeEquipo(repo: string, equipo: string, aviso: string): Promise<void> {
  return enFila(rutaEstado(repo, equipo), async () => {
    const actual = await leerEstadoEquipo(repo, equipo);
    if (actual.avisos.includes(aviso)) return;
    await guardarEstado(repo, equipo, { ...actual, avisos: [...actual.avisos, aviso] });
  });
}

/** Reserva el cupo antes de retomar: dos procesos no pueden quemar el mismo cupo. */
export function reservarRetoma(repo: string, equipo: string, companero: string): Promise<boolean> {
  return enFila(rutaEstado(repo, equipo), async () => {
    const actual = await leerEstadoEquipo(repo, equipo);
    const usadas = actual.retomas[companero] ?? 0;
    const total = Object.values(actual.retomas).reduce((suma, n) => suma + n, 0);
    if (usadas >= 2 || total >= 10) {
      const limite = usadas >= 2 ? `el compañero ${companero} ya agotó sus 2 retomas` : "el equipo ya agotó sus 10 retomas";
      const aviso = `retomas agotadas: ${limite}`;
      if (!actual.avisos.includes(aviso)) await guardarEstado(repo, equipo, { ...actual, avisos: [...actual.avisos, aviso] });
      return false;
    }
    await guardarEstado(repo, equipo, { ...actual, retomas: { ...actual.retomas, [companero]: usadas + 1 } });
    return true;
  });
}

async function leerLineas(repo: string, equipo: string): Promise<MensajeDeBuzon[]> {
  const texto = await readFile(rutaBuzon(repo, equipo), "utf8").catch(() => "");
  return texto.split(/\r?\n/).filter(Boolean).flatMap((linea) => {
    try {
      const dato = JSON.parse(linea) as Partial<MensajeDeBuzon>;
      return typeof dato.de === "string" && typeof dato.para === "string" && typeof dato.texto === "string" && typeof dato.cuando === "string"
        ? [{ de: dato.de, para: dato.para, texto: dato.texto, cuando: dato.cuando, leido: dato.leido === true }]
        : [];
    } catch {
      return [];
    }
  });
}

export function enviarMensaje(repo: string, equipo: string, de: string, para: string, texto: string): Promise<MensajeDeBuzon | null> {
  const remitente = limpio(de);
  const destinatario = limpio(para);
  const cuerpo = texto.trim();
  if (!remitente || !destinatario || !cuerpo) return Promise.resolve(null);
  return enFila(rutaBuzon(repo, equipo), async () => {
    const mensajes = await leerLineas(repo, equipo);
    if (mensajes.filter((m) => m.de === remitente).length >= 5) {
      await anotarAvisoDeEquipo(repo, equipo, `mensajes agotados: ${remitente} llegó a 5`);
      return null;
    }
    await carpetaDeDolphin(repo, "equipos", equipo);
    const mensaje = { de: remitente, para: destinatario, texto: cuerpo, cuando: new Date().toISOString(), leido: false };
    await appendFile(rutaBuzon(repo, equipo), `${JSON.stringify(mensaje)}\n`, "utf8");
    return mensaje;
  });
}

export function leerMensajes(repo: string, equipo: string, para: string, marcar = true): Promise<MensajeDeBuzon[]> {
  const destinatario = limpio(para);
  return enFila(rutaBuzon(repo, equipo), async () => {
    const mensajes = await leerLineas(repo, equipo);
    const propios = mensajes.filter((m) => m.para === destinatario && !m.leido);
    if (!marcar || propios.length === 0) return propios;
    const claves = new Set(propios.map((m) => `${m.cuando}\u0000${m.de}\u0000${m.texto}`));
    await escribirDeUna(rutaBuzon(repo, equipo), `${mensajes.map((m) => JSON.stringify(claves.has(`${m.cuando}\u0000${m.de}\u0000${m.texto}`) ? { ...m, leido: true } : m)).join("\n")}\n`);
    return propios;
  });
}

export async function esperarEstado(repo: string, equipo: string, quien: string, hasta: "libre" | "terminado", topeSegundos = 600): Promise<boolean> {
  const destinatario = limpio(quien);
  const yo = limpio(process.env.DOLPHIN_COMPANERO ?? "");
  if (yo) await actualizarEstadoCompanero(repo, equipo, yo, "esperando");
  const limite = Date.now() + Math.max(0, topeSegundos) * 1_000;
  try {
    for (;;) {
      const estado = (await leerEstadoEquipo(repo, equipo)).companeros.find((x) => x.nombre === destinatario)?.estado;
      if (estado === "terminado" || estado === hasta) return true;
      if (Date.now() >= limite) return false;
      await new Promise((resolver) => setTimeout(resolver, Math.min(100, Math.max(1, limite - Date.now()))));
    }
  } finally {
    if (yo) await actualizarEstadoCompanero(repo, equipo, yo, "trabajando");
  }
}

