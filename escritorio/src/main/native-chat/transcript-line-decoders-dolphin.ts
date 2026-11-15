import type { NativeChatTranscriptAgent } from '../../shared/native-chat/native-chat-agent-support'
import type { NativeChatLineDecoder } from './transcript-tail-reader'
import { decodeCopilotTranscriptLine } from './transcript-line-decoders-copilot'
import { decodeCursorTranscriptLine } from './transcript-line-decoders-cursor'

/**
 * Los transcripts que Dolphin sabe leer y la base no: Cursor y Copilot.
 *
 * Why aparte: el lector de la base consulta esto sólo cuando no reconoce al agente, así que el día que
 * La base sume los suyos, los de la base ganan sin que haya que tocar nada acá.
 */
export function decodificadorDeTranscriptDolphin(
  transcriptAgent: NativeChatTranscriptAgent | null
): NativeChatLineDecoder | null {
  if (transcriptAgent === 'cursor') {
    return decodeCursorTranscriptLine
  }
  if (transcriptAgent === 'copilot') {
    return decodeCopilotTranscriptLine
  }
  return null
}
