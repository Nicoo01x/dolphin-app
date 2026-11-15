import { isDolphinSessionId, type DolphinSessionId } from '../../../../../shared/dolphin-session-address'
import {
  clearedInto,
  readAgentSessionRecordStore,
  type AgentSessionRecordReader
} from './structured-session-lineage'

/** Address by the /clear root to preserve Runs and mail; without records, retain the supplied id. */
export function canonicalDolphinSessionId(
  dolphinSessionId: DolphinSessionId,
  store: Pick<
    AgentSessionRecordReader,
    'listRecords' | 'lineageRevision'
  > | null = readAgentSessionRecordStore()
): DolphinSessionId {
  return createCanonicalDolphinSessionResolver(store)(dolphinSessionId)
}

/** Clear edges per lineage revision: mail checks ask per message, and must not rescan every record each time. */
const clearEdgesByRevision = new WeakMap<object, ReadonlyMap<string, string>>()

export function createCanonicalDolphinSessionResolver(
  store: Pick<AgentSessionRecordReader, 'listRecords' | 'lineageRevision'> | null
): (id: DolphinSessionId) => DolphinSessionId {
  if (!store) {
    return (id) => id
  }
  const revision = store.lineageRevision?.()
  let clearedFrom = revision ? clearEdgesByRevision.get(revision) : undefined
  if (!clearedFrom) {
    const edges = new Map<string, string>()
    for (const record of store.listRecords()) {
      const next = clearedInto(record)
      if (next) {
        edges.set(next, record.sessionId)
      }
    }
    clearedFrom = edges
    if (revision) {
      clearEdgesByRevision.set(revision, edges)
    }
  }
  const edges = clearedFrom
  return (id) => canonicalDolphinSessionFromEdges(id, edges)
}

export function canonicalDolphinSessionFromEdges(
  dolphinSessionId: DolphinSessionId,
  clearedFrom: ReadonlyMap<string, string>
): DolphinSessionId {
  // The visited set bounds corrupt chains; valid clear lineage is acyclic.
  let root: string = dolphinSessionId
  const earlier = new Set([root])
  let prior = clearedFrom.get(root)
  while (prior && !earlier.has(prior)) {
    earlier.add(prior)
    root = prior
    prior = clearedFrom.get(root)
  }
  // Record ids are minted as Dolphin session ids; one that is not cannot name the conversation.
  return isDolphinSessionId(root) ? root : dolphinSessionId
}
