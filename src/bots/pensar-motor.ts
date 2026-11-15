import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argumentosDeClaude, leerSalida } from "../agentes/claude.js";
import { argumentosDeLectura } from "../agentes/leer-con-claude.js";
import { argumentosDeCodex, fallaDeCodex } from "../agentes/otros.js";
import { correrConPrompt, prepararComando } from "../agentes/ejecutar.js";
import type { Bot } from "./almacen.js";
import type { PedidoDeCorrida } from "./pensar.js";
import { conCuentaDeClaude } from "../nucleo/cuentas.js";
import { entornoDelBot } from "./entorno.js";
import { registrarCorrida } from "./presupuesto.js";
import { guardarSesionDelBot } from "./motor.js";

export class ErrorDeCupo extends Error {
  readonly cupo = true;
}

export function esFalloDeCupo(error: unknown): boolean {
  return error instanceof Error && (/usage\s*limit|rate\s*limit|quota|cupo|l[ií]mite de uso/i.test(error.message) || (error as ErrorDeCupo).cupo === true);
}

export function respuestaMentira(mensaje: string, bot: Bot, conPermiso: boolean): string {
  const neutralizar = (texto: string) => texto.replaceAll("<<", "‹‹").replaceAll(">>", "››");
  const nombre = neutralizar(bot.nombre);
  const carpeta = neutralizar(bot.carpeta);
  const pideCambiar = /(?<!\p{L})(escribí|escribe|creá|crea|cambiá|cambia|ejecutá|ejecuta|corré|corre|dejá|deja|arreglá|arregla)(?!\p{L})/iu.test(mensaje);
  if (pideCambiar && conPermiso) return "Listo: lo hice en " + carpeta + " y corrí los tests. Pasaron todos (es la demo: no se tocó nada de verdad).";
  if (bot.permiso === "preguntar" && pideCambiar)
    return "<<permiso>>Quiero cambiar o ejecutar algo en " + carpeta + " para cumplir tu pedido.<</permiso>>";
  const partes = ["Entendido. Revisé el pedido como " + nombre + " y te dejo una respuesta de demostración."];
  if (/aprend[eé]/i.test(mensaje))
    partes.push(
      '<<habilidad nombre="procedimiento-demo" descripcion="Un procedimiento aprendido en la demo">>Anotá el resultado, verificá lo importante y contame qué quedó.<</habilidad>>',
    );
  if (/recordá|recorda|memoria|aprend/i.test(mensaje))
    partes.push("<<recordar>>Conviene dejar una comprobación breve después de cada tarea demo.<</recordar>>");
  return partes.join("\n\n");
}

