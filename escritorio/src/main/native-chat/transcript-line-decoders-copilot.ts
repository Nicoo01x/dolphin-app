// GitHub Copilot CLI JSONL line → NativeChatMessage decoder.

import type { NativeChatBlock, NativeChatMessage } from '../../shared/native-chat/native-chat-types'
import {
  asRecord,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session-scanner-values'

/** Tope de llamadas a herramienta por turno: una fila rota no puede inflar la memoria del lector. */
const MAXIMO_DE_HERRAMIENTAS = 64

/**
 * Copilot escribe `<copilotHome>/session-state/<sessionId>/events.jsonl`: un registro de eventos,
 * no una lista de mensajes. De sus veintitantos tipos de evento, la conversación son dos —
 * `user.message` y `assistant.message`— y el resto es maquinaria interna.
 *
 * Lo que se descarta a propósito, porque dibujarlo arruinaría el chat:
 *
 * - **`system.message`** es el prompt de sistema entero, miles de palabras de instrucciones que
 *   nadie escribió en el chat. Es el evento más grande del archivo.
 * - **`model.message` / `model.response`** son llamadas internas al modelo, y no al modelo de la
 *   conversación: la que se ve en una sesión real es la que le pide un título a `gpt-4o-mini`. Su
 *   respuesta (`<session-title>…</session-title>`) no es una respuesta al usuario.
 * - **`session.usage_record`** trae los tokens y el costo de verdad, y no se puede usar: un
 *   decodificador es una línea → un mensaje, sin estado, así que no hay manera de pegarle esos
 *   números al turno del asistente, que es otra línea. El modelo sí se recupera, porque viene
 *   repetido en `assistant.message`. O sea: el chat de Copilot muestra el modelo y no muestra el
 *   contador de contexto. Para cambiarlo habría que cruzar eventos, que es un lector con estado.
 *
 * Lo verificado y lo que no: las filas `user.message` y `assistant.message` están medidas contra
 * una sesión real de Copilot 1.0.105 en esta máquina, y la forma coincide con la que ya lee el
 * escáner del baúl (`ai-vault/session-scanner-copilot-parser.ts`). Lo de `toolRequests` se
 * decodifica por tolerancia —la sesión medida no usó ninguna herramienta, así que el arreglo
 * estaba vacío— y por eso lee varios nombres de campo posibles en vez de uno.
 */
export function decodeCopilotTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const tipo = extractString(record.type)
  if (tipo !== 'user.message' && tipo !== 'assistant.message') {
    return null
  }
  const data = asRecord(record.data)
  if (!data) {
    return null
  }
  const esDelUsuario = tipo === 'user.message'
  // Why `content` y no `transformedContent`: lo transformado es el pedido con la maquinaria que el
  // CLI le agrega adelante (la fecha y hora de la máquina, entre otras). La burbuja de la persona
  // tiene que decir lo que la persona escribió.
  const texto = extractString(data.content)
  const blocks: NativeChatBlock[] = texto ? [{ type: 'text', text: texto }] : []
  if (!esDelUsuario) {
    blocks.push(...bloquesDeHerramientas(data.toolRequests))
  }
  if (blocks.length === 0) {
    return null
  }
  const id = extractString(data.messageId) ?? extractString(record.id)
  const turnId = extractString(data.turnId)
  const model = esDelUsuario ? null : extractString(data.model)
  return {
    id: id ?? fallbackId,
    role: esDelUsuario ? 'user' : 'assistant',
    blocks,
    timestamp: parseTimestamp(record.timestamp),
    source: 'transcript',
    ...(turnId ? { turnId } : {}),
    ...(model ? { model } : {})
  }
}

function bloquesDeHerramientas(value: unknown): NativeChatBlock[] {
  if (!Array.isArray(value)) {
    return []
  }
  const blocks: NativeChatBlock[] = []
  for (const entry of value.slice(0, MAXIMO_DE_HERRAMIENTAS)) {
    const pedido = asRecord(entry)
    if (!pedido) {
      continue
    }
    const name = extractString(pedido.name) ?? extractString(pedido.toolName)
    if (!name) {
      continue
    }
    const callId = extractString(pedido.id) ?? extractString(pedido.toolCallId)
    blocks.push({
      type: 'tool-call',
      name,
      input: pedido.input ?? pedido.arguments ?? pedido.parameters,
      ...(callId ? { callId } : {})
    })
  }
  return blocks
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
