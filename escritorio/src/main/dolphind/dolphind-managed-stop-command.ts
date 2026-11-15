// Exit 0 means JSON was printed; read its outcome. Exit 64 is invalid input, 1 is failure without exit proof.
import {
  DOLPHIND_CANCEL_MANAGED_STOP_FLAG,
  DOLPHIND_COMPLETE_MANAGED_STOP_FLAG,
  DOLPHIND_MANAGED_STOP_REQUEST_FILE_FLAG,
  DolphindManagedStopRequestSchema,
  type DolphindManagedStopCancellation,
  type DolphindManagedStopCompletion,
  type DolphindManagedStopRequest
} from '../../shared/dolphind-stop-request'
import { cancelDolphindManagedStop } from './dolphind-managed-stop-cancellation'
import { readDolphindCompletedStopReceipt } from './dolphind-completed-stop-receipt'
import { readDolphindManagedStopRequest } from './dolphind-managed-stop-request'
import { ZodError } from 'zod'
import {
  completeDolphindManagedStop,
  type DolphindManagedStopCompletionOptions
} from './dolphind-managed-stop-completion'

export async function runDolphindManagedStopCommand(
  argv: readonly string[],
  options: DolphindManagedStopCompletionOptions = {}
): Promise<DolphindManagedStopCompletion> {
  const request = parseRequestArgument(argv, DOLPHIND_COMPLETE_MANAGED_STOP_FLAG)
  const verdict = await completeDolphindManagedStop(request, options)
  const retirement =
    verdict === 'exited' && request.retireIdleDaemon
      ? readDolphindCompletedStopReceipt(request)?.retirement
      : undefined
  const completion: DolphindManagedStopCompletion = {
    ...request,
    kind: 'dolphind_managed_stop_completion',
    verdict,
    receiptPersisted: verdict === 'exited',
    ...(retirement ? { retirement } : {})
  }
  process.stdout.write(`${JSON.stringify(completion)}\n`)
  return completion
}

export function runDolphindManagedStopCancelCommand(
  argv: readonly string[]
): DolphindManagedStopCancellation {
  const request = parseRequestArgument(argv, DOLPHIND_CANCEL_MANAGED_STOP_FLAG)
  const cancellation: DolphindManagedStopCancellation = {
    ...request,
    kind: 'dolphind_managed_stop_cancellation',
    outcome: cancelDolphindManagedStop(request)
  }
  process.stdout.write(`${JSON.stringify(cancellation)}\n`)
  return cancellation
}

function parseRequestArgument(argv: readonly string[], flag: string): DolphindManagedStopRequest {
  if (argv[0] !== flag) {
    throw new Error('dolphind_managed_stop_invalid_arguments')
  }
  if (argv[1] === DOLPHIND_MANAGED_STOP_REQUEST_FILE_FLAG) {
    if (argv.length !== 3 || !argv[2]) {
      throw new Error('dolphind_managed_stop_invalid_arguments')
    }
    return readDolphindManagedStopRequest(argv[2])
  }
  if (argv.length !== 2 || !argv[1]) {
    throw new Error('dolphind_managed_stop_invalid_arguments')
  }
  return DolphindManagedStopRequestSchema.parse(JSON.parse(argv[1]))
}

export const DOLPHIND_MANAGED_STOP_EXIT_VERDICT = 0
export const DOLPHIND_MANAGED_STOP_EXIT_FAILED = 1
export const DOLPHIND_MANAGED_STOP_EXIT_USAGE = 64

export async function runDolphindManagedStopCommandAndExit(argv: readonly string[]): Promise<void> {
  let code = DOLPHIND_MANAGED_STOP_EXIT_VERDICT
  try {
    if (argv[0] === DOLPHIND_CANCEL_MANAGED_STOP_FLAG) {
      runDolphindManagedStopCancelCommand(argv)
    } else {
      await runDolphindManagedStopCommand(argv)
    }
  } catch (error) {
    console.error('dolphind: managed stop failed:', error)
    code =
      error instanceof ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === 'dolphind_managed_stop_invalid_arguments')
        ? DOLPHIND_MANAGED_STOP_EXIT_USAGE
        : DOLPHIND_MANAGED_STOP_EXIT_FAILED
  }
  // Drain stdout before exit: callers read the result to EOF.
  process.stdout.write('', () => process.exit(code))
}
