import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { FixHostWithAgentButton } from '../../../ssh-host-recovery/FixHostWithAgentButton'

/**
 * The connection test before saving failed: why, what to do, and the two ways on.
 *
 * Same alert the server install panel uses for its outcomes, so a host that didn't answer reads
 * the same in both flows. "Save anyway" stays, because a host that is down today (a VPS still
 * booting, a VPN not up yet) is still the host the person meant to add.
 */
export function SshHostTestFailure({
  message,
  hostLabel,
  disabled,
  onSaveAnyway,
  onAgentLaunched
}: {
  message: string
  hostLabel: string
  disabled: boolean
  onSaveAnyway: () => void
  onAgentLaunched?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500/80" />
      <div className="min-w-0 space-y-2">
        <p className="text-muted-foreground [overflow-wrap:anywhere]">
          {t(
            'auto.components.sidebar.AddRemoteHostDialog.testFailed',
            'Dolphin couldn’t connect to this host: {{reason}}',
            { reason: message }
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={disabled}
            onClick={onSaveAnyway}
          >
            {t('auto.components.sidebar.AddRemoteHostDialog.saveAnyway', 'Save anyway')}
          </Button>
          <FixHostWithAgentButton
            context={{ error: message, ...(hostLabel ? { label: hostLabel } : {}) }}
            onLaunched={onAgentLaunched}
          />
        </div>
      </div>
    </div>
  )
}
