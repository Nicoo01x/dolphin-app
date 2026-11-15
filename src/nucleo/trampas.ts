import { diffDe } from "./cambios.js";
import type { HallazgoTrampa } from "./tipos.js";

/** Una línea del diff, con la línea que ocupa en la rama. */
export interface LineaDeDiff {
  readonly archivo: string;
  readonly linea: number;
  readonly signo: "+" | "-" | " ";
  readonly texto: string;
}

const ES_TEST = /(\.test\.|\.spec\.|(^|\/)tests?\/|__tests__)/i;
const ES_WORKFLOW = /^\.github\/workflows\//i;
const ES_RUNNER = /(?:^|\/)(?:vitest\.config\.[^/]+|jest\.config\.[^/]+|playwright\.config\.[^/]+|pytest\.ini|pyproject\.toml)$/i;
const ES_TSCONFIG = /(?:^|\/)tsconfig[^/]*\.json$/i;

/** Busca trampas en el diff de un worktree contra su base. */
export async function trampasDe(ruta: string, contra = "HEAD"): Promise<HallazgoTrampa[]> {
  return hallazgosDeTrampas(await diffDe(ruta, contra));
}

/** Alias descriptivo para quienes consumen la vigilancia sin conocer el archivo. */
export function hallazgosDeTrampas(diff: string): HallazgoTrampa[] {
  const lineas = lineasDeDiff(diff);
  const hallazgos: HallazgoTrampa[] = [];

  for (const linea of lineas) {
    if (linea.signo !== "+") continue;
    if (ES_TEST.test(linea.archivo)) {
      if (/\.skip\(|\.only\(|\b(?:xit|xdescribe)\(|\bit\.todo\(/.test(linea.texto) || /\b(?:test|describe)\.skip\b/.test(linea.texto)) {
        hallazgos.push({ tipo: "test-salteado", archivo: linea.archivo, linea: linea.linea, detalle: "La rama agregó un test salteado o aislado; así puede dejar verde el portón sin probar el comportamiento." });
      }
      continue;
    }

    const silenciador = silenciadorDe(linea.texto);
    if (silenciador) hallazgos.push({ tipo: "silenciador", archivo: linea.archivo, linea: linea.linea, detalle: `La rama agregó ${silenciador}; eso tapa un error del código y hace menos confiable la verificación.` });
  }

  hallazgos.push(...aflojamientosDeVerificadores(lineas));
  return hallazgos;
}

/** Cuenta asserts que se quitaron de cada archivo de test modificado. */
export function asercionesQuitadasDeDiff(diff: string): ReadonlyMap<string, number> {
  const cantidades = new Map<string, number>();
  for (const linea of lineasDeDiff(diff)) {
    if (linea.signo !== "-" || !ES_TEST.test(linea.archivo)) continue;
    const cantidad = linea.texto.match(/\bexpect\s*\(|\bassert(?:\s*\(|\.\w+\s*\()/g)?.length ?? 0;
    if (cantidad > 0) cantidades.set(linea.archivo, (cantidades.get(linea.archivo) ?? 0) + cantidad);
  }
  return cantidades;
}

/** El diff unificado, convertido a líneas útiles para la vigilancia. */
export function lineasDeDiff(diff: string): LineaDeDiff[] {
  const resultado: LineaDeDiff[] = [];
  let archivo = "";
  let lineaNueva = 0;
  let enHunk = false;
  for (const cruda of diff.split(/\r?\n/)) {
    if (cruda.startsWith("--- a/")) {
      archivo = cruda.slice(6).replace(/\\/g, "/");
      continue;
    }
    if (cruda.startsWith("+++ b/")) {
      archivo = cruda.slice(6).replace(/\\/g, "/");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(cruda);
    if (hunk) {
      lineaNueva = Math.max(1, Number.parseInt(hunk[1]!, 10));
      enHunk = true;
      continue;
    }
    if (!archivo || !enHunk || cruda === "\\ No newline at end of file") continue;
    const signo = cruda[0];
    if (signo === "+" || signo === "-") {
      resultado.push({ archivo, linea: lineaNueva, signo, texto: cruda.slice(1) });
      if (signo === "+") lineaNueva += 1;
    } else if (signo === " ") {
      resultado.push({ archivo, linea: lineaNueva, signo: " ", texto: cruda.slice(1) });
      lineaNueva += 1;
    }
  }
  return resultado;
}

function silenciadorDe(texto: string): string | undefined {
  if (/@ts-ignore\b/.test(texto)) return "@ts-ignore";
  if (/@ts-nocheck\b/.test(texto)) return "@ts-nocheck";
  if (/@ts-expect-error\b/.test(texto) && texto.slice(texto.indexOf("@ts-expect-error") + 16).trim() === "") return "@ts-expect-error sin explicación";
  if (/eslint-disable\b/.test(texto)) return "eslint-disable";
  if (/oxlint-disable\b/.test(texto)) return "oxlint-disable";
  if (/#\s*type:\s*ignore\b/.test(texto)) return "# type: ignore";
  return undefined;
}

function aflojamientosDeVerificadores(lineas: readonly LineaDeDiff[]): HallazgoTrampa[] {
  const hallazgos: HallazgoTrampa[] = [];
  const porArchivo = new Map<string, LineaDeDiff[]>();
  for (const linea of lineas) porArchivo.set(linea.archivo, [...(porArchivo.get(linea.archivo) ?? []), linea]);

  for (const [archivo, cambios] of porArchivo) {
    if (archivo === "package.json") hallazgos.push(...aflojaPackage(cambios));
    if (ES_TSCONFIG.test(archivo)) hallazgos.push(...aflojaTsconfig(cambios));
    if (ES_RUNNER.test(archivo)) hallazgos.push(...aflojaRunner(cambios));
    if (ES_WORKFLOW.test(archivo)) hallazgos.push(...aflojaWorkflow(cambios));
    if (archivo === "dolphin.config.json") hallazgos.push(...aflojaDolphin(cambios));
  }
  return hallazgos;
}

function aflojaPackage(cambios: readonly LineaDeDiff[]): HallazgoTrampa[] {
  return cambios.filter((c) => {
    if (c.signo !== "+") return false;
    const match = /"(?:test|lint|typecheck)"\s*:\s*"([^"]*)"/.exec(c.texto);
    return match !== null && /^(?:echo\b|true\b|:)(?!.*\b(?:test|lint|typecheck)\b)/i.test(match[1]!.trim());
  }).map((c) => hallazgo(c, "La rama cambió un script de verificación por un comando que no verifica; así el portón puede quedar verde sin revisar el código."));
}

function aflojaTsconfig(cambios: readonly LineaDeDiff[]): HallazgoTrampa[] {
  return cambios.filter((c) => (c.signo === "+" && /"(?:strict|noImplicitAny)"\s*:\s*false\b/.test(c.texto)) || (c.signo === "-" && /"(?:strict|noImplicitAny)"\s*:\s*true\b/.test(c.texto))).map((c) => hallazgo(c, "La rama aflojó el tipado estricto; errores que antes frenaban la verificación ahora pueden pasar."));
}

function aflojaRunner(cambios: readonly LineaDeDiff[]): HallazgoTrampa[] {
  return cambios.filter((c) => c.signo === "+" && /(?:exclude|ignore|testPathIgnorePatterns|testpaths?)\b.*(?:test|spec)/i.test(c.texto)).map((c) => hallazgo(c, "La rama excluyó pruebas de la configuración del runner; el portón deja de mirar parte del comportamiento."));
}

function aflojaWorkflow(cambios: readonly LineaDeDiff[]): HallazgoTrampa[] {
  const verifica = cambios.some((c) => /(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck)|\b(?:vitest|jest|pytest)\b/i.test(c.texto));
  return cambios.filter((c) => {
    if (c.signo === "-" && /(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck)|\b(?:vitest|jest|pytest)\b/i.test(c.texto)) return true;
    return c.signo === "+" && verifica && /(?:continue-on-error\s*:\s*true|if\s*:\s*(?:false|0)|run\s*:\s*(?:echo|true|:)|\|\|\s*true)/i.test(c.texto);
  }).map((c) => hallazgo(c, "La rama aflojó el workflow de verificación; una comprobación dejó de ejecutarse o puede fallar sin frenar el cambio."));
}

function aflojaDolphin(cambios: readonly LineaDeDiff[]): HallazgoTrampa[] {
  const viejas = cambios.filter((c) => c.signo === "-").map((c) => ({ ...c, fases: fasesDe(c.texto) })).filter((c) => c.fases);
  const nuevas = cambios.filter((c) => c.signo === "+").map((c) => ({ ...c, fases: fasesDe(c.texto) })).filter((c) => c.fases);
  const hallazgos: HallazgoTrampa[] = [];
  for (const nueva of nuevas) {
    const vieja = viejas.find((c) => c.fases!.clave === nueva.fases!.clave);
    if (vieja && nueva.fases!.nombres.length < vieja.fases!.nombres.length) hallazgos.push(hallazgo(nueva, "La rama sacó una fase del portón en dolphin.config.json; una comprobación menos puede ocultar una regresión."));
  }
  let enListaDeFases = false;
  for (const cambio of cambios) {
    if (fasesDe(cambio.texto)) {
      enListaDeFases = /\[/.test(cambio.texto) && !/\]\s*[,}]?\s*$/.test(cambio.texto);
      continue;
    }
    if (/(?:"fases"|"verificar"|"porton")\s*:\s*\[/.test(cambio.texto)) {
      enListaDeFases = true;
      continue;
    }
    if (enListaDeFases && cambio.signo === "-" && /"[^"\\]+"/.test(cambio.texto)) hallazgos.push(hallazgo(cambio, "La rama sacó una fase del portón en dolphin.config.json; una comprobación menos puede ocultar una regresión."));
    if (enListaDeFases && /\]\s*[,}]?\s*$/.test(cambio.texto)) enListaDeFases = false;
  }
  return hallazgos;
}

function fasesDe(texto: string): { clave: string; nombres: string[] } | undefined {
  const match = /"(fases|verificar|porton)"\s*:\s*\[([^\]]*)\]/i.exec(texto);
  if (!match) return undefined;
  return { clave: match[1]!.toLowerCase(), nombres: [...match[2]!.matchAll(/"([^"\\]+)"/g)].map((m) => m[1]!) };
}

function hallazgo(linea: LineaDeDiff, detalle: string): HallazgoTrampa {
  return { tipo: "verificador-aflojado", archivo: linea.archivo, linea: linea.linea, detalle };
}

export function resumirTrampas(hallazgos: readonly HallazgoTrampa[]): string {
  return hallazgos.slice(0, 3).map((h) => `${h.archivo}:${h.linea} (${h.detalle})`).join("; ") + (hallazgos.length > 3 ? ` y ${hallazgos.length - 3} más` : "");
}
