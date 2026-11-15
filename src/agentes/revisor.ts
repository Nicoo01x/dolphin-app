import { leerDiff } from "../nucleo/diff.js";
import { mismoModelo, otroEscalon } from "../nucleo/router.js";
import { argumentosDeLectura, leerConClaude } from "./leer-con-claude.js";
import { objetosJson } from "../nucleo/json.js";
import type { Universo, Verificador } from "../nucleo/tipos.js";

/**
 * La revisión independiente: otro modelo lee el diff contra la tarea y
 * decide si se acepta.
 *
 * Es una fase BARATA del portón: corre solo sobre las ramas que ya pasaron
 * las fases gratis (sintaxis, tests, peso, pantalla) y con un modelo
 * barato, distinto del que escribió (lo garantiza el router). Atrapa lo que
 * ningún test atrapa: un cambio que compila y pasa todo pero no hace lo que
 * se pidió, o que hace de más.
 *
 * No juzga estilo. Solo corta por tres cosas, y lo dice en una oración.
 */

export type CorrerRevisor = (prompt: string, universo: Universo, modelo: string) => Promise<{ texto: string; gastado: number }>;

export interface OpcionesRevisor {
  readonly tarea: string;
  readonly modelo: string;
  /** Quién le pregunta al modelo. Por defecto, el CLI de Claude; los tests lo inyectan. */
  readonly correr?: CorrerRevisor;
  readonly cmd?: string;
  /** Milisegundos antes de darlo por colgado. */
  readonly tope?: number;
}

/** Más que esto no lo lee bien un modelo barato, y tampoco hace falta para decidir. */
const TOPE_DE_LINEAS = 600;

/** La segunda vuelta, cuando la primera no vino en el formato pedido. */
const RECORDATORIO =
  'Ojo: tu respuesta anterior no trajo el JSON. Contestá SOLO con {"decision": "aceptar" o "cortar", "porque": "una oración"}, en una línea, sin nada más.';

export function verificadorRevisor(opciones: OpcionesRevisor): Verificador {
  const correr = opciones.correr ?? correrConClaude(opciones.cmd ?? "claude", opciones.tope ?? 180_000);

  return {
    nombre: "revisión",
    costo: "barato",
    async correr(universo, contexto) {
      const diff = await leerDiff(universo.ruta, universo.base ? { base: universo.base } : {});
      // No poder leerlo no es aprobarlo: queda dicho que se salteó.
      if (diff.noSePudo) return { paso: true, salteada: true, detalle: `revisión: no pude leer el diff (${diff.porQue ?? "git no contestó"})`, gastado: 0 };
      // Y una rama sin cambios no tiene nada que aprobar: una corrección que deshizo todo no gana por ser la más simple.
      if (!diff.hay) return { paso: false, detalle: "revisión: la rama no dejó ningún cambio, no hay nada que aprobar", gastado: 0 };

      // El router garantiza un revisor distinto del que escribe; pero en una
      // siembra que mezcla modelos (la rama que sale a medir), ESTA rama
      // pudo escribirla el mismo que revisa: entonces revisa el de al lado.
      const modelo = contexto?.modelo && mismoModelo(contexto.modelo, opciones.modelo) ? otroEscalon(opciones.modelo) : opciones.modelo;
      const prompt = promptDeRevision(opciones.tarea, diff.texto);
      let respuesta = await correr(prompt, universo, modelo);
      let veredicto = leerVeredicto(respuesta.texto);
      let gastado = respuesta.gastado;
      // Un modelo barato a veces contesta en prosa: pedírselo una vez más,
      // con el formato recordado, cuesta centavos y es mejor que saltear la revisión.
      if (!veredicto) {
        respuesta = await correr(`${prompt}\n\n${RECORDATORIO}`, universo, modelo);
        veredicto = leerVeredicto(respuesta.texto);
        gastado += respuesta.gastado;
      }
      // Un revisor que contesta cualquier cosa no corta a nadie: sería
      // descartar código por un problema del revisor, no del código. Pero
      // tampoco cuenta como revisada: queda dicho que se salteó.
      if (!veredicto) {
        return {
          paso: true,
          salteada: true,
          detalle: "revisión: el revisor no contestó en el formato pedido ni a la segunda, se salteó",
          evidencia: respuesta.texto.slice(0, 1000),
          gastado,
        };
      }
      return {
        paso: veredicto.paso,
        detalle: `revisión: ${veredicto.porque}`,
        evidencia: `Revisó ${modelo}.\n\n${respuesta.texto.slice(0, 2000)}`,
        gastado,
      };
    },
  };
}

