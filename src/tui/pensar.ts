import { leerConClaude } from "../agentes/leer-con-claude.js";
import { objetosJson } from "../nucleo/json.js";

/**
 * Dolphin piensa antes de actuar. Cada mensaje del chat pasa por acá y sale con una decisión:
 *
 * - **charla**: un «hola», una duda, algo que se contesta. Se contesta y listo: armar un equipo para
 *   un saludo es tirar plata.
 * - **tarea**: algo concreto y chico. Un agente, una rama.
 * - **proyecto**: algo serio. Primero se mejora el pedido (más claro, con criterios de terminado) y
 *   se hacen las preguntas que de verdad cambian el resultado; recién con eso se arma el equipo.
 *   Si no hay repo, propone la carpeta donde va a vivir.
 *
 * Piensa con la memoria del proyecto adelante: lo que se aprendió es lo que hace que no pregunte dos
 * veces lo mismo. Quién piensa es una función (`Pensador`): con Claude de verdad, o la de reglas que
 * no gasta nada (la del agente de mentira y la de respaldo si Claude no contesta).
 */

export type Decision =
  | { readonly tipo: "charla"; readonly respuesta: string }
  | { readonly tipo: "tarea"; readonly tarea: string; readonly porQue?: string }
  | {
      readonly tipo: "proyecto";
      readonly resumen: string;
      /** El pedido mejorado: lo que recibe el equipo. */
      readonly prompt: string;
      /** Lo que conviene preguntar antes de arrancar (puede no haber nada). */
      readonly preguntas: readonly string[];
      /** Sin repo: el nombre de la carpeta nueva. */
      readonly carpeta?: string;
    };

export interface ContextoDePensar {
  readonly pedido: string;
  /** Lo que sabe el proyecto (ver contextoDeMemoria). */
  readonly memoria: string;
  /** Lo último del chat, para entender «sí, dale» o «y además…». */
  readonly charla: readonly { quien: string; texto: string }[];
  readonly sinRepo: boolean;
  readonly repo: string;
}

export type Pensador = (contexto: ContextoDePensar) => Promise<{ decision: Decision; gastado: number }>;

/** Cómo decide cada proyecto, en dolphin.config.json → "terminal". */
export interface ConfigDeTerminal {
  /** pensar (por defecto) · equipo: todo al equipo · agente: todo a un agente · charla: solo conversa. */
  readonly modo?: "pensar" | "equipo" | "agente" | "charla";
  /** El modelo que piensa (el triage). Por defecto el del medio del motor. */
  readonly modelo?: string;
  /** false: en un proyecto serio no pregunta, mejora el pedido y arranca. */
  readonly preguntar?: boolean;
  /** false: el plan del líder arranca sin esperar tu «dale» (con permisos; sin permisos nunca espera). */
  readonly aprobarPlan?: boolean;
  /** Tope de un equipo en dólares: si el peor caso del plan lo pasa, no arranca. */
  readonly tope?: number;
  /** Los scripts de npm del portón (los propone el arranque). Sin esto: typecheck, lint y test si existen. */
  readonly verificar?: readonly string[];
}

export function promptDePensar(c: ContextoDePensar): string {
  const charla = c.charla.slice(-8).map((m) => `${m.quien}: ${m.texto}`).join("\n");
  return `Sos Dolphin, un orquestador de agentes de código. Antes de hacer nada decidís QUÉ hace falta con este mensaje.

Tres caminos:
- "charla": un saludo, una pregunta, una duda sobre el proyecto o sobre Dolphin. Contestás vos, corto, en castellano rioplatense (voseo). Si la pregunta es sobre el código, podés leer el repo.
- "tarea": un cambio concreto y acotado (un bug, un botón, un test). Lo hace un agente en una rama.
- "proyecto": algo grande o ambiguo (una app, una sección entera, una migración). Mejorás el pedido: objetivo, alcance, qué queda afuera y cómo se sabe que está terminado. Y preguntás SOLO lo que cambiaría el resultado (máximo 4 preguntas; si se puede decidir con criterio, decidilo y no preguntes).${c.sinRepo ? "\n  No hay un repo abierto: proponé un nombre de carpeta corto en kebab-case para el proyecto nuevo." : ""}

Usá la memoria del proyecto: lo que ya se decidió no se pregunta de nuevo.

${c.memoria ? `MEMORIA DEL PROYECTO\n${c.memoria}\n\n` : ""}${charla ? `LO ÚLTIMO DE LA CHARLA\n${charla}\n\n` : ""}MENSAJE
${c.pedido}

Contestá SOLO un objeto JSON, sin texto alrededor:
{"tipo": "charla", "respuesta": "..."}
{"tipo": "tarea", "tarea": "el pedido claro para el agente", "porQue": "..."}
{"tipo": "proyecto", "resumen": "una línea", "prompt": "el pedido mejorado, completo", "preguntas": ["..."]${c.sinRepo ? ', "carpeta": "nombre-de-carpeta"' : ""}}`;
}

