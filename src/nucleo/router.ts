/**
 * El router de modelos: quién hace cada trabajo de una siembra.
 *
 * Escribir es lo difícil y paga un modelo bueno; revisar un diff contra la
 * tarea es leer, y lo hace uno barato. Y el que revisa nunca es el mismo
 * que escribió: un modelo no ve sus propios errores, por eso la revisión
 * es independiente o no es.
 *
 * Tres estrategias, en `dolphin.config.json` → `modelos.estrategia`:
 *   calidad      escribe y corrige el caro, revisa el del medio
 *   equilibrada  escribe y corrige el del medio, revisa el barato (la de siempre)
 *   economia     todo con el barato, y sin revisión con modelo: verifican
 *                solo las fases gratis
 * Cada rol se puede fijar a mano (`modelos.escribir`, `.corregir`, `.revisar`)
 * y `--modelo` manda sobre el que escribe.
 *
 * La tabla es el punto de partida, no la última palabra: con cifras propias
 * del repo (ver desempeno.ts) cada estrategia se vuelve una pregunta sobre
 * ellas, y el que escribe es el que la contesta mejor:
 *   calidad      ¿quién pasa más? (cambia solo si otro pasa claramente más)
 *   equilibrada  ¿quién pasa casi lo mismo por menos plata por rama aceptada?
 *   economia     ¿quién sale más barato por rama aceptada, entre los que pasan
 *                al menos la mitad de las veces?
 * Mientras falten cifras, una rama sale a medir al vecino: la última de una
 * siembra de tres o más, o la única de 1 de cada 4 siembras del tipo. Medir
 * nunca abre ramas de más (ver quienMide en siembra.ts).
 */

import { familia, NOMBRE_DE_TIPO, type Rendimiento, type TipoDeTarea } from "./desempeno.js";

export type Motor =
  | "claude"
  | "antigravity"
  | "codex"
  | "gemini"
  | "opencode"
  | "copilot"
  | "cursor"
  | "droid"
  | "amp"
  | "qwen"
  // Cualquier agente que hable ACP: el comando sale de `acp` en dolphin.config.json (ver agentes/acp.ts).
  | "acp"
  | "mentira";

/** Los motores que hay. Lo que llega de afuera (la consola, la línea de comandos) se mira contra esta lista. */
export const MOTORES: readonly Motor[] = [
  "claude",
  "antigravity",
  "codex",
  // Los de la tabla de motores.ts: una fila cada uno, sin módulo propio.
  "gemini",
  "opencode",
  "copilot",
  "cursor",
  "droid",
  "amp",
  "qwen",
  // Uno solo para todos los que hablan ACP: el comando lo dice el repo.
  "acp",
  "mentira",
];

/** El motor que se pidió, si es uno de los que hay; si no, el de por defecto. */
export function motorDe(pedido: unknown, porDefecto: Motor = "claude"): Motor {
  return MOTORES.find((m) => m === pedido) ?? porDefecto;
}

export type Rol = "escribir" | "corregir" | "revisar";
export type Estrategia = "calidad" | "equilibrada" | "economia";

export interface ConfigDeModelos {
  readonly estrategia?: Estrategia;
  readonly escribir?: string;
  readonly corregir?: string;
  /** `false` apaga la revisión con modelo. */
  readonly revisar?: string | false;
  /** Quién piensa los planes de Thinking (ver plan.ts). */
  readonly planificar?: string;
}

/** Qué modelo hizo cada trabajo. Va a la cosecha tal cual. */
export interface Reparto {
  readonly estrategia: Estrategia;
  /** Sin valor: el modelo por defecto del motor (Codex, Antigravity). */
  readonly escribir?: string;
  readonly corregir?: string;
  /** null: no hubo revisión con modelo. */
  readonly revisar: string | null;
  /** Qué dijeron las cifras propias sobre quién escribe, con los números. */
  readonly porDatos?: string;
  /** Un universo de la siembra escribe con este modelo, para medirlo. */
  readonly explorar?: string;
}

/** Lo medido en este repo para el tipo de tarea que se va a sembrar. */
export interface DatosDeDesempeno {
  readonly tipo: TipoDeTarea;
  readonly rendimientos: readonly Rendimiento[];
}

/** Cuántas ramas de un tipo de tarea hacen falta para creerle a una cifra. */
export const MUESTRAS_MINIMAS = 5;

/**
 * Cuánto peor puede pasar un modelo para que «equilibrada» lo prefiera por
 * barato, y cuánto mejor tiene que pasar otro para que «calidad» cambie.
 * Con diez ramas, diez puntos son una rama: menos que eso es ruido.
 */
const MARGEN = 0.1;

/** «Economía» elige entre los que pasan al menos la mitad de las veces. */
const PISO_DE_ECONOMIA = 0.5;

