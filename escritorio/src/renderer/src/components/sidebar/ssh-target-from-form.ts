import { translate } from '@/i18n/i18n'
import { getSshTargetDraftConnectionFields, type EditingTarget } from '../ssh-host-form/ssh-target-draft'
import type { SshTargetCreateInput } from '../../../../shared/ssh-types'

export type SshTargetFromForm =
  /** `configHost` is always set here — the duplicate check compares aliases, not maybes. */
  | { ok: true; target: SshTargetCreateInput & { configHost: string } }
  | { ok: false; message: string }

/**
 * The form a person filled in, turned into the host Dolphin stores.
 *
 * Shared by the two things that can be done with those fields — save the host, or save it and
 * install the server on it in one step — because the validation is the same and a second copy
 * of it is a second set of rules: the one-step path would have accepted a port of 0 the moment
 * this one started refusing it.
 *
 * The label falls back to `user@host` and not to an empty string: a host with no name is a blank
 * row in every picker that lists machines.
 */
export function sshTargetFromForm(form: EditingTarget): SshTargetFromForm {
  const { host, configHost, username, port } = getSshTargetDraftConnectionFields(form)
  if (!host) {
    return {
      ok: false,
      message: translate(
        'auto.components.sidebar.AddRemoteHostDialog.sshHostRequired',
        'Host or SSH config alias is required.'
      )
    }
  }
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      message: translate(
        'auto.components.sidebar.AddRemoteHostDialog.sshPortInvalid',
        'Port must be between 1 and 65535.'
      )
    }
  }
  const identityFile = form.identityFile.trim() || undefined
  const proxyCommand = form.proxyCommand.trim() || undefined
  const jumpHost = form.jumpHost.trim() || undefined
  const systemSshConnectionReuse = form.systemSshConnectionReuse ? undefined : false
  return {
    ok: true,
    target: {
      label: form.label.trim() || (username ? `${username}@${host}` : configHost || host),
      configHost,
      host,
      port,
      username,
      ...(form.gssapiAuthentication ? { gssapiAuthentication: true } : {}),
      ...(identityFile ? { identityFile } : {}),
      ...(proxyCommand ? { proxyCommand } : {}),
      ...(jumpHost ? { jumpHost } : {}),
      ...(systemSshConnectionReuse === false ? { systemSshConnectionReuse } : {}),
      // Why explicit both ways: absent means on here, and off on a server from before the
      // default flip.
      allowRemoteCliControl: form.allowRemoteCliControl
    }
  }
}
