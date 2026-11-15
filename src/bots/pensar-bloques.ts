import { listarHabilidades, leerAlma, leerHistorial, leerMemoria, type Bot } from "./almacen.js";
import { leerTraspaso } from "./motor.js";
import { TOPE_DE_MEMORIA } from "./memoria.js";
import type { PensarDeps } from "./pensar.js";

export interface Bloques {
  texto: string;
  readonly recuerdos: string[];
  readonly habilidades: { nombre: string; descripcion: string; cuerpo: string }[];
  readonly pedidos: { bot: string; tarea: string }[];
  readonly permiso?: string;
  readonly consolidaciones: string[];
  readonly busquedas: string[];
  readonly chequeoIntentos: number;
  readonly nada: boolean;
}

const reglas = [
  "REGLAS DEL BOT",
  "Contestá en castellano rioplatense y tratá de vos a quien te escribe.",
  "Para guardar un aprendizaje usá <<recordar>>una línea<</recordar>>.",
  'Para guardar un procedimiento usá <<habilidad nombre="slug" descripcion="breve">>el procedimiento<</habilidad>>.',
  'Para consultar a otro bot usá <<pedir bot="id">>tarea<</pedir>>. No consultes al mismo bot ni repitas una consulta.',
  "Si necesitás escribir o ejecutar algo sin permiso, usá <<permiso>>qué querés hacer y por qué<</permiso>>.",
  "Si la memoria está llena, reemplazala entera con <<consolidar>>un resumen menor a 2200 caracteres<</consolidar>>.",
  "Para buscar recuerdos viejos usá <<buscar>>palabras de la consulta<</buscar>>.",
  "No crees ni cambies chequeos de rutinas: si aparece un bloque <<chequeo>>, se ignora.",
  "No cambies rutinas, presupuesto ni entorno del bot: esas decisiones son del dueño y vienen de la API o el CLI.",
  "En un latido sin novedades usá <<nada>>. Estos bloques no los ve la persona.",
].join("\n");

const palabras = (texto: string): string[] =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? [];

export async function promptDe(bot: Bot, mensaje: string, deps: PensarDeps): Promise<string> {
  const [alma, memoria, habilidades, historial] = await Promise.all([leerAlma(bot.id), leerMemoria(bot.id), listarHabilidades(bot.id), leerHistorial(bot.id, 12)]);
  const traspaso = await leerTraspaso(bot);
  const tokens = new Set(palabras(mensaje));
  const indice = habilidades.map((h) => "- " + h.nombre + ": " + h.descripcion).join("\n") || "(ninguna todavía)";
  const forzadas = new Set(deps.rutina?.habilidades ?? []);
  const candidatas = habilidades.filter((h) => forzadas.has(h.nombre) || palabras(h.nombre + " " + h.descripcion + " " + h.cuerpo).some((x) => tokens.has(x)));
  const relevantes = forzadas.size ? candidatas : candidatas.slice(0, 3);
  const procedimientos = relevantes.length ? "\nPROCEDIMIENTOS RELEVANTES\n" + relevantes.map((h) => "## " + h.nombre + "\n" + h.cuerpo).join("\n") : "";
  const charla = historial.map((h) => h.quien + ": " + h.texto).join("\n") || "(sin charla anterior)";
  return [
    "ALMA\n" + alma,
    reglas,
    "MEMORIA\n" + (memoria || "(vacía)") + (memoria.length >= 2_000 ? `\nMEMORIA LLENA: consolidá con <<consolidar>>...<</consolidar>> y no superes ${TOPE_DE_MEMORIA} caracteres.` : ""),
    "ÍNDICE DE HABILIDADES\n" + indice + procedimientos,
    "ÚLTIMOS 12 DEL HISTORIAL\n" + charla,
    traspaso ? "PAQUETE DE TRASPASO\n" + traspaso : "",
    "MENSAJE\n" + mensaje,
  ].join("\n\n");
}

export function bloques(texto: string): Bloques {
  let limpio = texto;
  const recuerdos: string[] = [];
  limpio = limpio.replace(/<<recordar>>([\s\S]*?)<<\/recordar>>/g, (_, x: string) => {
    if (x.trim()) recuerdos.push(x.trim());
    return "";
  });
  const habilidades: Bloques["habilidades"] = [];
  limpio = limpio.replace(/<<habilidad\s+nombre="([^"]+)"\s+descripcion="([^"]*)">>([\s\S]*?)<<\/habilidad>>/g, (_, nombre: string, descripcion: string, cuerpo: string) => {
    habilidades.push({ nombre: nombre.trim(), descripcion: descripcion.trim(), cuerpo: cuerpo.trim() });
    return "";
  });
  const pedidos: Bloques["pedidos"] = [];
  limpio = limpio.replace(/<<pedir\s+bot="([^"]+)">>([\s\S]*?)<<\/pedir>>/g, (_, bot: string, tarea: string) => {
    pedidos.push({ bot: bot.trim(), tarea: tarea.trim() });
    return "";
  });
  let permiso: string | undefined;
  limpio = limpio.replace(/<<permiso>>([\s\S]*?)<<\/permiso>>/g, (_, x: string) => {
    permiso = x.trim();
    return "";
  });
  const consolidaciones: string[] = [];
  limpio = limpio.replace(/<<consolidar>>([\s\S]*?)<<\/consolidar>>/g, (_, x: string) => {
    if (x.trim()) consolidaciones.push(x.trim());
    return "";
  });
  const busquedas: string[] = [];
  limpio = limpio.replace(/<<buscar>>([\s\S]*?)<<\/buscar>>/g, (_, x: string) => {
    if (x.trim()) busquedas.push(x.trim());
    return "";
  });
  let chequeoIntentos = 0;
  limpio = limpio.replace(/<<chequeo(?:\s[^>]*)?>>([\s\S]*?)<<\/chequeo>>/g, () => {
    chequeoIntentos++;
    return "";
  });
  const nada = /<<nada>>/.test(limpio);
  limpio = limpio.replace(/<<nada>>/g, "");
  return { texto: limpio.replace(/\n{3,}/g, "\n\n").trim(), recuerdos, habilidades, pedidos, ...(permiso ? { permiso } : {}), consolidaciones, busquedas, chequeoIntentos, nada };
}