/** La escala de Claude, de caro a barato. La revisión siempre la hace Claude. */
const ESCALA = { caro: "opus", medio: "sonnet", barato: "haiku" } as const;
type Escalon = keyof typeof ESCALA;
const DE_CARO_A_BARATO: readonly string[] = [ESCALA.caro, ESCALA.medio, ESCALA.barato];

/**
 * A quién sale a medir cada estrategia mientras le faltan cifras: la
 * equilibrada, si el barato alcanza; la económica, si el del medio no
 * sale más barato por rama aceptada. Calidad no gasta en medir: usa lo
 * que midieron las otras.
 */
const PARA_MEDIR: Readonly<Record<Estrategia, string | null>> = {
  calidad: null,
  equilibrada: ESCALA.barato,
  economia: ESCALA.medio,
};

const ESTRATEGIAS: Record<Estrategia, Record<Rol, Escalon | null>> = {
  calidad: { escribir: "caro", corregir: "caro", revisar: "medio" },
  equilibrada: { escribir: "medio", corregir: "medio", revisar: "barato" },
  economia: { escribir: "barato", corregir: "barato", revisar: null },
};

export const ESTRATEGIA_POR_DEFECTO: Estrategia = "equilibrada";

export function esEstrategia(valor: unknown): valor is Estrategia {
  return valor === "calidad" || valor === "equilibrada" || valor === "economia";
}

/**
 * Reparte los roles. Para Claude, la estrategia elige el modelo de cada uno
 * —y con cifras propias, las cifras—; para los otros motores, escribir y
 * corregir quedan con el modelo que se pidió (o el suyo por defecto) y la
 * revisión la hace Claude: además de barata, es otro modelo de otra casa.
 */
export function repartir(
  motor: Motor,
  config: ConfigDeModelos = {},
  pedido: { modelo?: string } = {},
  datos?: DatosDeDesempeno,
): Reparto {
  const estrategia = config.estrategia ?? ESTRATEGIA_POR_DEFECTO;
  const plan = ESTRATEGIAS[estrategia];

  // El de prueba no tiene modelos que repartir: nada que pagar, nada que revisar.
  if (motor === "mentira") return { estrategia, escribir: "demo", corregir: "demo", revisar: null };

  const porEscala = (rol: Rol) => (motor === "claude" && plan[rol] ? ESCALA[plan[rol]!] : undefined);
  const escritorFijado = pedido.modelo ?? config.escribir;
  // Lo fijado a mano manda sobre las cifras: quien lo fijó sabrá por qué.
  const decision =
    motor === "claude" && !escritorFijado && datos ? decidirPorDatos(estrategia, porEscala("escribir")!, datos) : undefined;
  const escribir = escritorFijado ?? decision?.modelo ?? porEscala("escribir");
  // Quien corrige es, por defecto, quien escribió: conoce su propio cambio.
  // Si el que escribe se eligió a mano, el que corrige lo sigue.
  const corregir = config.corregir ?? escritorFijado ?? porEscala("corregir") ?? escribir;

  let revisar: string | null;
  if (config.revisar === false) revisar = null;
  else if (typeof config.revisar === "string") revisar = config.revisar;
  else revisar = plan.revisar ? ESCALA[plan.revisar] : null;

  // Independiente o no es: si el que revisa quedó igual al que escribe, se
  // baja un escalón (o se sube, si ya era el más barato).
  if (revisar !== null && escribir !== undefined && mismoModelo(revisar, escribir)) {
    revisar = otroEscalon(revisar);
  }

  return {
    estrategia,
    ...(escribir !== undefined ? { escribir } : {}),
    ...(corregir !== undefined ? { corregir } : {}),
    revisar,
    ...(decision?.porQue ? { porDatos: decision.porQue } : {}),
    ...(decision?.explorar ? { explorar: decision.explorar } : {}),
  };
}

/**
 * La pregunta de cada estrategia, contestada con las cifras del tipo de
 * tarea. Solo decide si el modelo de la tabla está medido y hay al menos
 * otro con qué compararlo: cambiar a ciegas por un número suelto sería
 * peor que la tabla.
 */
