import { createHash } from 'node:crypto'
import { DOLPHIN_AGENT_CONTEXT } from '../../shared/dolphin-agent-context'
import {
  addProjectMemoryCandidate,
  normalizeForStorage,
  projectMemoryDirectory,
  readProjectMemory,
  recordProjectMemoryUsage,
  type ProjectMemoryRecord,
  type ProjectTrainingRecord
} from './project-agent-memory-storage'

export type ProjectAgentMemorySettings = {
  projectMemoryEnabled?: boolean
  learnFromCorrections?: boolean
  /** The "you are running inside Dolphin" notice at SessionStart; on unless turned off. */
  dolphinContextEnabled?: boolean
}

export type ProjectAgentMemoryOptions = {
  resolveRepoPath: (worktreeId: string | undefined, cwd: string | undefined) => string | null
  getSettings: () => ProjectAgentMemorySettings | null | undefined
}

type MemoryItem = { id: string; text: string; type?: ProjectMemoryRecord['tipo']; score?: number }

const CONTEXT_CHAR_LIMIT = 6000
const PROMPT_CHAR_LIMIT = 2400
// Why \uXXXX y no tildes: este módulo entra al bundle de dolphind, que rechaza cualquier byte no-ASCII
// (config/scripts/dolphind-entry-build.mjs). Los comentarios sí pueden llevarlas: el bundle los saca.
const STOPWORDS = new Set(
  `a al algo algunas algunos ante antes aqui aqu\u00ed con contra como c\u00f3mo de del desde donde d\u00f3nde el ella ellas ellos en entre era es esa esas ese esos esta estas este estos fue hay la las le les lo los mas m\u00e1s me mi mis muy no o para pero por que qu\u00e9 se si s\u00ed sin sobre su sus te the to un una y you your and are be do for from in is it of on or the this with`.split(
    ' '
  )
)
// Al principio de una oración: es una corrección o una regla dicha de frente.
const CORRECTION_PATTERNS = [
  /^(?:no\s*,?\s*(?:uses|use|hagas|haga|quiero|es|era|va|vayas)|no,?\s+(?:us[a\u00e1]|hagas|haga))/i,
  /^(?:siempre|nunca|acordate|acu[e\u00e9]rdate|de ahora en m[a\u00e1]s|te dije|no hagas)\b/i,
  /^(?:no,?\s+(?:use|do|make|call|run|write|edit|touch|add|remove)\b)/i,
  /^(?:always|never|remember|from now on|i told you|don't|do not)\b/i
]
// En el medio de la oración, «siempre»/«nunca» solo cuentan con un verbo de acción: «esto siempre
// falla» es una queja, no una regla.
// Límites que entienden tildes: `\b` es solo ASCII y en «escribí» no ve el final de la palabra.
const RULE_WORD =
  /(?<![\p{L}\p{N}])(?:siempre|nunca|de ahora en m[a\u00e1]s|from now on|always|never)(?![\p{L}\p{N}])/iu
const ACTION_VERB =
  /(?<![\p{L}\p{N}])(?:us[a\u00e1]|usar|uses|hac[e\u00e9]|hacer|pon[e\u00e9]|poner|escrib[i\u00ed]|escribir|llam[a\u00e1]|llamar|corr[e\u00e9]|correr|agreg[a\u00e1]|agregar|sac[a\u00e1]|sacar|dej[a\u00e1]|dejar|toc[a\u00e1]|tocar|pas[a\u00e1]|pasar|us(?:e|ing)|run|write|add|remove|call|make|keep|put)(?![\p{L}\p{N}])/iu
const MAX_CORRECTION_CHARS = 240

function normalizedWords(value: string): string[] {
  return normalizeForStorage(value)
    .replace(/[^\p{L}\p{N}._/\\-]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
}

function isPathLike(word: string): boolean {
  return word.includes('/') || word.includes('\\') || word.includes('.') || word.includes('-')
}

function activeRecord(record: ProjectMemoryRecord): boolean {
  return record.activo !== false && record.candidato !== true
}

function memoryId(record: ProjectMemoryRecord): string {
  return record.id || createHash('sha256').update(record.dicho).digest('hex').slice(0, 16)
}

function trainingId(record: ProjectTrainingRecord): string {
  return `entrenamiento:${createHash('sha256').update(record.texto).digest('hex').slice(0, 16)}`
}

/**
 * La oración del mensaje que es una corrección o una regla, limpia, o null. No guarda el mensaje
 * entero: la memoria tiene que leerse como una regla, no como una charla.
 */
export function detectCorrection(prompt: string): string | null {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length > 2000) {
    return null
  }
  const sentences = cleaned
    .split(/(?<=[.!?;])\s+|\s+-\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
  for (const sentence of sentences) {
    if (sentence.endsWith('?')) {
      continue
    }
    const atStart = CORRECTION_PATTERNS.some((pattern) => pattern.test(sentence))
    const inside = RULE_WORD.test(sentence) && ACTION_VERB.test(sentence)
    if ((atStart || inside) && sentence.length <= MAX_CORRECTION_CHARS) {
      return sentence
    }
  }
  return null
}

export function rankRelevantMemories(
  prompt: string,
  recuerdos: readonly ProjectMemoryRecord[],
  aprendido: readonly ProjectTrainingRecord[]
): MemoryItem[] {
  const promptWords = normalizedWords(prompt)
  const promptSet = new Set(promptWords)
  const items: MemoryItem[] = [
    ...recuerdos.filter(activeRecord).map((record) => ({
      id: memoryId(record),
      text: record.dicho,
      type: record.tipo
    })),
    ...aprendido.map((record) => ({ id: trainingId(record), text: record.texto }))
  ]
  return items
    .map((item) => {
      const words = normalizedWords(item.text)
      const score = words.reduce((total, word) => {
        if (!promptSet.has(word)) {
          return total
        }
        return total + (isPathLike(word) ? 4 : 1) + (item.type === 'error' ? 2 : 0)
      }, 0)
      return { ...item, score }
    })
    .filter((item) => (item.score ?? 0) > 0)
    .sort(
      (left, right) => (right.score ?? 0) - (left.score ?? 0) || left.text.localeCompare(right.text)
    )
}

function trimItems(items: readonly MemoryItem[], limit: number): MemoryItem[] {
  const result: MemoryItem[] = []
  let length = 0
  for (const item of items) {
    const lineLength = item.text.length + 3
    if (length + lineLength > limit) {
      break
    }
    result.push(item)
    length += lineLength
  }
  return result
}

export function buildStartupContext(
  recuerdos: readonly ProjectMemoryRecord[],
  aprendido: readonly ProjectTrainingRecord[]
): string {
  const items = startupItems(recuerdos, aprendido)
  const selected = trimItems(
    items,
    CONTEXT_CHAR_LIMIT - 'Memoria del proyecto (Dolphin):\n'.length - 1
  )
  return selected.length === 0
    ? ''
    : ['Memoria del proyecto (Dolphin):', ...selected.map((item) => `- ${item.text}`)].join('\n')
}

function startupItems(
  recuerdos: readonly ProjectMemoryRecord[],
  aprendido: readonly ProjectTrainingRecord[]
): MemoryItem[] {
  return [
    ...recuerdos
      .filter(activeRecord)
      .filter(
        (record) =>
          record.tipo === undefined || record.tipo === 'regla' || record.tipo === 'decision'
      )
      .sort((left, right) => Number(right.tipo === 'regla') - Number(left.tipo === 'regla'))
      .map((record) => ({ id: memoryId(record), text: record.dicho, type: record.tipo })),
    ...aprendido.map((record) => ({ id: trainingId(record), text: record.texto }))
  ]
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return Object.fromEntries(Object.entries(value))
}

function hookRecord(body: unknown): Record<string, unknown> {
  const outer = recordFromUnknown(body)
  if (!outer) {
    return {}
  }
  if (typeof outer.payload !== 'string') {
    return outer
  }
  try {
    const payload = recordFromUnknown(JSON.parse(outer.payload))
    return payload ? { ...outer, ...payload } : outer
  } catch {
    return outer
  }
}

function stringField(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function hookResponse(eventName: string, context: string): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext: context }
  })
}

