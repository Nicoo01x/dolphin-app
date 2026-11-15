/**
 * La configuración de la fase `uso` (`dolphin.config.json` → `uso`) y lo que
 * se hace con ella antes de lanzar nada: validarla y reemplazar `{perfil}` y
 * `{puerto}` en el entorno. Todo puro, para probarlo sin lanzar una app.
 *
 * ```json
 * "uso": {
 *   "levantar": "pnpm dev",
 *   "cwd": "escritorio",
 *   "tipo": "electron",
 *   "entorno": { "MI_APP_PERFIL": "{perfil}", "MI_APP_CDP": "{puerto}" }
 * }
 * ```
 */

export interface ConfigDeUso {
  /** El comando que levanta la app; corre en el universo (en `cwd`, si hay). Admite `{perfil}` y `{puerto}`. */
  readonly levantar: string;
  /** Subcarpeta del universo donde corre el comando («escritorio»). */
  readonly cwd?: string;
  /** `electron`: la app abre una ventana con depuración remota. `web`: un servidor que se abre en un Chrome. */
  readonly tipo: "electron" | "web";
  /**
   * Las variables que recibe la app. `{perfil}` es una carpeta recién creada que se borra al terminar;
   * `{puerto}` es el de depuración remota en electron y el de la app en web.
   */
  readonly entorno?: Readonly<Record<string, string>>;
  /**
   * Qué se espera antes de dar la app por lista. `cdp` (electron, por defecto): que el puerto de
   * depuración liste una página. `http` (web, por defecto): que `url` conteste; en electron suma esa
   * espera a la del puerto, para apps con un servidor propio.
   */
  readonly listaCuando?: "cdp" | "http";
  /** Dónde contesta la app web, con `{puerto}`: «http://127.0.0.1:{puerto}/». */
  readonly url?: string;
  /** Cuánto esperar a que levante, en ms (por defecto 60 s: una app de escritorio tarda más que un servidor). */
  readonly espera?: number;
  /** El modelo que usa la app. Por defecto, el barato del reparto, siempre distinto del que escribió. */
  readonly modelo?: string;
  /** Cuántas vueltas de herramientas puede dar el modelo (por defecto 40). */
  readonly vueltas?: number;
}

export interface Valores {
  readonly perfil: string;
  readonly puerto: number;
}

/** `{perfil}` y `{puerto}` (también `{PUERTO}`, como en `pantalla`). */
export function reemplazar(texto: string, valores: Valores): string {
  return texto.replace(/\{perfil\}/gi, valores.perfil).replace(/\{puerto\}/gi, String(valores.puerto));
}

/** El entorno de la app ya con sus valores. El perfil y el puerto viajan SOLO por donde la persona dijo. */
export function entornoDeUso(config: Pick<ConfigDeUso, "entorno">, valores: Valores): Record<string, string> {
  return Object.fromEntries(Object.entries(config.entorno ?? {}).map(([variable, valor]) => [variable, reemplazar(valor, valores)]));
}

/** Cómo se espera la app: el default de cada tipo, salvo que el repo diga otra cosa. */
export function esperaDe(config: Pick<ConfigDeUso, "tipo" | "listaCuando">): "cdp" | "http" {
  return config.listaCuando ?? (config.tipo === "electron" ? "cdp" : "http");
}

const usa = (texto: string | undefined, que: RegExp) => texto !== undefined && que.test(texto);

/**
 * Lo que está mal en lo que escribió la persona, en voz humana. Vacío = sirve.
 * Una config a medias no debe llegar a lanzar procesos: se dice qué falta y la fase se saltea.
 */
export function problemasDeConfigDeUso(valor: unknown): string[] {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return ["«uso» tiene que ser un objeto"];
  const c = valor as Record<string, unknown>;
  const problemas: string[] = [];
  if (typeof c["levantar"] !== "string" || c["levantar"].trim() === "") problemas.push("«uso.levantar» es obligatorio: el comando que levanta la app");
  if (c["tipo"] !== "electron" && c["tipo"] !== "web") problemas.push("«uso.tipo» tiene que ser «electron» o «web»");
  if (c["cwd"] !== undefined && (typeof c["cwd"] !== "string" || /^([a-z]:|[\\/])|(^|[\\/])\.\.([\\/]|$)/i.test(c["cwd"]))) {
    problemas.push("«uso.cwd» es una carpeta DENTRO del universo, sin «..» ni ruta absoluta");
  }
  const entorno = c["entorno"];
  if (entorno !== undefined) {
    if (typeof entorno !== "object" || entorno === null || Array.isArray(entorno) || !Object.values(entorno).every((v) => typeof v === "string")) {
      problemas.push("«uso.entorno» es un objeto de texto: { «VARIABLE»: «valor» }");
    }
  }
  if (c["listaCuando"] !== undefined && c["listaCuando"] !== "cdp" && c["listaCuando"] !== "http") problemas.push("«uso.listaCuando» es «cdp» o «http»");
  for (const clave of ["espera", "vueltas"]) {
    const n = c[clave];
    if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n <= 0)) problemas.push(`«uso.${clave}» es un número mayor que cero`);
  }
  if (problemas.length > 0) return problemas;

  const config = c as unknown as ConfigDeUso;
  if (config.tipo === "web") {
    if (!config.url) problemas.push("«uso.url» es obligatoria con tipo «web»: dónde contesta la app");
    if (config.listaCuando === "cdp") problemas.push("con tipo «web» se espera a «http»: el Chrome con depuración lo abre Dolphin");
  } else {
    // Sin el puerto en ningún lado, la app abre su ventana pero no hay por dónde manejarla.
    const textos = [config.levantar, ...Object.values(config.entorno ?? {})];
    if (!textos.some((t) => usa(t, /\{puerto\}/i))) {
      problemas.push("con tipo «electron» hace falta «{puerto}» en «uso.entorno» (o en «uso.levantar»): es el puerto de depuración remota que la app tiene que abrir");
    }
    if (config.listaCuando === "http" && !config.url) problemas.push("«uso.listaCuando»: «http» pide «uso.url»");
  }
  return problemas;
}