/** Lee la decisión de lo que contestó el modelo. Si no hay una que sirva, undefined. */
export function leerDecision(texto: string): Decision | undefined {
  for (const o of objetosJson(texto)) {
    const d = o as Record<string, unknown>;
    if (d.tipo === "charla" && typeof d.respuesta === "string" && d.respuesta.trim()) return { tipo: "charla", respuesta: d.respuesta.trim() };
    if (d.tipo === "tarea" && typeof d.tarea === "string" && d.tarea.trim())
      return { tipo: "tarea", tarea: d.tarea.trim(), ...(typeof d.porQue === "string" ? { porQue: d.porQue } : {}) };
    if (d.tipo === "proyecto" && typeof d.prompt === "string" && d.prompt.trim()) {
      const preguntas = Array.isArray(d.preguntas) ? d.preguntas.filter((p): p is string => typeof p === "string" && !!p.trim()).slice(0, 4) : [];
      const carpeta = typeof d.carpeta === "string" ? nombreDeCarpeta(d.carpeta) : "";
      return {
        tipo: "proyecto",
        resumen: typeof d.resumen === "string" && d.resumen.trim() ? d.resumen.trim() : d.prompt.trim().split("\n")[0]!,
        prompt: d.prompt.trim(),
        preguntas,
        ...(carpeta ? { carpeta } : {}),
      };
    }
  }
  return undefined;
}

/** Un nombre de carpeta que sirve en cualquier sistema: minúsculas, guiones, sin acentos. */
export function nombreDeCarpeta(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SALUDO = /^(hola|buenas|buen d[ií]a|buenas (tardes|noches)|gracias|chau|hey|qu[eé] tal|c[oó]mo (and[aá]s|est[aá]s))\b/i;
const PREGUNTA = /^(qu[eé]|c[oó]mo|por ?qu[eé]|cu[aá]ndo|d[oó]nde|qui[eé]n|cu[aá]l|explic[aá]|contame)\b|\?$/i;
const GRANDE = /\b(app|aplicaci[oó]n|proyecto|sistema|plataforma|desde cero|migr[aá]|reescrib|red[iy]señ|toda la|entera|completa)\b/i;

/**
 * El que decide por reglas, sin gastar nada: el del agente de mentira, y el respaldo si Claude no
 * contesta. Un saludo o una pregunta es charla; algo largo o que habla de una app entera es un
 * proyecto; lo demás, una tarea.
 */
export const pensarConReglas: Pensador = async (c) => {
  const pedido = c.pedido.trim();
  if (SALUDO.test(pedido) && pedido.length < 60)
    return { decision: { tipo: "charla", respuesta: "¡Hola! Contame qué querés hacer: lo charlamos, o si es trabajo, lo armo con un equipo y te dejo la rama probada." }, gastado: 0 };
  if (PREGUNTA.test(pedido) && pedido.length < 200)
    return { decision: { tipo: "charla", respuesta: "Para contestarte bien necesito leer el proyecto con un modelo de verdad: con el agente de mentira solo te puedo decir que lo anoté." }, gastado: 0 };
  if (pedido.length > 280 || GRANDE.test(pedido)) {
    return {
      decision: {
        tipo: "proyecto",
        resumen: pedido.split(/[.\n]/)[0]!.slice(0, 80),
        prompt: `${pedido}\n\nTerminado = compila, pasan los tests y cada pantalla nueva tiene sus estados (vacío, cargando, error).`,
        preguntas: ["¿Para quién es y qué tiene que poder hacer el primer día?", "¿Hay algo que NO tiene que tocar?"],
        ...(c.sinRepo ? { carpeta: nombreDeCarpeta(pedido.split(/\s+/).slice(0, 4).join(" ")) || "proyecto-nuevo" } : {}),
      },
      gastado: 0,
    };
  }
  return { decision: { tipo: "tarea", tarea: pedido }, gastado: 0 };
};

/** El que piensa con Claude: lee el repo si hace falta (solo lectura) y contesta la decisión en JSON. */
export function pensadorConClaude(modelo: string, cmd = "claude", tope = 180_000): Pensador {
  return async (c) => {
    const { texto, gastado } = await leerConClaude(promptDePensar(c), {
      cmd,
      modelo,
      vueltas: c.sinRepo ? 2 : 6,
      herramientas: ["Read", "Grep", "Glob"],
      cwd: c.repo,
      tope,
    });
    const decision = leerDecision(texto);
    // Si no contestó un JSON, lo que dijo igual sirve como charla: mejor eso que nada.
    return { decision: decision ?? { tipo: "charla", respuesta: texto.trim() || "No te entendí: ¿me lo decís de otra forma?" }, gastado };
  };
}

/** «dale», «sí», «arrancá»: la persona aprueba lo propuesto sin agregar nada. */
export const esAprobacion = (texto: string): boolean =>
  /^(s[ií]|dale|ok|okey|listo|arranc[aá]|hacelo|metele|va|de una|perfecto|adelante)[.! ]*$/i.test(texto.trim());
