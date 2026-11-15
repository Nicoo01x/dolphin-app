import {
  resumeInvocationFromOptions,
  type StructuredAgentSessionHistory
} from '../native-chat/structured-agent-cli-conversations'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El id de sesión ACP de un chat de Gemini es el `sessionId` que Gemini graba en su archivo de
 *  charla, que es con el que Session History lista la fila. */
export const GEMINI_SESSION_HISTORY: StructuredAgentSessionHistory = {
  rowAgents: ['gemini'],
  rowSessionId: (link) => link.handle.nativeId,
  parseResumeArgs: (args) => {
    const invocation = resumeInvocationFromOptions(args, {
      targetless: [],
      markers: ['-r', '--resume']
    })
    // `--resume latest` o `--resume 5` (un índice) pueden abrir cualquier charla de la carpeta:
    // solo un UUID nombra una sola.
    return invocation?.target && !UUID.test(invocation.target) ? { target: null } : invocation
  }
}
