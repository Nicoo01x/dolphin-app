import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Las cuentas de Claude con las que puede trabajar Dolphin, y cuál usa ahora.
 *
 * Las agrega la app de escritorio (Ajustes → cuentas): cada una es una carpeta propia de Claude
 * Code (`<datos del escritorio>/claude-profiles/<id>/home`) con su login adentro. Además está la de
 * siempre, `~/.claude`. Para que una corrida use otra cuenta alcanza con pasarle su carpeta en
 * CLAUDE_CONFIG_DIR. Acá solo se lee el email de cada una: el login no se toca.
 *
 * Cuando Claude contesta que la cuenta llegó a su límite de uso, se marca agotada y la próxima
 * corrida va con otra que tenga cupo (ver `conCuentaDeClaude`).
 */

export interface Cuenta {
  readonly id: string;
  readonly email: string | null;
  /** La carpeta de Claude Code de la cuenta; null es la de siempre (`~/.claude`). */
  readonly home: string | null;
}

export const CUENTA_DE_SIEMPRE = "normal";

/** Las claves que le ganan a la carpeta de la cuenta: con una puesta, Claude no usaría su login. */
const CLAVES_QUE_PISAN = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "AWS_BEARER_TOKEN_BEDROCK"] as const;

/** Dónde guarda sus datos la app de escritorio: la que la lanzó, la instalada y la de desarrollo. */
export function carpetasDelEscritorio(entorno: NodeJS.ProcessEnv = process.env, casa = homedir()): string[] {
  const appData = entorno.APPDATA ?? (process.platform === "darwin" ? join(casa, "Library", "Application Support") : join(casa, ".config"));
  return [...new Set([entorno.DOLPHIN_USER_DATA_PATH, join(appData, "Dolphin"), join(appData, "dolphin-dev")].filter((x): x is string => !!x))];
}

async function emailDe(archivo: string): Promise<string | null> {
  try {
    const estado = JSON.parse(await readFile(archivo, "utf8")) as { oauthAccount?: { emailAddress?: unknown } };
    const email = estado.oauthAccount?.emailAddress;
    return typeof email === "string" && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

/** La de siempre primero, después las del escritorio; una cuenta repetida (mismo email) va una vez. */
export async function leerCuentasDeClaude(entorno: NodeJS.ProcessEnv = process.env, casa = homedir()): Promise<Cuenta[]> {
  const cuentas: Cuenta[] = [{ id: CUENTA_DE_SIEMPRE, email: await emailDe(join(casa, ".claude.json")), home: null }];
  for (const datos of carpetasDelEscritorio(entorno, casa)) {
    const perfiles = join(datos, "claude-profiles");
    const ids = await readdir(perfiles, { withFileTypes: true }).catch(() => []);
    for (const d of ids) {
      if (!d.isDirectory()) continue;
      const home = join(perfiles, d.name, "home");
      const email = await emailDe(join(home, ".claude.json"));
      // Sin login todavía no es una cuenta que pueda trabajar.
      if (!email || cuentas.some((c) => c.email === email)) continue;
      cuentas.push({ id: d.name, email, home });
    }
  }
  return cuentas;
}

/** El entorno de una corrida con esa cuenta: su carpeta, y sin las claves que la pisarían. */
export function entornoDeCuenta(cuenta: Cuenta | null): Record<string, string | undefined> {
  if (!cuenta?.home) return {};
  return { CLAUDE_CONFIG_DIR: cuenta.home, ...Object.fromEntries(CLAVES_QUE_PISAN.map((k) => [k, undefined])) };
}

/** Lo que dice Claude cuando una cuenta llegó a su límite de uso (el de 5 horas, el semanal, el extra). */
export function esLimiteDeUso(texto: string): boolean {
  return /usage limit|limit reached|limit (?:has been )?exceeded|rate.?limit(?:ed)?|out of (?:extra )?usage|5-hour limit|weekly limit|session limit|you've hit your limit/i.test(texto);
}

// --- La cuenta en uso: una por proceso (la terminal, o un CLI) ---

let cuentas: Cuenta[] | null = null;
let elegida = CUENTA_DE_SIEMPRE;
const agotadas = new Set<string>();
const oyentes = new Set<(cambio: { de: Cuenta | null; a: Cuenta; porLimite: boolean }) => void>();

/** Carga las cuentas (una vez por proceso; `recargar` vuelve a leerlas). */
export async function cuentasDeClaude(recargar = false, entorno: NodeJS.ProcessEnv = process.env, casa = homedir()): Promise<Cuenta[]> {
  if (!cuentas || recargar) cuentas = await leerCuentasDeClaude(entorno, casa);
  return cuentas;
}

export function cuentaEnUso(): Cuenta | null {
  return cuentas?.find((c) => c.id === elegida) ?? null;
}

export function cuentaAgotada(id: string): boolean {
  return agotadas.has(id);
}

/** Avisa cada cambio de cuenta (lo muestra la terminal). Devuelve con qué dejar de escuchar. */
export function alCambiarDeCuenta(oyente: (cambio: { de: Cuenta | null; a: Cuenta; porLimite: boolean }) => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function cambiarA(a: Cuenta, porLimite: boolean): void {
  const de = cuentaEnUso();
  elegida = a.id;
  for (const oyente of oyentes) {
    try {
      oyente({ de, a, porLimite });
    } catch {
      // un oyente roto no frena el cambio
    }
  }
}

/** Elegir a mano: vuelve a estar disponible aunque estuviera agotada (quizás ya se renovó). */
export function elegirCuenta(id: string): Cuenta | null {
  const cuenta = cuentas?.find((c) => c.id === id) ?? null;
  if (!cuenta) return null;
  agotadas.delete(id);
  cambiarA(cuenta, false);
  return cuenta;
}

/** La cuenta en uso se quedó sin cupo: pasa a la próxima que tenga. null si no queda ninguna. */
export function pasarALaSiguiente(usada: Cuenta | null = cuentaEnUso()): Cuenta | null {
  const elegidaAhora = cuentaEnUso();
  // Otra corrida pudo rotar la cuenta mientras esta esperaba: no marques como agotada una cuenta
  // que esta corrida no usó. Reintentá con la que quedó elegida.
  if (!usada || usada.id !== elegidaAhora?.id) return elegidaAhora;
  agotadas.add(usada.id);
  const lista = cuentas ?? [];
  const desde = Math.max(0, lista.findIndex((c) => c.id === elegida));
  for (let i = 1; i <= lista.length; i++) {
    const otra = lista[(desde + i) % lista.length]!;
    if (!agotadas.has(otra.id)) {
      cambiarA(otra, true);
      return otra;
    }
  }
  return null;
}

/** Para los tests: vuelve al estado de recién abierto. */
export function olvidarCuentas(): void {
  cuentas = null;
  elegida = CUENTA_DE_SIEMPRE;
  agotadas.clear();
  oyentes.clear();
}

/**
 * Corre algo de Claude con la cuenta en uso. Si contesta que llegó al límite (`seAgoto` mira lo que
 * devolvió), pasa a la siguiente con cupo y lo vuelve a correr; sin otra, devuelve lo último.
 */
export async function conCuentaDeClaude<T>(correr: (entorno: Record<string, string | undefined>) => Promise<T>, seAgoto: (resultado: T) => boolean): Promise<T> {
  await cuentasDeClaude();
  for (;;) {
    const usada = cuentaEnUso();
    const resultado = await correr(entornoDeCuenta(usada));
    if (!seAgoto(resultado) || !pasarALaSiguiente(usada)) return resultado;
  }
}