function decidirPorDatos(
  estrategia: Estrategia,
  porDefecto: string,
  datos: DatosDeDesempeno,
): { modelo?: string; porQue?: string; explorar?: string } {
  const medidos = datos.rendimientos.filter((r) => DE_CARO_A_BARATO.includes(r.modelo) && r.intentos >= MUESTRAS_MINIMAS);
  const medir = PARA_MEDIR[estrategia];
  const explorar = medir !== null && !medidos.some((r) => r.modelo === medir) ? { explorar: medir } : {};

  const defecto = medidos.find((r) => r.modelo === familia(porDefecto));
  let otros = medidos.filter((r) => r !== defecto);
  if (!defecto || otros.length === 0) return explorar;

  const nombre = estrategia === "economia" ? "economía" : estrategia;
  // La plata se compara solo entre los que dijeron cuánto cuestan: un costo
  // que no se sabe no es barato ni caro, y un cero inventado ganaría siempre.
  if (estrategia !== "calidad") {
    if (defecto.costoMedio === null) {
      return {
        porQue: `En ${NOMBRE_DE_TIPO[datos.tipo]}, ${defecto.modelo} no informó lo que cuesta: con la estrategia ${nombre}, sigue escribiendo ${defecto.modelo}.`,
        ...explorar,
      };
    }
    otros = otros.filter((r) => r.costoMedio !== null);
    if (otros.length === 0) return explorar;
  }

  const costo = (r: Rendimiento) => r.costoPorAcierto ?? Number.POSITIVE_INFINITY;
  // El de la tabla va primero: en un empate se queda, cambiar tiene que valer la pena.
  const todos = [defecto, ...otros];
  const masBarato = (lista: readonly Rendimiento[]) => lista.reduce((a, b) => (costo(b) < costo(a) ? b : a));

  // Las tasas en milésimas enteras: en coma flotante 0,2 + 0,1 no es 0,3, y el
  // mismo margen de diez puntos decidía distinto según el redondeo (8/10 contra
  // 7/10 cambiaba de modelo; 3/10 contra 2/10, no).
  const milesimas = (x: number) => Math.round(x * 1000);
  let elegido: Rendimiento;
  if (estrategia === "calidad") {
    const mejorOtro = otros.reduce((a, b) => (milesimas(b.tasa) > milesimas(a.tasa) ? b : a));
    elegido = milesimas(mejorOtro.tasa) >= milesimas(defecto.tasa) + milesimas(MARGEN) ? mejorOtro : defecto;
  } else if (estrategia === "equilibrada") {
    const tope = Math.max(...todos.map((r) => milesimas(r.tasa)));
    elegido = masBarato(todos.filter((r) => milesimas(r.tasa) >= tope - milesimas(MARGEN)));
  } else {
    // Barato por rama aceptada, pero que acepte: uno que pasa una de cada
    // diez sale barato por acierto y deja casi todas las siembras vacías.
    const pasables = todos.filter((r) => r.tasa >= PISO_DE_ECONOMIA);
    elegido = masBarato(pasables.length > 0 ? pasables : todos);
  }

  const rival = elegido === defecto ? otros.reduce((a, b) => (b.tasa > a.tasa ? b : a)) : defecto;
  const enPalabras = (r: Rendimiento) =>
    `${r.modelo} pasó ${r.pasaron} de ${r.intentos} (${r.costoPorAcierto !== null ? `${dolares(r.costoPorAcierto)} por rama que pasa` : r.pasaron === 0 ? "ninguna pasó" : "sin costo conocido"})`;
  const conclusion =
    elegido === defecto ? `sigue escribiendo ${elegido.modelo}` : `escribe ${elegido.modelo} en vez de ${defecto.modelo}`;
  return {
    ...(elegido !== defecto ? { modelo: elegido.modelo } : {}),
    porQue: `En ${NOMBRE_DE_TIPO[datos.tipo]}, ${enPalabras(elegido)} y ${enPalabras(rival)}: con la estrategia ${nombre}, ${conclusion}.`,
    ...explorar,
  };
}

function dolares(monto: number): string {
  if (monto < 0.01) return "menos de 1¢";
  return `US$ ${monto.toFixed(2).replace(".", ",")}`;
}

/**
 * El modelo de una tarea de un plan según su escalón. Para Claude, la escala
 * de siempre; los otros motores escriben con el suyo (el escalón no les dice
 * nada) y la revisión sigue siendo de Claude.
 */
export function modeloDelEscalon(motor: Motor, escalon: Escalon): string | undefined {
  return motor === "claude" ? ESCALA[escalon] : undefined;
}

/** Quién piensa los planes: partir un objetivo pide entender el repo, y el del medio alcanza. */
export function modeloDelPlanificador(config: ConfigDeModelos = {}): string {
  return config.planificar ?? ESCALA.medio;
}

export function mismoModelo(a: string, b: string): boolean {
  const normal = (m: string) => m.toLowerCase().replace(/^claude-/, "").split("-")[0];
  return normal(a) === normal(b);
}

export function otroEscalon(modelo: string): string {
  const orden: readonly string[] = [ESCALA.caro, ESCALA.medio, ESCALA.barato];
  const i = orden.findIndex((m) => mismoModelo(m, modelo));
  if (i < 0) return ESCALA.barato;
  return i < orden.length - 1 ? orden[i + 1]! : orden[i - 1]!;
}

/** En una línea, para el CLI y los partes: «escribe sonnet · revisa haiku». */
export function contarReparto(r: Reparto): string {
  const partes = [`escribe ${r.escribir ?? "el modelo por defecto"}`];
  if (r.corregir && r.corregir !== r.escribir) partes.push(`corrige ${r.corregir}`);
  partes.push(r.revisar ? `revisa ${r.revisar}` : "sin revisión con modelo");
  if (r.explorar) partes.push(`una rama mide a ${r.explorar}`);
  return partes.join(" · ");
}