export async function correrPorDefecto(pedido: PedidoDeCorrida): Promise<string> {
  if (pedido.demo || pedido.bot.motor === "mentira")
    return respuestaMentira(pedido.prompt.slice(pedido.prompt.lastIndexOf("MENSAJE\n") + 8), pedido.bot, pedido.permiso === "permisos");
  if (pedido.bot.motor === "claude") {
    const listo = prepararComando(pedido.cmd, pedido.args);
    if (!listo) throw new Error("no encontré «" + pedido.cmd + "» en el PATH");
    const salida = await conCuentaDeClaude(async (cuenta) => {
      const crudo = await correrConPrompt(listo.cmd, listo.args, pedido.prompt, pedido.bot.carpeta, 600_000, { ...pedido.entorno, ...cuenta }, listo.verbatim, undefined, pedido.senal);
      const leido = leerSalida(crudo.salida) as ReturnType<typeof leerSalida> & { subtype?: string };
      if (leido.is_error || leido.subtype?.startsWith("error")) {
        const mensaje = leido.result || `Claude cortó (${leido.subtype ?? "error"})`;
        await registrarCorrida(pedido.bot, typeof leido.total_cost_usd === "number" ? leido.total_cost_usd : undefined);
        throw /usage\s*limit|rate\s*limit|quota|cupo|l[ií]mite de uso/i.test(mensaje) ? new ErrorDeCupo(mensaje) : new Error(mensaje);
      }
      await guardarSesionDelBot(pedido.bot, leido.session_id, pedido.modelo ?? pedido.bot.modelo);
      await registrarCorrida(pedido.bot, typeof leido.total_cost_usd === "number" ? leido.total_cost_usd : undefined);
      return leido.result ?? crudo.salida;
    }, (resultado) => false);
    return salida;
  }
  const carpeta = await mkdtemp(join(tmpdir(), "dolphin-bot-codex-"));
  const archivo = join(carpeta, "respuesta.txt");
  try {
    const modelo = pedido.modelo ?? pedido.bot.modelo;
    const args = argumentosDeCodex(pedido.bot.carpeta, archivo, modelo ? { modelo } : {}, modelo);
    const argumentos = pedido.permiso === "solo-lectura" ? args.map((x) => (x === "workspace-write" ? "read-only" : x)) : args;
    const listo = prepararComando(pedido.cmd, argumentos);
    if (!listo) throw new Error("no encontré «" + pedido.cmd + "» en el PATH");
    const salida = await correrConPrompt(listo.cmd, listo.args, pedido.prompt, pedido.bot.carpeta, 600_000, pedido.entorno, listo.verbatim, undefined, pedido.senal);
    await registrarCorrida(pedido.bot, undefined);
    const falla = fallaDeCodex(salida.salida, salida.codigo);
    if (falla) throw /usage\s*limit|rate\s*limit|quota|cupo|l[ií]mite de uso/i.test(falla) ? new ErrorDeCupo(falla) : new Error(falla);
    return await readFile(archivo, "utf8").catch(() => "");
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

export function herramientasDeBot(bot: Bot): string[] {
  const herramientas = bot.herramientas?.length ? [...bot.herramientas] : ["Read"];
  // «carpeta» es editar sin preguntar adentro de su carpeta: sin Edit y Write en la lista, Claude
  // corría en modo de aceptar ediciones pero sin poder editar nada (ninguna plantilla las trae).
  if (bot.permiso === "carpeta") for (const h of ["Edit", "Write"]) if (!herramientas.includes(h)) herramientas.push(h);
  return acotarALaCarpeta(herramientas, bot.carpeta);
}

/** Read, Edit y Write pelados valen para todo el disco: se acotan a la carpeta del bot, vengan de donde vengan. */
function acotarALaCarpeta(herramientas: readonly string[], carpetaDelBot: string): string[] {
  const carpeta = carpetaDelBot.replace(/[\\/]$/, "");
  return herramientas.map((herramienta) => (herramienta === "Read" || herramienta === "Edit" || herramienta === "Write" ? `${herramienta}(${carpeta}/**)` : herramienta));
}

export function pedidoDeMotor(
  bot: Bot,
  prompt: string,
  soloLectura: boolean,
  senal?: AbortSignal,
  demo = false,
  opciones: { readonly modelo?: string; readonly vueltas?: number; readonly prohibidos?: readonly string[]; readonly herramientas?: readonly string[] } = {},
): PedidoDeCorrida {
  const modelo = opciones.modelo ?? bot.modelo;
  const vueltas = opciones.vueltas ?? (bot.permiso === "carpeta" ? 6 : 6);
  // Las de un disparo o una rutina (`--herramienta`) pasan por el mismo acotado que las del bot.
  const pedidas = opciones.herramientas ? acotarALaCarpeta(opciones.herramientas, bot.carpeta) : undefined;
  if (bot.motor === "claude") {
    const args = soloLectura
      ? argumentosDeLectura({ ...(modelo ? { modelo } : {}), vueltas: opciones.vueltas ?? 4, herramientas: pedidas ?? herramientasDeBot(bot) })
      : argumentosDeClaude({ ...(modelo ? { modelo } : {}), permisos: bot.permiso === "carpeta" ? "editar" : "todo", vueltas, ...(opciones.prohibidos ? { prohibidos: opciones.prohibidos } : {}), ...(pedidas ? { herramientas: pedidas } : {}), ...(bot.permiso === "carpeta" && !pedidas ? { herramientas: herramientasDeBot(bot) } : {}) });
    return { bot, prompt, cmd: "claude", args, entorno: entornoDelBot(bot), permiso: soloLectura ? "solo-lectura" : "permisos", ...(modelo ? { modelo } : {}), ...(senal ? { senal } : {}), ...(demo ? { demo } : {}) };
  }
  const args = argumentosDeCodex(bot.carpeta, join(tmpdir(), "dolphin-bot-respuesta.txt"), modelo ? { modelo } : {}, modelo);
  return {
    bot,
    prompt,
    cmd: "codex",
    args: soloLectura ? args.map((x) => (x === "workspace-write" ? "read-only" : x)) : args,
    permiso: soloLectura ? "solo-lectura" : "permisos",
    ...(modelo ? { modelo } : {}),
    ...(senal ? { senal } : {}),
    entorno: entornoDelBot(bot),
    ...(demo ? { demo } : {}),
  };
}
