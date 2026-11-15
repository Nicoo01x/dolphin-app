import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { enFila } from "../nucleo/escritura.js";
import { carpetaDeBots } from "./almacen-rutas.js";
import type { Bot } from "./almacen.js";

/** Lo que el bot quiso hacer y no pudo sin permiso: el mensaje para repetirlo con «dale» y lo que dijo que iba a hacer. */
export interface Pendiente {
  readonly id: string;
  readonly mensaje: string;
  readonly quiere: string;
  /** La regla que «Siempre» guardaría: una herramienta concreta o un Bash acotado, nunca Bash pelado. */
  readonly herramienta?: string;
  readonly creado: string;
  readonly vence?: string;
}

export const rutaPendiente = (bot: Bot) => join(carpetaDeBots(), bot.id, "pendiente.json");
export const esperaDePermiso = 120_000;
/** Bots con un «dale» corriendo en este proceso: «Rechazar» no puede contestar «rechazado» mientras tanto. */
export const confirmando = new Set<string>();

export async function guardarPendiente(bot: Bot, dato: Pendiente): Promise<boolean> {
  return enFila(rutaPendiente(bot), async () => {
    const existe = await readFile(rutaPendiente(bot), "utf8").then(() => true, () => false);
    if (existe) return false;
    await writeFile(rutaPendiente(bot), JSON.stringify(dato) + "\n", { encoding: "utf8", flag: "wx" });
    return true;
  });
}

export async function leerPendiente(bot: Bot, ahora = new Date()): Promise<Pendiente | undefined> {
  try {
    const d = JSON.parse(await readFile(rutaPendiente(bot), "utf8")) as Partial<Pendiente>;
    if (typeof d.id !== "string" || typeof d.mensaje !== "string" || typeof d.creado !== "string") return undefined;
    const vence = typeof d.vence === "string" ? d.vence : new Date(Date.parse(d.creado) + esperaDePermiso).toISOString();
    if (Date.parse(vence) <= ahora.getTime()) {
      // La aprobación caduca para no ejecutar una acción que quedó olvidada en Telegram.
      await rm(rutaPendiente(bot), { force: true });
      return undefined;
    }
    return { id: d.id, mensaje: d.mensaje, creado: d.creado, quiere: typeof d.quiere === "string" ? d.quiere : d.mensaje, ...(typeof d.herramienta === "string" ? { herramienta: d.herramienta } : {}), vence };
  } catch {
    return undefined;
  }
}

/** Se reclama con el mismo rename que usa «dale»: si otro proceso lo ganó, el rename falla y no se rechaza nada. */
export async function rechazarPendiente(bot: Bot, id?: string): Promise<boolean> {
  if (confirmando.has(bot.id)) return false;
  const pendiente = await leerPendiente(bot);
  if (!pendiente || (id && pendiente.id !== id)) return false;
  const reclamado = `${rutaPendiente(bot)}.${process.pid}.${randomUUID()}.rechazado`;
  try {
    await rename(rutaPendiente(bot), reclamado);
  } catch {
    return false;
  }
  const tomado = await readFile(reclamado, "utf8").then((x) => (JSON.parse(x) as Partial<Pendiente>).id, () => undefined);
  if (tomado !== pendiente.id) {
    // Entre la lectura y el rename apareció otro pedido: ése no es el que se rechazó.
    await rename(reclamado, rutaPendiente(bot)).catch(() => {});
    return false;
  }
  await rm(reclamado, { force: true });
  return true;
}

const ABIERTOS = new Set(["rm", "del", "sudo", "su", "sh", "bash", "zsh", "pwsh", "powershell", "cmd", "env", "xargs", "eval", "exec", "curl", "wget", "ssh", "scp", "dd", "chmod", "chown", "git push", "git reset", "git clean", "git checkout"]);

/**
 * El comando entre comillas invertidas del pedido, recortado a su prefijo («npm test», «npx vitest run»).
 * Solo si hay uno, sin operadores de shell y con al menos dos palabras: `Bash(rm:*)` o `Bash(node:*)`
 * son tan abiertos como Bash pelado.
 */
function comandoDePermiso(texto: string): string | undefined {
  const fragmentos = [...new Set([...texto.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!.trim()))];
  if (fragmentos.length !== 1 || /[;&|<>$()\\{}*?!"']/.test(fragmentos[0]!)) return undefined;
  const prefijo: string[] = [];
  for (const palabra of fragmentos[0]!.split(/\s+/)) {
    if (prefijo.length === 3 || !/^[a-z0-9][\w.:@/-]*$/i.test(palabra)) break;
    prefijo.push(palabra);
  }
  if (prefijo.length < 2 || ABIERTOS.has(prefijo[0]!.toLowerCase()) || ABIERTOS.has(prefijo.slice(0, 2).join(" ").toLowerCase())) return undefined;
  return prefijo.join(" ");
}

/** La regla que «Siempre» puede guardar para este pedido, o nada si no hay una concreta y acotada. */
export function herramientaDePermiso(texto: string): string | undefined {
  const comando = comandoDePermiso(texto);
  if (comando) return `Bash(${comando}:*)`;
  // Read, Write y Edit los acota a la carpeta herramientasDeBot; Bash sin comando no se guarda nunca.
  return ["Read", "Write", "Edit", "Grep", "Glob", "WebFetch", "WebSearch"].find((herramienta) => new RegExp(`\\b${herramienta}\\b`, "i").test(texto));
}

/** Lo mismo para un pendiente ya guardado, que se vuelve a pasar por las reglas: los viejos traían «Bash» pelado por defecto. */
export function reglaParaSiempre(pendiente: Pendiente): string | undefined {
  const guardada = pendiente.herramienta;
  if (!guardada) return undefined;
  const comando = /^Bash\((.+):\*\)$/.exec(guardada)?.[1];
  return herramientaDePermiso(comando ? `\`${comando}\`` : guardada) === guardada ? guardada : undefined;
}
