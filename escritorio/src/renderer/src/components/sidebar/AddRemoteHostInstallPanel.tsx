import React from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { EditingTarget } from '../ssh-host-form/ssh-target-draft'
import { SshHostFields } from './host-admission/ssh/AddRemoteHostFields'
import type { ServerInstallOutcome } from './install-dolphin-server-on-ssh'

/**
 * Connect a machine: its SSH details, a name, and Dolphin installs its server on it.
 *
 * One screen for what used to be two trips through settings — add the SSH host in one pane,
 * then find "set up Dolphin on an SSH host" in another. Nobody who wants their work to run on
 * their own server should have to learn that those are two things.
 *
 * It says plainly what the install does before it runs, because it writes to someone's machine:
 * it uploads a prebuilt server, pins its own Node, and starts it on a port of its own. And it
 * can be closed while it works — the request is written before the host is touched, so what is
 * running keeps running and can be resumed.
 */
export function AddRemoteHostInstallPanel({
  form,
  name,
  installing,
  outcome,
  onFormChange,
  onNameChange,
  onSubmit,
  onCancel
}: {
  form: EditingTarget
  name: string
  installing: boolean
  /** The last answer from the host, kept on screen: some of them are not failures. */
  outcome: ServerInstallOutcome | null
  onFormChange: (updater: (prev: EditingTarget) => EditingTarget) => void
  onNameChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}): React.JSX.Element {
  const nameId = React.useId()
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate('components.landing.connect.title', 'Connect a machine')}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'components.landing.connect.description',
            'Dolphin installs its server on a machine you can reach over SSH, and from then on your work can run there: terminals, git, files and agents. Your code stays where it is.'
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{translate('components.landing.connect.name', 'Name')}</Label>
        <Input
          id={nameId}
          value={name}
          disabled={installing}
          placeholder={translate('components.landing.connect.namePlaceholder', 'my server')}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <SshHostFields
        form={form}
        disabled={installing}
        preferAdvancedOpen={false}
        configIdentityAlias={null}
        onFormChange={onFormChange}
        onSubmit={onSubmit}
      />

      {outcome && outcome.kind !== 'ready' ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500/80" />
          <p className="min-w-0 text-muted-foreground">
            {outcome.kind === 'kept-as-host' || outcome.kind === 'unfinished'
              ? outcome.reason
              : outcome.message}
          </p>
        </div>
      ) : null}

      {installing ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'components.landing.connect.working',
            'Setting it up. The first time takes a few minutes: the server and its Node are uploaded to the machine. You can close this — it keeps going.'
          )}
        </p>
      ) : null}

      <DialogFooter>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={installing}>
            {installing ? <Loader2 className="size-4 animate-spin" /> : null}
            {installing
              ? translate('components.landing.connect.installing', 'Setting up…')
              : translate('components.landing.connect.install', 'Connect')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