/**
 * Lo que el hook le suma al contexto del agente en terminal: el aviso de Dolphin al arrancar la
 * sesión, haya memoria o no, y la memoria del proyecto cuando la hay.
 */
export async function buildProjectMemoryHookResponse(
  source: 'claude' | 'gemini',
  body: unknown,
  options: ProjectAgentMemoryOptions,
  sentBySession: Set<string>
): Promise<string> {
  const record = hookRecord(body)
  const eventName = stringField(record, 'hook_event_name', 'hookEventName', 'hook_type', 'hookType')
  if (
    !eventName ||
    (source === 'claude' && eventName !== 'SessionStart' && eventName !== 'UserPromptSubmit') ||
    (source === 'gemini' && eventName !== 'BeforeAgent' && eventName !== 'SessionStart')
  ) {
    return ''
  }
  const settings = options.getSettings()
  // Sin deduplicar: SessionStart también llega después de compactar, cuando el aviso se perdió.
  const dolphinContext =
    eventName === 'SessionStart' && settings?.dolphinContextEnabled !== false
      ? DOLPHIN_AGENT_CONTEXT
      : ''
  const memory = await projectMemoryContext(
    source,
    eventName,
    record,
    options,
    settings,
    sentBySession
  )
  const context = [dolphinContext, memory].filter((block) => block.length > 0).join('\n\n')
  return context ? hookResponse(eventName, context) : ''
}

