import { useState } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { useMountedRef } from '@/hooks/useMountedRef'
import { launchVpsSetupAgent } from '@/lib/agent-session/launch/vps-setup-agent-launch'
import type { VpsSetupAgentContext } from '../../../../shared/vps-setup-agent-prompt'

/**
 * Hands a host that won't connect to the default agent, with the VPS skill and the host's
 * doctor loop. Same shape as the other recovery actions beside a failure: a small outline
 * button, so it reads as one more way out and not as the only one.
 */
export function FixHostWithAgentButton({
  context,
  onLaunched
}: {
  context: VpsSetupAgentContext
  /** Lets a dialog close once the agent's tab is open. */
  onLaunched?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const mountedRef = useMountedRef()
  const [launching, setLaunching] = useState(false)

  const launch = (): void => {
    setLaunching(true)
    void launchVpsSetupAgent(context)
      .then((launched) => {
        if (launched) {
          onLaunched?.()
        }
      })
      .catch(() => undefined)
      .then(() => {
        if (mountedRef.current) {
          setLaunching(false)
        }
      })
  }

  return (
    <Button type="button" size="xs" variant="outline" disabled={launching} onClick={launch}>
      {launching ? <Loader2 className="animate-spin" /> : <Bot />}
      {t('auto.components.sshHostRecovery.fixWithAgent', 'Fix it with an agent')}
    </Button>
  )
}
