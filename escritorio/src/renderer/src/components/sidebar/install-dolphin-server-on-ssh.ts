import type { EditingTarget } from '../ssh-host-form/ssh-target-draft'
import type {
  DolphindSshProvisioningRequest,
  DolphindSshProvisioningResult
} from '../../../../shared/dolphind-ssh-provisioning'
import { translate } from '@/i18n/i18n'
import { sshTargetFromForm } from './ssh-target-from-form'

export type ServerInstallOutcome =
  /** The machine is registered and its server is up. */
  | { kind: 'ready'; name: string }
  /** The host already had Dolphin projects, so it was kept as a plain SSH host. */
  | { kind: 'kept-as-host'; reason: string }
  /** Registered, but the install did not finish: the request can be resumed. */
  | { kind: 'unfinished'; reason: string; requestId: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; message: string }

export type ServerInstallApi = {
  createSshHost: (args: DolphindSshProvisioningRequest) => Promise<DolphindSshProvisioningResult>
}

/** A stable id per attempt: the main process writes the intent before touching the host. */
export function newProvisioningRequestId(): string {
  return `prov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Register a machine and install Dolphin's server on it, in one go.
 *
 * The two halves existed separately: add an SSH host in one settings pane, then install the
 * server from another. Nobody who just wants their work to run on their own box should have to
 * know that those are two things, let alone that the second one is called a daemon.
 *
 * Every outcome here is a real state of the machine, not a success/failure pair: a host that
 * already has Dolphin projects on it cannot take a managed server and stays a plain SSH host —
 * that is not an error, and saying "failed" would hide that the machine *was* added. An install
 * that dies halfway leaves a resumable request, which is why the id is made by the caller.
 */
export async function installDolphinServerOnSsh({
  form,
  name,
  requestId,
  api
}: {
  form: EditingTarget
  name: string
  requestId: string
  api: ServerInstallApi
}): Promise<ServerInstallOutcome> {
  const trimmed = name.trim()
  if (!trimmed) {
    return {
      kind: 'invalid',
      message: translate(
        'components.landing.connect.nameRequired',
        'Give the machine a name so you can tell it apart later.'
      )
    }
  }
  const armado = sshTargetFromForm(form)
  if (!armado.ok) {
    return { kind: 'invalid', message: armado.message }
  }
  let result: DolphindSshProvisioningResult
  try {
    result = await api.createSshHost({ requestId, name: trimmed, target: armado.target })
  } catch (error) {
    return {
      kind: 'failed',
      message:
        error instanceof Error
          ? error.message
          : translate('components.landing.connect.failed', 'Could not set up that machine.')
    }
  }
  const outcome = result.result
  // Asked by the shape and not by the outcome name: the ones that worked —created, updated,
  // already there— are exactly the ones that carry no reason, and a name added to that list
  // later would otherwise be read here as a failure with an undefined motive.
  if (!('reason' in outcome)) {
    return { kind: 'ready', name: trimmed }
  }
  // Re-adopted projects are what makes a host non-empty, and a non-empty host cannot take a
  // managed server: it stays a plain SSH host, which is an outcome and not a failure.
  if (result.repoReadoptions.length > 0) {
    return { kind: 'kept-as-host', reason: outcome.reason }
  }
  return { kind: 'unfinished', reason: outcome.reason, requestId: result.requestId }
}
