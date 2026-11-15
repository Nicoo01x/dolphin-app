// Compact multi-KB dispatch boilerplate so preamble identity, task id and task-body fallback all fit AGENT_STATUS_MAX_FIELD_LENGTH.

// Acá había dos constantes, una con el preámbulo viejo, para que los transcripts de antes del
// cambio de nombre siguieran reconociéndose como dispatch. Las dos ya decían lo mismo.
export const DOLPHIN_DISPATCH_STATUS_PREAMBLE_PREFIX =
  'You are working inside Dolphin, a multi-agent IDE.'
export const DOLPHIN_DISPATCH_STATUS_TASK_MARKER = '=== TASK ==='
// Type this lead: Claude follows pasted briefs only when user prose explicitly asks; bare pasted_content was refused (STA-8200).
export const DOLPHIN_DISPATCH_PROMPT_LEAD_LINE =
  'Please carry out this task from my Dolphin coordinator by following the brief I pasted below.'
const DOLPHIN_DISPATCH_STATUS_TASK_ID_MARKER = 'Your task ID is:'
// Real task markers follow 4KB+ preambles; scan beyond the one-line preview budget to reach the body.
const DOLPHIN_DISPATCH_STATUS_SOURCE_SCAN_LIMIT = 24_576
const PASTED_CONTENT_OPEN_TAG = '<pasted_content'
// Why: Claude Code's tag carries only a short id; bound the search for `>`.
const PASTED_CONTENT_OPEN_TAG_MAX_LENGTH = 64

/** Find preamble start or -1 through optional typed lead/pasted_content wrappers, including older hosts’ bare preambles. */
export function findDolphinDispatchPreambleStart(value: string): number {
  // Bound trusted-shape detection too: arbitrary leading whitespace must not bypass the status normalizer’s scan cap.
  const scanEnd = Math.min(value.length, DOLPHIN_DISPATCH_STATUS_SOURCE_SCAN_LIMIT)
  let start = skipTrimWhitespace(value, 0, scanEnd)
  const leadLine = [DOLPHIN_DISPATCH_PROMPT_LEAD_LINE, DOLPHIN_DISPATCH_PROMPT_LEAD_LINE].find(
    (candidate) => value.startsWith(candidate, start)
  )
  if (leadLine) {
    start = skipTrimWhitespace(value, start + leadLine.length, scanEnd)
  }
  if (value.startsWith(PASTED_CONTENT_OPEN_TAG, start)) {
    const tagLength = value.slice(start, start + PASTED_CONTENT_OPEN_TAG_MAX_LENGTH).indexOf('>')
    if (tagLength === -1) {
      return -1
    }
    start = skipTrimWhitespace(value, start + tagLength + 1, scanEnd)
  }
  return [DOLPHIN_DISPATCH_STATUS_PREAMBLE_PREFIX, DOLPHIN_DISPATCH_STATUS_PREAMBLE_PREFIX].some(
    (prefix) => start + prefix.length <= scanEnd && value.startsWith(prefix, start)
  )
    ? start
    : -1
}

function skipTrimWhitespace(value: string, from: number, scanEnd: number): number {
  let index = from
  while (index < scanEnd && isEcmaTrimWhitespace(value.charCodeAt(index))) {
    index++
  }
  return index
}

