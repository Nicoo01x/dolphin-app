import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { ENFOQUES, type Enfoque } from "./enfoques.js";
import { NOMBRE_DE_TIPO, type Registro, type TipoDeTarea } from "./desempeno.js";

/**
 * Que Dolphin mejore su propia forma de trabajar (ver docs/mejorarse.md).
 *
 * No toca los pesos de ningún modelo: lo que cambia es CÓMO les pide las cosas. La unidad de mejora
 * es un enfoque (ver enfoques.ts), que es la instrucción con que se encara una tarea. El ciclo:
 *
 *   1. `flaquezas()` mira el historial y encuentra dónde falla seguido (qué tipo de tarea, qué fase
 *      del portón la rebota).
 *   2. Un modelo lee SOLO la mitad «de diseño» de esas fallas y propone una causa y un enfoque nuevo.
 *   3. `juzgar()` compara ese enfoque contra el de siempre en la mitad RESERVADA, que el modelo
 *      nunca vio, más un control de otros tipos para que no mejore acá rompiendo allá.
 *   4. Si gana de verdad, queda como propuesta esperando tu ok. Nunca se adopta sola.
 *
 * Las reglas que lo hacen honesto:
 *
 * - **La mitad con que se piensa no es la mitad con que se prueba.** La partición es por el texto de
 *   la tarea, no por fecha: una tarea repetida cae siempre del mismo lado y no se filtra.
 * - **Probar cuesta plata de verdad**: cada tarea del ensayo es un agente escribiendo. Por eso el
 *   ensayo se pide a mano, con tope, y acá entra inyectado (`CorrerEnsayo`).
 * - **Nunca aprende a romper su propio portón** (ver `esSeguro`): un ángulo que diga saltear tests o
 *   aflojar la verificación mejoraría los números sin mejorar nada, y se rechaza antes de probarlo.
 * - **Lo adoptado se sigue midiendo** (ver `comoVaLoAdoptado`): si en producción rinde peor que el
 *   resto, se avisa para retirarlo. Adoptar no es para siempre.
 *
 * De la literatura (los dos son MIT): de **Prime Agent** (arXiv 2608.23552) tomamos que el prompt
 * base es intocable y que lo aprendido vive aparte, versionado y con de dónde salió, para poder
 * volver atrás; su propio informe cuenta que un agente guardó como habilidad un atajo que hacía
 * trampa, y que les falta «validación independiente del estado» — eso es `esSeguro` y el ensayo
 * contra la mitad reservada. De **Continual Harness** (arXiv 2605.09998) tomamos las señales que
 * disparan el ciclo (vueltas que no avanzan, la misma fase que rebota) y marcar lo aprendido como
 * tal; su refinador aplica los cambios sin medirlos y sin poder revertirlos, que es justo lo que acá
 * no se hace. Código de ellos no se copió: uno es Rust y el otro Python, y la parte que importa —el
 * ensayo reservado y el ok de una persona— no está en ninguno de los dos.
 */

// ── 1. Dónde falla ───────────────────────────────────────────────────────────

export interface Flaqueza {
  readonly tipo: TipoDeTarea;
  /** La fase que más la rebota, si hay una que se repite. */
  readonly murioEn?: string;
  readonly intentos: number;
  readonly pasaron: number;
  /** De 0 a 1. */
  readonly tasa: number;
  /** Cuántas ramas se perdieron acá: es lo que ordena, no la tasa (un 0 % de 2 no duele). */
  readonly perdidas: number;
}

/** Cómo se lee una flaqueza en una oración. */
export function comoSeLee(f: Flaqueza): string {
  const porciento = Math.round(f.tasa * 100);
  const donde = f.murioEn ? `, casi siempre en ${f.murioEn}` : "";
  return `en ${NOMBRE_DE_TIPO[f.tipo]} pasa el ${porciento} % (${f.pasaron} de ${f.intentos})${donde}`;
}

