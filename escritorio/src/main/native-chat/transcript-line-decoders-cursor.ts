// Cursor JSONL line → NativeChatMessage decoder.

import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatRole
} from '../../shared/native-chat/native-chat-types'
import {
  asRecord,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session-scanner-values'
import { claudeContentBlocks } from './transcript-record-blocks'

/**
 * Cursor escribe `<cursorHome>/projects/<slug>/agent-transcripts/<chatId>/<chatId>.jsonl`, una
 * fila por turno, con la forma `{ role, message: { content }, timestamp }` y el contenido en el
 * mismo formato de bloques que Anthropic (`text`, `tool_use`, `tool_result`, `image`). Por eso el
 * mapeo de bloques no es propio: es `claudeContentBlocks`, el mismo que usa el decodificador de
 * Claude.
 *
 * Esa forma no se adivinó: es la que ya lee el escáner del baúl
 * (`ai-vault/session-scanner-cursor-parser.ts`), con su fixture en
 * `session-scanner-log-agent-fixtures.ts`. Lo que ese escáner hace y esto no es quedarse sólo con
 * el texto de la vista previa; acá pasan también las llamadas a herramientas y sus resultados,
 * que es lo que convierte un transcript en una conversación.
 *
 * Lo verificado y lo que no: el formato de las filas `user`/`assistant` está probado contra la
 * fixture del repo. Los bloques `tool_use`/`tool_result` se decodifican porque el contenido es
 * Anthropic y `claudeContentBlocks` ya los sabe leer, pero no hay en este repo un transcript real
 * de Cursor con herramientas contra el que medirlo —`cursor-agent` no está instalado en la máquina
 * donde se escribió esto—. Si alguna vez una herramienta de Cursor no aparece en el chat, el lugar
 * a mirar es este archivo y no el resto de la cadena.
 */
export function decodeCursorTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const role = extractString(record.role)
  if (role !== 'user' && role !== 'assistant') {
    return null
  }
  const message = asRecord(record.message)
  // El escáner del baúl acepta las dos formas, así que esto también: hay filas con el contenido
  // adentro de `message` y filas que lo traen al tope.
  const blocks = claudeContentBlocks(message?.content ?? record.content)
  if (blocks.length === 0) {
    return null
  }
  const recordId = extractString(record.id) ?? extractString(message?.id)
  const model = role === 'assistant' ? cursorModel(record, message) : null
  return {
    // Why el prefijo con la posición, como en Grok y no como en Claude: las filas de Cursor no
    // declaran un id estable para el turno, así que un id intrínseco no alcanza para ordenar.
    // Con la posición adelante el chat conserva el orden del archivo.
    id: recordId ? `${fallbackId}:${recordId}` : fallbackId,
    role: cursorRole(role, blocks),
    blocks,
    timestamp: parseTimestamp(record.timestamp),
    source: 'transcript',
    ...(model ? { model } : {})
  }
}

function cursorModel(
  record: Record<string, unknown>,
  message: Record<string, unknown> | null
): string | null {
  return extractString(message?.model) ?? extractString(record.model)
}

/**
 * Un turno `user` cuyo contenido es sólo resultado de herramienta no lo escribió la persona: el
 * CLI devuelve la salida de la herramienta en el mismo lugar donde van los pedidos. Dibujarlo como
 * burbuja de la persona pone en su boca la salida de un comando.
 */
function cursorRole(
  role: 'user' | 'assistant',
  blocks: readonly NativeChatBlock[]
): NativeChatRole {
  if (role === 'assistant') {
    return 'assistant'
  }
  return blocks.every((block) => block.type === 'tool-result') ? 'tool' : 'user'
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