/** Single-line <prefix> Your task ID is: <id> === TASK === <body> status preview; null for non-dispatch prompts. */
export function compactDispatchPromptForStatus(
  value: string,
  maxLength: number,
  normalizeSingleLine: (value: string, maxLength: number) => string
): string | null {
  const start = findDolphinDispatchPreambleStart(value)
  if (start === -1) {
    return null
  }
  const scan = value.slice(start, Math.min(value.length, DOLPHIN_DISPATCH_STATUS_SOURCE_SCAN_LIMIT))

  let taskId = ''
  const idMarkerIndex = scan.indexOf(DOLPHIN_DISPATCH_STATUS_TASK_ID_MARKER)
  if (idMarkerIndex !== -1) {
    const afterId = scan.slice(idMarkerIndex + DOLPHIN_DISPATCH_STATUS_TASK_ID_MARKER.length)
    let idStart = 0
    while (idStart < afterId.length && isEcmaTrimWhitespace(afterId.charCodeAt(idStart))) {
      idStart++
    }
    const idRest = afterId.slice(idStart)
    const idEnd = idRest.search(/\s/)
    taskId = (idEnd === -1 ? idRest : idRest.slice(0, idEnd)).trim()
  }

  let taskBody = ''
  const taskMarkerIndex = findDolphinDispatchTaskMarkerIndex(scan)
  if (taskMarkerIndex !== -1) {
    const body = scan.slice(taskMarkerIndex + DOLPHIN_DISPATCH_STATUS_TASK_MARKER.length)
    for (const line of body.split(/\r?\n/)) {
      const preview = line.trim().replace(/\s+/g, ' ')
      if (preview.startsWith('</pasted_content')) {
        break
      }
      if (preview) {
        taskBody = preview
        break
      }
    }
  }

  // Retain preamble identity, task-label id and fallback body inside the 200-character status field.
  let compact = DOLPHIN_DISPATCH_STATUS_PREAMBLE_PREFIX
  if (taskId) {
    compact += ` ${DOLPHIN_DISPATCH_STATUS_TASK_ID_MARKER} ${taskId}`
  }
  if (taskBody) {
    compact += ` ${DOLPHIN_DISPATCH_STATUS_TASK_MARKER} ${taskBody}`
  }
  return normalizeSingleLine(compact, maxLength)
}

/** Require standalone === TASK === in multiline preambles because repository-controlled commit subjects may quote it.
 * Normalized single-line previews retain inline markers for idempotent cross-hop/UI reads. */
export function findDolphinDispatchTaskMarkerIndex(value: string): number {
  let searchFrom = 0
  while (searchFrom < value.length) {
    const markerIndex = value.indexOf(DOLPHIN_DISPATCH_STATUS_TASK_MARKER, searchFrom)
    if (markerIndex === -1) {
      break
    }
    const markerEnd = markerIndex + DOLPHIN_DISPATCH_STATUS_TASK_MARKER.length
    const startsLine = markerIndex === 0 || isLineBreak(value.charCodeAt(markerIndex - 1))
    const endsLine = markerEnd === value.length || isLineBreak(value.charCodeAt(markerEnd))
    if (startsLine && endsLine) {
      return markerIndex
    }
    searchFrom = markerEnd
  }

  // Already-normalized dispatch previews are single-line and intentionally
  // carry the marker inline; normalization must stay idempotent across hops.
  return value.includes('\n') || value.includes('\r')
    ? -1
    : value.indexOf(DOLPHIN_DISPATCH_STATUS_TASK_MARKER)
}

/** Offset into the original task input; detection is bounded, the authored suffix is not. */
export function dolphinDispatchTaskBodyOffset(value: string): number | undefined {
  const start = findDolphinDispatchPreambleStart(value)
  if (start === -1) {
    return undefined
  }
  const scanEnd = Math.min(value.length, DOLPHIN_DISPATCH_STATUS_SOURCE_SCAN_LIMIT)
  const scan = value.slice(start, scanEnd)
  const marker = findDolphinDispatchTaskMarkerIndex(scan)
  if (marker === -1) {
    return undefined
  }
  let offset = start + marker + DOLPHIN_DISPATCH_STATUS_TASK_MARKER.length
  // A marker at the scan bound must still end its original delimiter line.
  if (
    offset < value.length &&
    !isLineBreak(value.charCodeAt(offset)) &&
    (scan.includes('\n') || scan.includes('\r'))
  ) {
    return undefined
  }
  if (value.charCodeAt(offset) === 13) {
    offset++
  }
  if (value.charCodeAt(offset) === 10) {
    offset++
  }
  return offset
}

function isLineBreak(code: number): boolean {
  return code === 10 || code === 13
}

function isEcmaTrimWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  )
}