async function projectMemoryContext(
  source: 'claude' | 'gemini',
  eventName: string,
  record: Record<string, unknown>,
  options: ProjectAgentMemoryOptions,
  settings: ProjectAgentMemorySettings | null | undefined,
  sentBySession: Set<string>
): Promise<string> {
  const memoryEnabled = settings?.projectMemoryEnabled !== false
  const learningEnabled = settings?.learnFromCorrections !== false
  if (!memoryEnabled && eventName === 'SessionStart') {
    return ''
  }
  let repoPath: string | null
  try {
    repoPath = options.resolveRepoPath(
      stringField(record, 'worktreeId', 'worktree_id'),
      stringField(record, 'cwd', 'workspaceRoot', 'workspace_root')
    )
  } catch {
    return ''
  }
  if (!repoPath || !projectMemoryDirectory(repoPath)) {
    return ''
  }
  const memory = await readProjectMemory(repoPath)
  const sessionId =
    stringField(record, 'session_id', 'sessionId', 'sessionID', 'paneKey') ?? 'unknown'
  const sessionKey = `${repoPath}\0${sessionId}`
  let context = ''
  const usedIds: string[] = []
  if (eventName === 'SessionStart' && !sentBySession.has(sessionKey)) {
    context = buildStartupContext(memory.recuerdos, memory.aprendido)
    sentBySession.add(sessionKey)
    for (const item of trimItems(
      startupItems(memory.recuerdos, memory.aprendido),
      CONTEXT_CHAR_LIMIT - 'Memoria del proyecto (Dolphin):\n'.length - 1
    )) {
      sentBySession.add(`${sessionKey}\0${item.id}`)
      usedIds.push(item.id)
    }
  } else if (eventName === 'UserPromptSubmit' || eventName === 'BeforeAgent') {
    const prompt = stringField(record, 'prompt', 'message', 'user_prompt') ?? ''
    const correction = learningEnabled ? detectCorrection(prompt) : null
    if (correction) {
      await addProjectMemoryCandidate(repoPath, {
        id: `sesion-${createHash('sha256').update(`${sessionId}\0${correction}`).digest('hex').slice(0, 16)}`,
        dicho: correction,
        tipo: 'regla',
        activo: false,
        candidato: true,
        creado: new Date().toISOString(),
        origen: 'sesion',
        porQue: `Lo dijiste en una sesi\u00f3n de ${source} (${stringField(record, 'worktreeId', 'worktree_id') ?? sessionId})`
      })
    }
    if (!memoryEnabled) {
      return ''
    }
    const selected = rankRelevantMemories(prompt, memory.recuerdos, memory.aprendido).filter(
      (item) => !sentBySession.has(`${sessionKey}\0${item.id}`)
    )
    const bounded = trimItems(selected, PROMPT_CHAR_LIMIT)
    context = bounded.length > 0 ? bounded.map((item) => `- ${item.text}`).join('\n') : ''
    for (const item of bounded) {
      sentBySession.add(`${sessionKey}\0${item.id}`)
      usedIds.push(item.id)
    }
  }
  if (!context) {
    return ''
  }
  await recordProjectMemoryUsage(repoPath, usedIds)
  return eventName === 'SessionStart'
    ? context
    : `Memoria relevante del proyecto (Dolphin):\n${context}`
}