export function promptDeRevision(tarea: string, diff: string): string {
  const lineas = diff.split("\n");
  const recortado = lineas.length > TOPE_DE_LINEAS;
  return [
    "Sos un revisor independiente. Otro modelo hizo este cambio en un repo para cumplir una tarea, y vos decidís si se acepta.",
    "",
    "La tarea:",
    `«${tarea}»`,
    "",
    "El cambio (git diff):",
    "```diff",
    ...(recortado ? lineas.slice(0, TOPE_DE_LINEAS) : lineas),
    "```",
    ...(recortado ? [`(el diff sigue: se muestran las primeras ${TOPE_DE_LINEAS} líneas)`] : []),
    "",
    "Cortalo SOLO si pasa alguna de estas tres cosas:",
    "1. no hace lo que la tarea pide, o lo hace a medias;",
    "2. rompe algo que funcionaba;",
    "3. hace cambios que nadie pidió y que cambian el comportamiento.",
    "No lo cortes por estilo, nombres, formato ni gustos: eso no se revisa acá.",
    "Podés leer los archivos del repo si necesitás contexto, pero no cambies nada.",
    "",
    'Decidí con una de dos palabras: "aceptar" si hace lo que pide la tarea sin romper nada, o "cortar" si pasa alguna de las tres cosas de arriba.',
    "Respondé SOLO con un objeto JSON en una línea, sin nada antes ni después:",
    '{"decision": "aceptar o cortar", "porque": "una oración en castellano que explique la decisión"}',
  ].join("\n");
}

/**
 * El último veredicto de la respuesta. Se pide una PALABRA, «aceptar» o
 * «cortar», con el mismo verbo de la consigna: con un booleano en «paso»,
 * Haiku contestaba «¿lo corto? no» escribiendo `"paso": false` con un
 * porqué que aprobaba el cambio —tres de tres veces sobre un arreglo
 * correcto, y dos ramas buenas cortadas en una siembra real—. El formato
 * viejo se sigue leyendo; lo que no tenga ninguno de los dos no es un veredicto.
 */
export function leerVeredicto(texto: string): { paso: boolean; porque: string } | undefined {
  // Los objetos de verdad, con llaves adentro y todo: una regex sin llaves no
  // leía un porqué que citaba `{a: 1}`, y un «cortar» terminaba como salteada.
  for (const objeto of objetosJson(texto)) {
    if (typeof objeto !== "object" || objeto === null) continue;
    const datos = objeto as { decision?: unknown; paso?: unknown; porque?: unknown };
    const paso = aceptado(datos);
    if (paso === undefined) continue;
    const porque = typeof datos.porque === "string" && datos.porque.trim() !== "" ? datos.porque.trim() : paso ? "cumple la tarea" : "no cumple la tarea";
    return { paso, porque: porque.length > 240 ? `${porque.slice(0, 239)}…` : porque };
  }
  return undefined;
}

function aceptado(datos: { decision?: unknown; paso?: unknown }): boolean | undefined {
  if (typeof datos.decision === "string") {
    // Una palabra y nada más: «aceptar o cortar» es el ejemplo copiado, no una decisión.
    const palabra = datos.decision.trim().toLowerCase().replace(/[.!]+$/, "");
    if (["aceptar", "acepta", "aceptado"].includes(palabra)) return true;
    if (["cortar", "corta", "cortado"].includes(palabra)) return false;
    return undefined;
  }
  return typeof datos.paso === "boolean" ? datos.paso : undefined;
}

/**
 * Lo que puede hacer el revisor: leer el repo, si necesita contexto. Ocho
 * vueltas: con cuatro, leer un par de archivos lo dejaba sin vueltas para
 * contestar (`error_max_turns`) y la revisión se salteaba.
 */
const LECTURA_DEL_REVISOR = { vueltas: 8, herramientas: ["Read", "Grep", "Glob"] } as const;

/** Los argumentos del revisor, sin el prompt (va por stdin). */
export function argumentosDelRevisor(modelo: string): string[] {
  return argumentosDeLectura({ modelo, ...LECTURA_DEL_REVISOR });
}

/** El CLI de Claude, sin poder escribir: lee el diff (y el repo, si quiere) y contesta. */
function correrConClaude(cmd: string, tope: number): CorrerRevisor {
  return (prompt, universo, modelo) =>
    leerConClaude(prompt, { cmd, modelo, ...LECTURA_DEL_REVISOR, cwd: universo.ruta, tope, ...(universo.entorno ? { entorno: universo.entorno } : {}) });
}
