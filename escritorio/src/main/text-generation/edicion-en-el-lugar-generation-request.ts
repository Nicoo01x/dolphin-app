import { leerRespuestaDeEdicion } from '../../shared/edicion-en-el-lugar-respuesta'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control/ai/source-control-ai-operation-resolution'
import { runGenerationRequest } from './agent-generation-request'
import { emptyResultFailure } from './source-control-agent-failure'
import { spawnSourceControlAgent } from './source-control-agent-launch'
import type {
  CommitMessageGenerationTarget,
  GenerateEdicionEnElLugarResult,
  SpawnSourceControlAgent
} from './source-control-text-generation-types'

/**
 * Hasta dónde puede crecer el pedido.
 *
 * El pedido lleva la selección y lo que la rodea, y todo eso viaja a un agente por la línea de
 * comando. Seleccionar un archivo generado entero no da un error que se entienda: da un fallo del
 * spawn. Cien mil caracteres son unas 2.000 líneas de código, muy por encima de lo que alguien
 * edita de una sola vez y muy por debajo de donde la línea de comando se rompe.
 */
export const MAXIMO_DEL_PEDIDO_DE_EDICION = 100_000

/**
 * El pedido que llegó del editor, listo para mandar, o por qué no se manda.
 *
 * Vive acá y no adentro del handler para poder probarse sin levantar el IPC entero. Valida en el
 * borde, que es donde corresponde: lo que viene del otro lado no se cree, ni siquiera cuando el
 * otro lado es nuestro propio editor.
 */
export function revisarElPedidoDeEdicion(
  prompt: string | undefined
): { ok: true; prompt: string } | { ok: false; error: string } {
  const limpio = prompt?.trim() ?? ''
  if (!limpio) {
    return { ok: false, error: 'Describe the edit you want.' }
  }
  if (limpio.length > MAXIMO_DEL_PEDIDO_DE_EDICION) {
    return { ok: false, error: 'That selection is too large to edit in one request.' }
  }
  return { ok: true, prompt: limpio }
}

/**
 * Editar con IA adentro del editor (Cmd+K).
 *
 * Va por la misma vía que el mensaje de commit y el nombre de la conversación —misma cola, mismos
 * límites, mismo manejo de fallas— en vez de abrir un camino nuevo. Lo único propio es cómo se lee
 * la respuesta: lo que vuelve puede terminar escrito adentro de un archivo de la persona, así que
 * pasa por `leerRespuestaDeEdicion`, que separa un reemplazo (el código de su cerca, sin la charla)
 * de una respuesta a una pregunta, que se muestra y no se aplica nunca.
 *
 * El prompt ya viene armado: lo construye el editor, que es el único que sabe qué hay alrededor
 * de la selección.
 */
export async function generarEdicionEnElLugar(input: {
  prompt: string
  params: ResolvedSourceControlAiGenerationParams
  target: CommitMessageGenerationTarget
  spawnAgent: SpawnSourceControlAgent
}): Promise<GenerateEdicionEnElLugarResult> {
  const result = await runGenerationRequest({
    ...input,
    operation: 'edicion-en-el-lugar'
  })
  if (!result.success) {
    return result
  }
  // La salida en blanco la rechaza `runGenerationRequest`. Lo que no puede rechazar es una cerca
  // vacía (```` ```ts\n``` ````): para esta operación ya no pela cercas, porque la cerca es lo que
  // separa un reemplazo de una respuesta. Un reemplazo vacío no se ofrece: aceptarlo borraría lo
  // seleccionado por un error del modelo.
  const respuesta = leerRespuestaDeEdicion(result.rawOutput)
  if (respuesta.tipo === 'edicion' && respuesta.codigo.trim() === '') {
    return {
      success: false,
      ...emptyResultFailure('edicion-en-el-lugar', result.agentLabel ?? 'The agent')
    }
  }
  return {
    success: true,
    ...respuesta,
    agentLabel: result.agentLabel,
    agentId: input.params.agentId
  }
}

/**
 * Lo mismo, con el lanzador de verdad puesto.
 *
 * Existe por lo mismo que `generateCommitMessageFromContext`: la función de arriba recibe el
 * lanzador para poder probarse sin abrir un proceso, y el que llama desde el IPC no tiene por qué
 * saber cuál es.
 */
export function generarEdicionEnElLugarConElAgente(input: {
  prompt: string
  params: ResolvedSourceControlAiGenerationParams
  target: CommitMessageGenerationTarget
}): Promise<GenerateEdicionEnElLugarResult> {
  return generarEdicionEnElLugar({ ...input, spawnAgent: spawnSourceControlAgent })
}
