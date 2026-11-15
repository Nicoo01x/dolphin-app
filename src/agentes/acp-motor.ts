import { correrAgenteAcp, type OpcionesDeAcp, type TrabajoDeAcp } from "./acp.js";
import { armarPrompt, leerContrato, pedidoDeCorreccion } from "./claude.js";
import { medirForma } from "../nucleo/forma.js";
import { FalloDelAgente } from "../nucleo/tipos.js";
import type { Agente, Falla, Trabajo, Universo } from "../nucleo/tipos.js";

/**
 * Cualquier agente que hable ACP, como motor de Dolphin.
 *
 * Recibe EXACTAMENTE el mismo pedido que Claude —la tarea, el perfil del proyecto, las reglas de
 * la casa, el contrato de superficie— porque la memoria es del proyecto y no del modelo. Lo que
 * cambia es cómo se le habla: en vez de banderas de un CLI y leer su salida, es un protocolo, y
 * eso significa que **sumar un motor nuevo deja de ser escribir código**: es decir con qué comando
 * se lanza, en `dolphin.config.json`.
 *
 * ```json
 * { "acp": { "cmd": "gemini", "args": ["--experimental-acp"] } }
 * ```
 *
 * De yapa, ACP informa el costo cuando el agente lo sabe (`usage_update`), que es algo que los
 * CLI no dicen nunca: con ellos el costo queda desconocido y el portón solo puede medir el diff.
 */

export interface OpcionesDelMotorAcp {
  readonly cmd: string;
  readonly args?: readonly string[];
  readonly contexto?: string;
  readonly tope?: number;
  /** Lo que el agente va diciendo, apenas lo dice (ver nucleo/voces.ts). */
  readonly alDecir?: (texto: string) => void;
}

/** Lo que cierra una corrida: medir lo que tocó y leer el contrato de superficie. */
async function cerrar(universo: Universo, trabajo: TrabajoDeAcp): Promise<Trabajo> {
  if (trabajo.porQueParo === "refusal") throw new FalloDelAgente(`el agente se negó: ${trabajo.texto || "sin motivo"}`, trabajo.gastado ?? 0, true);
  const forma = await medirForma(universo.ruta);
  // Un agente que no tocó un archivo contestó en vez de trabajar: no puede cruzar el portón
  // intacto y ganar por ser «el más simple».
  if (forma.archivos === 0) {
    const porQue = trabajo.porQueParo === "max_tokens" ? "se quedó sin contexto" : trabajo.ruido || "contestó en vez de trabajar";
    throw new FalloDelAgente(`no tocó ningún archivo: ${porQue}`, trabajo.gastado ?? 0, true);
  }
  const contrato = leerContrato(trabajo.texto);
  return {
    forma,
    // Si el agente dijo cuánto salió, se usa; si no, el costo queda desconocido y no en cero: un
    // cero haría pasar por gratis lo que no se midió.
    gastado: trabajo.gastado ?? 0,
    ...(trabajo.gastado === undefined ? { costoDesconocido: true as const } : {}),
    ...(contrato ? { contrato } : {}),
  };
}

export function agenteAcp(opciones: OpcionesDelMotorAcp): Agente {
  // La sesión de cada universo: con esto la corrección sigue la MISMA conversación en vez de
  // arrancar de cero, que es volver a pagar para que el agente entienda el repo. Por universo y no
  // una sola, porque las ramas corren a la vez y cada una tiene su charla.
  const sesiones = new Map<string, string>();

  const correr = async (pedido: string, universo: Universo, senal?: AbortSignal) => {
    const previa = sesiones.get(universo.id);
    const deAcp: OpcionesDeAcp = {
      cmd: opciones.cmd,
      ...(opciones.args ? { args: opciones.args } : {}),
      cwd: universo.ruta,
      ...(opciones.tope ? { tope: opciones.tope } : {}),
      ...(senal ? { senal } : {}),
      ...(opciones.alDecir ? { alDecir: opciones.alDecir } : {}),
      ...(previa ? { sesionPrevia: previa } : {}),
    };
    const trabajo = await correrAgenteAcp(pedido, deAcp);
    sesiones.set(universo.id, trabajo.sesion);
    return trabajo;
  };

  return {
    nombre: `acp:${opciones.cmd}`,
    async trabajar(universo, tarea, enfoque, senal) {
      return cerrar(universo, await correr(armarPrompt(tarea, opciones.contexto, enfoque?.instruccion), universo, senal));
    },
    async corregir(universo, tarea, falla: Falla) {
      return cerrar(universo, await correr(pedidoDeCorreccion(tarea, falla), universo));
    },
  };
}
