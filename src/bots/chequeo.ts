import { join } from "node:path";
import { correrConPrompt, prepararComando } from "../agentes/ejecutar.js";
import { carpetaDeBots } from "./almacen.js";
import type { Bot, RutinaGuardada } from "./almacen.js";

export interface ResultadoChequeo {
  readonly despertar: boolean;
  readonly datos?: string;
}

export type EjecutarChequeo = (bot: Bot, rutina: RutinaGuardada) => Promise<ResultadoChequeo | undefined>;

// Lo visto la última vez se guarda en la carpeta del bot, no en el repo: ahí era un archivo suelto que
// además aparecía en el propio `git status` que vigila. La ruta va entre comillas simples, escapadas.
const enPowerShell = (ruta: string) => `'${ruta.replace(/'/g, "''")}'`;
const enSh = (ruta: string) => `'${ruta.replace(/'/g, "'\\''")}'`;
const scriptVigia = (windows: boolean, ruta: string): string =>
  windows
    ? "$head = (git rev-parse HEAD 2>$null); $status = (git status --porcelain | Out-String).Trim(); $ruta = " + enPowerShell(ruta) + "; $anterior = Get-Content $ruta -Raw -ErrorAction SilentlyContinue; $actual = @{ head = $head; status = $status } | ConvertTo-Json -Compress; $cambio = $actual -ne $anterior; Set-Content -LiteralPath $ruta -Value $actual -NoNewline; @{ despertar = $cambio; datos = $actual } | ConvertTo-Json -Compress"
    : "head=$(git rev-parse HEAD 2>/dev/null); status=$(git status --porcelain); ruta=" + enSh(ruta) + "; actual=$(printf '{\"head\":\"%s\",\"status\":\"%s\"}' \"$head\" \"$status\"); anterior=$(cat \"$ruta\" 2>/dev/null); [ \"$actual\" = \"$anterior\" ] && despertar=false || despertar=true; printf '%s' \"$actual\" > \"$ruta\"; printf '{\"despertar\":%s,\"datos\":%s}\n' \"$despertar\" \"$actual\"";

const textoDeResultado = (salida: string): ResultadoChequeo | undefined => {
  const ultima = salida.trim().split(/\r?\n/).at(-1);
  if (!ultima) return undefined;
  try {
    const dato = JSON.parse(ultima) as { despertar?: unknown; datos?: unknown };
    if (typeof dato.despertar !== "boolean") return undefined;
    return { despertar: dato.despertar, ...(dato.datos === undefined ? {} : { datos: typeof dato.datos === "string" ? dato.datos : JSON.stringify(dato.datos) }) };
  } catch {
    return undefined;
  }
};

export const correrChequeo: EjecutarChequeo = async (bot, rutina) => {
  const ruta = join(carpetaDeBots(), bot.id, "vigia.json");
  const script = rutina.chequeo === "vigia" ? scriptVigia(process.platform === "win32", ruta) : (rutina.chequeo ?? "");
  const windows = process.platform === "win32";
  const [comando, argumentos] = windows ? ["powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"]] : ["sh", ["-s"]];
  const listo = prepararComando(comando, argumentos);
  if (!listo) return undefined;
  const corrida = await correrConPrompt(listo.cmd, listo.args, script, bot.carpeta, 30_000, undefined, listo.verbatim);
  if (corrida.codigo !== 0) return undefined;
  return textoDeResultado(corrida.salida);
};
