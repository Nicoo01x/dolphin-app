/** Stop files reach only the watching dolphind; signals from stale PID records could stop an unrelated reused process. */
import { z } from 'zod'
import { openEnum } from './zod-salvage'

/** Plain request in the slot directory: the same graceful stop as SIGTERM. */
export const DOLPHIND_STOP_REQUEST_FILENAME = '.dolphind-stop-request'
/** Prefix of an instance-bound request in the data root; older listeners never match it. */
export const DOLPHIND_MANAGED_STOP_REQUEST_PREFIX = '.dolphind-managed-stop-request'
export const DOLPHIND_MANAGED_STOP_REQUEST_MAX_BYTES = 32 * 1024
export const DOLPHIND_STOP_RECEIPTS_DIRNAME = 'dolphind-stop-receipts'
export const DOLPHIND_COMPLETE_MANAGED_STOP_FLAG = '--complete-managed-stop'
/** Names a staged request file instead of inline JSON; Windows hosts never put the JSON on argv. */
export const DOLPHIND_MANAGED_STOP_REQUEST_FILE_FLAG = '--request-file'

/** One dolphind process: its PID, start time, and the instance lock record it published. */
export const DolphindManagedStopInstanceSchema = z.object({
  pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  startedAtMs: z.number().finite().nonnegative().nullable(),
  /** Linux only, copied from the lock; older clients omit it and older slots drop it. */
  linuxStartTicks: z.string().regex(/^\d+$/).max(32).optional().catch(undefined),
  bootId: z.string().min(1).max(255).optional().catch(undefined),
  nonce: z.string().min(1).max(255),
  lockPath: z.string().min(1).max(4096)
})

// Older slots drop newer optional request fields rather than refuse the stop.
export const DolphindManagedStopRequestSchema = z.object({
  schemaVersion: z.literal(1),
  transactionId: z.uuid(),
  version: z.string().min(1).max(255),
  runtimeId: z.string().min(1).max(255),
  instance: DolphindManagedStopInstanceSchema,
  /** Best effort: also retire the terminal daemon if it is provably idle. Never blocks the stop. */
  retireIdleDaemon: z.literal(true).optional()
})

export type DolphindManagedStopInstance = z.infer<typeof DolphindManagedStopInstanceSchema>
export type DolphindManagedStopRequest = z.infer<typeof DolphindManagedStopRequestSchema>

/** Equality key for a request; omits the incarnation, which an older client recovering it drops. */
export function dolphindManagedStopRequestKey(request: DolphindManagedStopRequest): string {
  const { instance, ...rest } = DolphindManagedStopRequestSchema.parse(request)
  const { linuxStartTicks: _ticks, bootId: _bootId, ...bound } = instance
  return JSON.stringify({ ...rest, instance: bound })
}
/** What a stopping dolphind must match before a managed request may stop it. */
export type DolphindManagedStopContext = Omit<
  DolphindManagedStopRequest,
  'schemaVersion' | 'transactionId'
>

const STOP_VERDICTS = ['live', 'unverifiable', 'exited'] as const
const RETIREMENT_VERDICTS = ['retired', 'live', 'unverifiable'] as const

/** The execution host's verdict; `exited` only on proof, never on silence. */
export const DolphindManagedStopVerdictSchema = z.enum(STOP_VERDICTS)

/** `retired` only when the daemon accepted; a busy daemon stays up and keeps its terminals. */
export const DolphindDaemonRetirementVerdictSchema = z.enum(RETIREMENT_VERDICTS)

// Read by clients older than the slot that printed them: unknown fields and arms degrade.
const stopReplyRequestFields = DolphindManagedStopRequestSchema.shape

export const DolphindManagedStopCompletionSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('dolphind_managed_stop_completion'),
  verdict: openEnum(STOP_VERDICTS, 'unverifiable'),
  receiptPersisted: z.boolean(),
  /** For a request that asked to retire the daemon, the outcome its receipt recorded. */
  retirement: openEnum(RETIREMENT_VERDICTS, 'unverifiable').optional()
})

/** What the stopping dolphind observed about its daemon, written before it exits. */
export const DolphindDaemonRetirementRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('dolphind_managed_stop_retirement'),
  request: DolphindManagedStopRequestSchema,
  retirement: DolphindDaemonRetirementVerdictSchema,
  liveSessions: z.number().int().nonnegative().nullable(),
  reason: z.string().max(4096).nullable()
})

export const DolphindCompletedStopReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('dolphind_managed_stop_completed'),
  request: DolphindManagedStopRequestSchema,
  exitedAt: z.iso.datetime({ offset: true }),
  /** Present only when the request asked to retire the daemon. */
  retirement: DolphindDaemonRetirementVerdictSchema.optional()
})

export type DolphindManagedStopVerdict = z.infer<typeof DolphindManagedStopVerdictSchema>
export type DolphindManagedStopCompletion = z.infer<typeof DolphindManagedStopCompletionSchema>
export type DolphindCompletedStopReceipt = z.infer<typeof DolphindCompletedStopReceiptSchema>
export type DolphindDaemonRetirementVerdict = z.infer<typeof DolphindDaemonRetirementVerdictSchema>
export type DolphindDaemonRetirementRecord = z.infer<typeof DolphindDaemonRetirementRecordSchema>

export const DOLPHIND_CANCEL_MANAGED_STOP_FLAG = '--cancel-managed-stop'
/** Readiness `health.stopRequests`: this build consumes stop files and both commands above. */
export const DOLPHIND_STOP_REQUESTS_CAPABILITY = 1

/** Exclusive per-transaction creation ensures only dolphind dispatch or client cancellation can win. */
export const DolphindManagedStopDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('dolphind_managed_stop_decision'),
  request: DolphindManagedStopRequestSchema,
  decision: z.enum(['dispatched', 'canceled'])
})

/** `dispatched` means dolphind already acted on the request; the caller must await its exit. */
export const DolphindManagedStopCancellationSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('dolphind_managed_stop_cancellation'),
  // Unknown degrades to `dispatched`: the caller then awaits exit rather than assume a cancel.
  outcome: openEnum(['canceled', 'dispatched'], 'dispatched')
})

export type DolphindManagedStopDecision = z.infer<typeof DolphindManagedStopDecisionSchema>
export type DolphindManagedStopCancellation = z.infer<typeof DolphindManagedStopCancellationSchema>
