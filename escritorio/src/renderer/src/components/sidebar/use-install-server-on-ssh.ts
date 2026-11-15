import React from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { EditingTarget } from '../ssh-host-form/ssh-target-draft'
import {
  installDolphinServerOnSsh,
  newProvisioningRequestId,
  type ServerInstallOutcome
} from './install-dolphin-server-on-ssh'

export type InstallServerOnSsh = {
  name: string
  setName: (value: string) => void
  installing: boolean
  outcome: ServerInstallOutcome | null
  install: () => Promise<void>
  reset: () => void
}

/**
 * The dialog's side of connecting a machine: the name, the attempt, and what came back.
 *
 * Its own `installing` flag and not the dialog's shared one: an install takes minutes and the
 * dialog can be closed while it runs — the request is written before the host is touched, so
 * the work survives — while the other flows in that dialog must hold it open until they finish.
 *
 * The request id lives in a ref so a re-render does not start a second attempt: the main
 * process keys the whole provisioning on it, and a new id would contact the host again.
 */
export function useInstallServerOnSsh({ form }: { form: EditingTarget }): InstallServerOnSsh {
  const setSshTargetsMetadata = useAppStore((s) => s.setSshTargetsMetadata)
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [name, setName] = React.useState('')
  const [installing, setInstalling] = React.useState(false)
  const [outcome, setOutcome] = React.useState<ServerInstallOutcome | null>(null)
  const requestId = React.useRef(newProvisioningRequestId())

  const reset = React.useCallback((): void => {
    setName('')
    setOutcome(null)
    setInstalling(false)
    requestId.current = newProvisioningRequestId()
  }, [])

  const install = React.useCallback(async (): Promise<void> => {
    // `managedDolphind` is the key the preload still uses for the managed-server API, and it is
    // absent on web clients, where there is no SSH to install over.
    const api = window.api.runtimeEnvironments.managedDolphind
    if (!api) {
      setOutcome({
        kind: 'failed',
        message: translate(
          'components.landing.connect.desktopOnly',
          'Installing a server on a machine is done from the desktop app.'
        )
      })
      return
    }
    setInstalling(true)
    setOutcome(null)
    try {
      const result = await installDolphinServerOnSsh({
        form,
        name,
        requestId: requestId.current,
        api
      })
      setOutcome(result)
      if (result.kind === 'invalid') {
        return
      }
      // Every other outcome changed the machine list — even the ones that did not finish, which
      // leave the host registered — so the app re-reads it before anyone picks a run target.
      setSshTargetsMetadata(await window.api.ssh.listTargets())
      setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      await readRuntimeHostStatusSnapshots()
      recordFeatureInteraction('ssh')
      if (result.kind === 'ready') {
        toast.success(
          translate('components.landing.connect.ready', '{{value0}} is ready.', {
            value0: result.name
          })
        )
      }
    } finally {
      setInstalling(false)
    }
  }, [
    form,
    name,
    readRuntimeHostStatusSnapshots,
    recordFeatureInteraction,
    setRuntimeEnvironments,
    setSshTargetsMetadata
  ])

  return { name, setName, installing, outcome, install, reset }
}
