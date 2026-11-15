import { win32 } from 'node:path'
import { GROK_CHAT_HISTORY_FILE } from '../../shared/grok-session-paths'
import { isClaudeProjectBucketDirectory } from '../ai-vault/scanners/claude/claude-project-dir-encoding'
import { isOmpConversationDirectory } from '../ai-vault/scanners/omp/session-scanner-omp-subagent-transcripts'

/** Copilot no nombra el archivo con el id: lo nombra su carpeta, y el archivo es siempre este. */
const COPILOT_EVENTS_FILE = 'events.jsonl'

export type SessionIdLookupAgent = 'claude' | 'codex' | 'grok' | 'omp' | 'cursor' | 'copilot'

export type SessionFileIdLayout = {
  fileMatchesId: (path: string, sessionId: string) => boolean
  /** depth 0 is a direct root child; false prunes this directory. */
  directoryPredicate?: (name: string, depth: number, wanted: (id: string) => boolean) => boolean
}

// win32 parsing handles both native and WSL UNC separators.
function stem(path: string): string {
  return win32.basename(path, win32.extname(path))
}

export const SESSION_FILE_ID_LAYOUTS: Record<SessionIdLookupAgent, SessionFileIdLayout> = {
  claude: {
    fileMatchesId: (path, id) => win32.basename(path) === `${id}.jsonl`,
    directoryPredicate: isClaudeProjectBucketDirectory
  },
  codex: {
    fileMatchesId: (path, id) => {
      const name = stem(path)
      return name === id || name.endsWith(`-${id}`)
    }
  },
  grok: {
    fileMatchesId: (path, id) =>
      win32.basename(path) === GROK_CHAT_HISTORY_FILE && win32.basename(win32.dirname(path)) === id,
    directoryPredicate: (name, depth, wanted) => depth === 0 || (depth === 1 && wanted(name))
  },
  // `<projects>/<slug>/agent-transcripts/<chat id>/<chat id>.jsonl`
  cursor: {
    fileMatchesId: (path, id) => win32.basename(path) === `${id}.jsonl`,
    // Why se poda por nombre y no por profundidad sola: el nombre del archivo es el id del chat y
    // también el de su carpeta, así que sin exigir `agent-transcripts` en el medio cualquier
    // archivo `<id>.jsonl` de otro árbol de `.cursor` ganaría la búsqueda.
    directoryPredicate: (name, depth, wanted) =>
      depth === 0 || (depth === 1 && name === 'agent-transcripts') || (depth === 2 && wanted(name))
  },
  // `<session-state>/<id>/events.jsonl`
  copilot: {
    fileMatchesId: (path, id) =>
      win32.basename(path) === COPILOT_EVENTS_FILE && win32.basename(win32.dirname(path)) === id,
    // La raíz tiene también `.session-operation-locks`, que no es una sesión: exigir el id
    // buscado en la primera profundidad la deja afuera sin nombrarla.
    directoryPredicate: (name, depth, wanted) => depth === 0 && wanted(name)
  },
  // `<sessions>/<cwd dir>/<ISO stamp>_<id>.jsonl`
  omp: {
    fileMatchesId: (path, id) => {
      const name = stem(path)
      return name === id || name.endsWith(`_${id}`)
    },
    // Prune subagent artifact directories: their suffix can match the parent ID and steal its transcript.
    directoryPredicate: isOmpConversationDirectory
  }
}
