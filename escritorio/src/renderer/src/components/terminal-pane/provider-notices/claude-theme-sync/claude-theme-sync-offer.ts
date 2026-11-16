import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import type { AppState } from '@/store/types'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { encolarAviso } from '@/components/dolphin/avisos/avisos-store'
import { avisoDelTemaDeClaude } from '@/components/dolphin/avisos/aviso-tema-de-claude'
import { whenAgentTerminalAppears } from '../agent-presence/agent-terminal-presence'

function isOfferDue(state: AppState): boolean {
  return state.settings?.claudeCodeThemeSyncOffer === 'pending'
}

function acceptClaudeThemeSync(): void {
  // Why confirm only after the write: a failed save must not claim the sync is on.
  useAppStore
    .getState()
    .updateSettingsOrThrow({ claudeCodeThemeSync: true })
    .then(
      () =>
        toast.success(
          translate('terminal.claudeThemeSyncOffer.accepted', 'Claude Code theme sync is on'),
          {
            description: translate(
              'terminal.claudeThemeSyncOffer.acceptedDescription',
              'New Claude Code sessions on this computer use your Dolphin theme.'
            )
          }
        ),
      () =>
        toast.error(
          translate(
            'terminal.claudeThemeSyncOffer.failed',
            'Could not turn on Claude Code theme sync'
          ),
          {
            description: translate(
              'terminal.claudeThemeSyncOffer.failedDescription',
              'Turn it on in Settings.'
            )
          }
        )
    )
}

// Dolphin: the offer waits its turn in the centered notice queue instead of stacking as a toast.
function showClaudeThemeSyncOffer(): void {
  encolarAviso(
    avisoDelTemaDeClaude({
      // Why settle when shown: shown means answered, so a dismiss, quit or reload never asks again;
      // an offer the queue never reached stays pending for the next launch.
      alMostrar: () =>
        void useAppStore.getState().updateSettings({ claudeCodeThemeSyncOffer: 'settled' }),
      alAceptar: acceptClaudeThemeSync
    })
  )
}

/** Offers theme sync once, when Claude Code first runs in a Dolphin terminal. */
export function useClaudeThemeSyncOffer(): void {
  const due = useAppStore(isOfferDue)

  useEffect(() => {
    // Why: a paired web client's Claude runs on the host, whose settings this window does not own.
    if (!due || isPairedWebClientWindow()) {
      return
    }
    return whenAgentTerminalAppears('claude', showClaudeThemeSyncOffer)
  }, [due])
}