/** Dónde falla seguido, lo que más duele primero. Un grupo con pocas ramas no dice nada: se saltea. */
export function flaquezas(registros: readonly Registro[], { minimo = 8, tasaMaxima = 0.75 } = {}): Flaqueza[] {
  const grupos = new Map<TipoDeTarea, Registro[]>();
  for (const r of registros) grupos.set(r.tipo, [...(grupos.get(r.tipo) ?? []), r]);
  return [...grupos.entries()]
    .flatMap(([tipo, lista]) => {
      if (lista.length < minimo) return [];
      const pasaron = lista.filter((r) => r.paso).length;
      const tasa = pasaron / lista.length;
      if (tasa > tasaMaxima) return [];
      // La fase culpable es la que mata a MÁS de la mitad. Con «la mitad o más» un empate de 2 y 2
      // nombraba a la primera que saliera del orden, que es echarle la culpa a cara o ceca.
      const muertes = new Map<string, number>();
      for (const r of lista) if (!r.paso && r.murioEn) muertes.set(r.murioEn, (muertes.get(r.murioEn) ?? 0) + 1);
      const [peor, veces] = [...muertes.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      const perdidas = lista.length - pasaron;
      return [{ tipo, ...(veces > perdidas / 2 ? { murioEn: peor } : {}), intentos: lista.length, pasaron, tasa, perdidas }];
    })
    .sort((a, b) => b.perdidas - a.perdidas || a.tasa - b.tasa);
}

// ── 2. La hipótesis, sobre la mitad de diseño ────────────────────────────────

/** Un número estable por texto: la misma tarea cae siempre del mismo lado. */
function huella(texto: string): number {
  let n = 2166136261;
  for (const letra of texto.trim().toLowerCase()) {
    n ^= letra.codePointAt(0)!;
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

/**
 * Parte el historial en dos: con `disenio` se piensa la hipótesis, con `prueba` se la juzga. No es
 * por fecha —lo nuevo y lo viejo no son comparables— sino por el texto de la tarea.
 */
export function partirHistorial<T extends { readonly tarea: string }>(registros: readonly T[]): { disenio: T[]; prueba: T[] } {
  const disenio: T[] = [];
  const prueba: T[] = [];
  for (const r of registros) (huella(r.tarea) % 2 === 0 ? disenio : prueba).push(r);
  return { disenio, prueba };
}

export interface Hipotesis {
  readonly id: string;
  readonly cuando: string;
  readonly tipo: TipoDeTarea;
  readonly murioEn?: string;
  /** Por qué cree que falla. */
  readonly porQue: string;
  /** La estrategia que propone probar. */
  readonly enfoque: Enfoque;
  /** Cuántas ramas de la mitad de diseño miró para pensarla. */
  readonly conQue: number;
}

/** Lo que se le pide al modelo que piensa la hipótesis. Lee fallas, no el repo. */
export function promptDeHipotesis(f: Flaqueza, deDisenio: readonly Registro[]): string {
  const fallas = deDisenio
    .filter((r) => !r.paso)
    .slice(-40)
    .map((r) => `- «${r.tarea}» · ${r.modelo}${r.enfoque ? ` · ángulo «${r.enfoque}»` : ""} · murió en ${r.murioEn ?? "sin fase"} · ${r.vueltas} vueltas`);
  return [
    "Sos quien mejora a Dolphin, un orquestador que le pide a agentes de programación que escriban una rama y la prueba con un portón (typecheck, tests, build, pantalla y una revisión).",
    "A cada rama se le da un ÁNGULO: una instrucción corta, en segunda persona, de cómo encarar la tarea. Estos son los que ya existen:",
    ...ENFOQUES.map((e) => `- «${e.nombre}»: ${e.instruccion}`),
    "",
    `Dolphin ${comoSeLee(f)}. Estas son las ramas que se perdieron:`,
    ...(fallas.length > 0 ? fallas : ["(sin detalle de las fallas)"]),
    "",
    "Pensá UNA causa probable y UN ángulo nuevo que la ataque. El ángulo tiene que ser distinto de los que ya existen, servir para cualquier tarea de este tipo (no para una sola), y no puede pedir herramientas, permisos ni dependencias nuevas: es solo una instrucción.",
    "Contestá SOLO este JSON, sin nada alrededor:",
    '{"porQue": "la causa, en una o dos oraciones", "nombre": "dos o tres palabras", "instruccion": "la instrucción, en segunda persona, máximo 300 caracteres"}',
  ].join("\n");
}

const limpiar = (texto: string, tope: number) => texto.trim().replace(/\s+/g, " ").slice(0, tope);

/**
 * Un ángulo no puede enseñar a aflojar la verificación.
 *
 * Es el riesgo central de que un sistema se mejore solo: la forma más fácil de «pasar más seguido»
 * es romper lo que mide. A Prime Agent le pasó —un agente guardó como habilidad un atajo que hacía
 * trampa— y el ensayo no lo agarraría, porque las ramas tramposas pasan el portón de verdad.
 */
// Con `\w` y `\b` no alcanza: en JavaScript una «á» no es letra para ninguno de los dos, así que
// «salteá los tests» no coincidía con nada (ver la misma trampa en desempeno.ts).
const PELIGROSOS: readonly (readonly [RegExp, string])[] = [
  [/(?<!\p{L})(saltea|salte|saltar|omit|ignor|desactiv|deshabilit|apag)\p{L}*\s+(los?\s+)?(tests?|pruebas?|chequeos?|verificaci)/iu, "dice saltear o apagar los tests"],
  [/(?<!\p{L})(borr|elimin|coment|vaci)\p{L}*\s+(los?\s+)?(tests?|pruebas?)/iu, "dice borrar o comentar tests"],
  [/(?<!\p{L})(test|it|describe)\.(skip|todo)|(?<!\p{L})xit\(|(?<!\p{L})skip\s*=\s*true/iu, "dice marcar tests como salteados"],
  [/--no-verify|--force|push\s+--force|(?<!\p{L})reset\s+--hard/iu, "dice saltear los ganchos de git o forzar"],
  [/@ts-ignore|@ts-nocheck|eslint-disable|(?<!\p{L})noqa(?!\p{L})|#\s*type:\s*ignore/iu, "dice silenciar el typecheck o el linter"],
  [
    /(?<!\p{L})(afloj|baj|relaj|cambi|edit|toc|modific)\p{L}*\s+(el|la|los|las)?\s*(port[óo]n|umbral|cobertura|config\p{L}*\s+del?\s+(linter|test))/iu,
    "dice tocar el portón o sus umbrales",
  ],
  [/(?<!\p{L})(como|as)\s+any(?!\p{L})|(?<!\p{L})cast\p{L}*\s+a\s+any(?!\p{L})/iu, "dice tapar los tipos con any"],
];

/** Por qué un ángulo no se puede probar, si pasa. Nada, si es seguro. */
export function esSeguro(enfoque: Enfoque): string | undefined {
  const texto = `${enfoque.nombre} ${enfoque.instruccion}`;
  return PELIGROSOS.find(([patron]) => patron.test(texto))?.[1];
}

/** Lo que contestó el modelo, controlado: lo que viene de un modelo no es de fiar. */
export function leerHipotesis(texto: string, f: Flaqueza, cuando: string, id: string): Hipotesis | { porQue: string } {
  const crudo = /\{[\s\S]*\}/.exec(texto)?.[0];
  if (!crudo) return { porQue: "el modelo no contestó un JSON" };
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    return { porQue: "el JSON del modelo no se puede leer" };
  }
  const nombre = typeof datos.nombre === "string" ? limpiar(datos.nombre, 40) : "";
  const instruccion = typeof datos.instruccion === "string" ? limpiar(datos.instruccion, 300) : "";
  const porQue = typeof datos.porQue === "string" ? limpiar(datos.porQue, 400) : "";
  if (!nombre || !instruccion) return { porQue: "al ángulo le falta el nombre o la instrucción" };
  if (instruccion.length < 20) return { porQue: "la instrucción es demasiado corta para cambiar algo" };
  if (ENFOQUES.some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) return { porQue: `«${nombre}» ya existe` };
  const enfoque = { nombre, instruccion };
  const peligro = esSeguro(enfoque);
  if (peligro) return { porQue: `no se prueba: ${peligro}` };
  return { id, cuando, tipo: f.tipo, ...(f.murioEn ? { murioEn: f.murioEn } : {}), porQue, enfoque, conQue: f.intentos };
}

// ── 3. El ensayo y el veredicto ──────────────────────────────────────────────

/** Correr una tarea histórica con un ángulo. Cuesta plata de verdad: lo inyecta quien lo pide. */
export type CorrerEnsayo = (tarea: string, enfoque: Enfoque | undefined, senal?: AbortSignal) => Promise<{ paso: boolean; costo: number }>;

export interface Marca {
  readonly intentos: number;
  readonly pasaron: number;
  readonly tasa: number;
}

const marcaDe = (resultados: readonly { paso: boolean }[]): Marca => ({
  intentos: resultados.length,
  pasaron: resultados.filter((r) => r.paso).length,
  tasa: resultados.length === 0 ? 0 : resultados.filter((r) => r.paso).length / resultados.length,
});

export interface Veredicto {
  readonly adoptar: boolean;
  readonly porQue: string;
  readonly base: Marca;
  readonly nueva: Marca;
  /** Otros tipos de tarea con el ángulo nuevo: que no mejore acá rompiendo allá. */
  readonly control?: { readonly base: Marca; readonly nueva: Marca };
  readonly costo: number;
}

export interface ReglasDeAdopcion {
  /** Cuántas tareas reservadas hacen falta para que el número diga algo. */
  readonly minimo?: number;
  /** Cuánto tiene que mejorar la tasa, en puntos de 0 a 1. */
  readonly mejoraMinima?: number;
  /** Cuánto se tolera que empeore en los otros tipos. */
  readonly regresionMaxima?: number;
}

/** ¿Se adopta? Con pocas tareas, no; con una mejora chica, tampoco; y si rompe otra cosa, menos. */
export function juzgar(
  resultados: {
    readonly base: readonly { paso: boolean; costo: number }[];
    readonly nueva: readonly { paso: boolean; costo: number }[];
    readonly control?: { readonly base: readonly { paso: boolean; costo: number }[]; readonly nueva: readonly { paso: boolean; costo: number }[] };
  },
  { minimo = 6, mejoraMinima = 0.15, regresionMaxima = 0.05 }: ReglasDeAdopcion = {},
): Veredicto {
  const base = marcaDe(resultados.base);
  const nueva = marcaDe(resultados.nueva);
  const control = resultados.control ? { base: marcaDe(resultados.control.base), nueva: marcaDe(resultados.control.nueva) } : undefined;
  const costo = [...resultados.base, ...resultados.nueva, ...(resultados.control?.base ?? []), ...(resultados.control?.nueva ?? [])].reduce((n, r) => n + r.costo, 0);
  const comun = { base, nueva, ...(control ? { control } : {}), costo: Math.round(costo * 10000) / 10000 };
  const puntos = (n: number) => `${Math.round(n * 100)} %`;

  if (nueva.intentos < minimo || base.intentos < minimo) {
    return { ...comun, adoptar: false, porQue: `hacen falta ${minimo} tareas reservadas de cada lado y hay ${Math.min(base.intentos, nueva.intentos)}` };
  }
  const mejora = nueva.tasa - base.tasa;
  if (mejora < mejoraMinima) {
    return { ...comun, adoptar: false, porQue: mejora <= 0 ? `no mejora: ${puntos(nueva.tasa)} contra ${puntos(base.tasa)}` : `mejora poco (${puntos(mejora)}) para lo que cuesta cambiar cómo se trabaja` };
  }
  if (control && control.base.intentos >= minimo && control.nueva.tasa < control.base.tasa - regresionMaxima) {
    return { ...comun, adoptar: false, porQue: `mejora acá pero rompe el resto: en las otras tareas baja de ${puntos(control.base.tasa)} a ${puntos(control.nueva.tasa)}` };
  }
  return { ...comun, adoptar: true, porQue: `pasa del ${puntos(base.tasa)} al ${puntos(nueva.tasa)} en ${nueva.intentos} tareas que no se usaron para pensarlo` };
}

// ── 4. La propuesta: espera tu ok ────────────────────────────────────────────

export interface Propuesta {
  readonly hipotesis: Hipotesis;
  readonly veredicto: Veredicto;
  readonly estado: "propuesta" | "adoptado" | "descartado";
  /** Cuándo la aceptaste o la descartaste. */
  readonly decidido?: string;
}

const ARCHIVO = "mejoras.json";
const ruta = (repo: string) => join(repo, ".dolphin", ARCHIVO);

export function leerPropuestas(repo: string): Promise<Propuesta[]> {
  return leerEstado(ruta(repo), [] as Propuesta[], (datos) => {
    const lista = (datos as { propuestas?: unknown } | null)?.propuestas;
    return Array.isArray(lista) ? (lista as Propuesta[]) : [];
  });
}

async function guardar(repo: string, cambio: (lista: Propuesta[]) => Propuesta[]): Promise<void> {
  await enFila(ruta(repo), async () => {
    const lista = cambio([...(await leerPropuestas(repo))]);
    await carpetaDeDolphin(repo);
    await escribirDeUna(ruta(repo), `${JSON.stringify({ version: 1, propuestas: lista }, null, 2)}\n`);
  });
}

/** Deja la propuesta esperando tu ok. Adoptar es tuyo: esto nunca se prende solo. */
export async function proponer(repo: string, hipotesis: Hipotesis, veredicto: Veredicto): Promise<void> {
  await guardar(repo, (lista) => [...lista.filter((p) => p.hipotesis.id !== hipotesis.id), { hipotesis, veredicto, estado: "propuesta" }]);
}

export async function decidir(repo: string, id: string, estado: "adoptado" | "descartado", cuando = new Date().toISOString()): Promise<boolean> {
  let encontrada = false;
  await guardar(repo, (lista) =>
    lista.map((p) => {
      if (p.hipotesis.id !== id) return p;
      encontrada = true;
      return { ...p, estado, decidido: cuando };
    }),
  );
  return encontrada;
}

/**
 * Los ángulos con que trabaja este repo: los de siempre y los que vos adoptaste. Un ángulo aprendido
 * va al final: los primeros son los que más seguido ganan, y una siembra chica prueba esos.
 */
export async function enfoquesDelRepo(repo: string): Promise<Enfoque[]> {
  const adoptados = (await leerPropuestas(repo).catch(() => [])).filter((p) => p.estado === "adoptado").map((p) => p.hipotesis.enfoque);
  return [...ENFOQUES, ...adoptados.filter((e) => !ENFOQUES.some((x) => x.nombre === e.nombre))];
}

/** ¿Es de los que Dolphin aprendió? Sirve para mostrarlos aparte y para poder auditarlos. */
export async function esAprendido(repo: string, nombre: string): Promise<boolean> {
  return (await leerPropuestas(repo).catch(() => [])).some((p) => p.estado === "adoptado" && p.hipotesis.enfoque.nombre === nombre);
}

export interface ComoVa {
  readonly nombre: string;
  readonly tipo: TipoDeTarea;
  /** Lo que rinde el ángulo aprendido, con ramas de verdad posteriores a adoptarlo. */
  readonly suyo: Marca;
  /** Lo que rinde el resto en el mismo tipo de tarea, en el mismo período. */
  readonly resto: Marca;
  /** Rinde peor que el resto con ramas suficientes: conviene retirarlo. */
  readonly retirar: boolean;
  readonly porQue: string;
}

/**
 * Cómo le va en producción a lo que ya adoptaste. Adoptar no es para siempre: un ángulo que ganó el
 * ensayo puede rendir peor con el tiempo (cambia el repo, cambian los modelos), y eso solo se ve
 * mirando las ramas de verdad. Es lo que a los dos sistemas de la literatura les falta: aplican el
 * cambio y no vuelven a medirlo.
 */
export function comoVaLoAdoptado(registros: readonly Registro[], propuestas: readonly Propuesta[], { minimo = 6, margen = 0.1 } = {}): ComoVa[] {
  return propuestas
    .filter((p) => p.estado === "adoptado")
    .map((p) => {
      const { nombre } = p.hipotesis.enfoque;
      // Solo lo posterior a adoptarlo: antes del ok ese ángulo no estaba en juego.
      const desde = p.decidido ?? p.hipotesis.cuando;
      const delTipo = registros.filter((r) => r.tipo === p.hipotesis.tipo && r.cuando >= desde);
      const suyo = marcaDe(delTipo.filter((r) => r.enfoque === nombre));
      const resto = marcaDe(delTipo.filter((r) => r.enfoque !== nombre));
      const puntos = (n: number) => `${Math.round(n * 100)} %`;
      if (suyo.intentos < minimo || resto.intentos < minimo) {
        return { nombre, tipo: p.hipotesis.tipo, suyo, resto, retirar: false, porQue: `todavía no hay ramas suficientes para saber (${suyo.intentos} con él, ${resto.intentos} sin él)` };
      }
      const peor = suyo.tasa < resto.tasa - margen;
      return {
        nombre,
        tipo: p.hipotesis.tipo,
        suyo,
        resto,
        retirar: peor,
        porQue: peor
          ? `rinde peor que el resto: ${puntos(suyo.tasa)} contra ${puntos(resto.tasa)} en ${suyo.intentos} ramas`
          : `sigue rindiendo: ${puntos(suyo.tasa)} contra ${puntos(resto.tasa)}`,
      };
    });
}
