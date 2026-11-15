import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getEditingTargetFromSshConfigHost,
  hasAdvancedConnectionValues,
  type EditingTarget
} from '../../../ssh-host-form/ssh-target-draft'
import { sshTargetFromForm } from '../../ssh-target-from-form'
import {
  SSH_CONFIG_HOST_RESULT_LIMIT,
  type SshConfigHostSummary,
  type SshConfigHostListArgs,
  type SshConfigHostListResult,
  type SshConfigHostResolution,
  type SshRepoReadoption,
  type SshTarget,
  type SshTargetAddResult,
  type SshTargetCreateInput
} from '../../../../../../shared/ssh-types'

import { isDuplicateSshTargetAlias } from './ssh-target-duplicate'

type SshApi = {
  listTargets: () => Promise<SshTarget[]>
  addTarget: (args: { target: SshTargetCreateInput }) => Promise<SshTargetAddResult>
  listConfigHosts: (args?: SshConfigHostListArgs) => Promise<SshConfigHostListResult>
  resolveConfigHost: (args: { alias: string }) => Promise<SshConfigHostResolution | null>
  importConfig: (args?: { reAdopt?: boolean }) => Promise<{
    targets: SshTarget[]
    repoReadoptions: SshRepoReadoption[]
  }>
}

type SavedSshHost = Pick<SshTarget, 'configHost' | 'label' | 'host'>

/** `ssh` is this client's own API or a paired server's (whose hosts never touch local metadata). */
export async function saveNewSshHostFromForm<T extends SavedSshHost>({
  form,
  ssh,
  recordSshRepoReadoptions,
  setSshTargetsMetadata,
  recordFeatureInteraction
}: {
  form: EditingTarget
  ssh: {
    listTargets: () => Promise<T[]>
    addTarget: (args: {
      target: SshTargetCreateInput
    }) => Promise<{ repoReadoptions: SshRepoReadoption[] }>
  }
  recordSshRepoReadoptions: (readoptions: readonly SshRepoReadoption[]) => void
  setSshTargetsMetadata: (targets: T[]) => void
  recordFeatureInteraction: (feature: 'ssh') => void
}): Promise<'saved' | 'validation-failed' | 'failed'> {
  const armado = sshTargetFromForm(form)
  if (!armado.ok) {
    toast.error(armado.message)
    return 'validation-failed'
  }
  // Why the spread: `sshTargetFromForm` predates the proxy-reuse toggle, so it is added here
  // until that shared builder carries it too.
  const target = {
    ...armado.target,
    ...(form.systemSshProxyConnectionReuse ? { systemSshProxyConnectionReuse: true } : {})
  }

  try {
    const existingTargets = await ssh.listTargets()
    if (
      isDuplicateSshTargetAlias({
        existingTargets,
        configHost: target.configHost,
        label: target.label,
        host: target.host
      })
    ) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshAlreadyExists',
          'That SSH host is already in Dolphin.'
        )
      )
      return 'validation-failed'
    }

    const result = await ssh.addTarget({ target })
    recordSshRepoReadoptions(result.repoReadoptions)
    setSshTargetsMetadata(await ssh.listTargets())
    recordFeatureInteraction('ssh')
    toast.success(
      translate('auto.components.sidebar.AddRemoteHostDialog.sshSaved', 'SSH host added.')
    )
    return 'saved'
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.sidebar.AddRemoteHostDialog.sshSaveFailed',
            'Failed to add SSH host.'
          )
    )
    return 'failed'
  }
}

export async function prefillFormFromSshConfigHost(
  host: SshConfigHostSummary,
  ssh: Pick<SshApi, 'resolveConfigHost'>
): Promise<{
  form: EditingTarget
  preferAdvancedOpen: boolean
} | null> {
  if (typeof ssh.resolveConfigHost !== 'function') {
    throw new Error(
      translate(
        'auto.components.sidebar.AddRemoteHostDialog.sshConfigPickerRestartRequired',
        'Restart Dolphin to finish applying the SSH config picker update.'
      )
    )
  }
  const resolved = await ssh.resolveConfigHost({ alias: host.alias })
  if (!resolved) {
    return null
  }
  const form = getEditingTargetFromSshConfigHost(resolved)
  return {
    form,
    preferAdvancedOpen: hasAdvancedConnectionValues(form)
  }
}

export async function addAllSshConfigHostsToDolphin({
  ssh,
  recordSshRepoReadoptions,
  setSshTargetsMetadata,
  recordFeatureInteraction
}: {
  ssh: SshApi
  recordSshRepoReadoptions: (readoptions: readonly SshRepoReadoption[]) => void
  setSshTargetsMetadata: (targets: SshTarget[]) => void
  recordFeatureInteraction: (feature: 'ssh') => void
}): Promise<{ kind: 'added'; count: number } | { kind: 'already-synced' } | { kind: 'failed' }> {
  try {
    // Import only newly counted hosts; re-adopting deleted aliases remains an explicit Settings action.
    const result = await ssh.importConfig()
    recordSshRepoReadoptions(result.repoReadoptions)
    setSshTargetsMetadata(await ssh.listTargets())
    recordFeatureInteraction('ssh')
    if (result.targets.length === 0) {
      toast(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshImportAlreadySynced',
          '~/.ssh/config already in sync.'
        )
      )
      return { kind: 'already-synced' }
    }
    toast.success(
      translate(
        'auto.components.sidebar.AddRemoteHostDialog.sshImportSynced',
        'Added {{count}} hosts to Dolphin.',
        { count: result.targets.length, defaultValue_one: 'Added {{count}} host to Dolphin.' }
      )
    )
    return { kind: 'added', count: result.targets.length }
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.sidebar.AddRemoteHostDialog.sshImportFailed',
            'Failed to import SSH config.'
          )
    )
    return { kind: 'failed' }
  }
}

export async function loadSshConfigHostsForPicker(
  ssh: SshApi,
  args?: SshConfigHostListArgs
): Promise<{ ok: true; result: SshConfigHostListResult } | { ok: false; error: string }> {
  try {
    const listed: unknown = await ssh.listConfigHosts(args)
    const result = normalizeSshConfigHostListResult(listed)
    if (!result) {
      throw new Error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshConfigPickerInvalidResponse',
          'Invalid SSH config host response'
        )
      )
    }
    return { ok: true, result }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.sidebar.AddRemoteHostDialog.sshConfigPickerLoadFailed',
              'Failed to read ~/.ssh/config.'
            )
    }
  }
}

function normalizeSshConfigHostListResult(value: unknown): SshConfigHostListResult | null {
  // Why: a renderer hot reload can briefly outlive the preload that returned the legacy array.
  if (Array.isArray(value)) {
    const hosts = value.slice(0, SSH_CONFIG_HOST_RESULT_LIMIT) as SshConfigHostSummary[]
    return {
      hosts,
      totalHostCount: value.length,
      newHostCount: value.filter(
        (host): host is SshConfigHostSummary =>
          typeof host === 'object' && host !== null && host.alreadyInDolphin === false
      ).length,
      matchCount: value.length,
      hasMore: value.length > hosts.length
    }
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const result = value as Partial<SshConfigHostListResult>
  return Array.isArray(result.hosts) &&
    typeof result.totalHostCount === 'number' &&
    typeof result.newHostCount === 'number' &&
    typeof result.matchCount === 'number' &&
    typeof result.hasMore === 'boolean'
    ? (result as SshConfigHostListResult)
    : null
}
