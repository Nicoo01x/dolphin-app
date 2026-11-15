import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { translate } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { useAppStore } from '../store/index'

async function copySignInLink(link: string): Promise<void> {
  try {
    await window.api.ui.writeClipboardText(link)
    toast.success(translate('auto.components.DolphinSignInProgress.copied', 'Sign-in link copied'))
  } catch (error) {
    console.warn('Could not copy the Dolphin sign-in link:', error)
    toast.error(
      translate('auto.components.DolphinSignInProgress.copyFailed', 'Could not copy the link.')
    )
  }
}

export function DolphinSignInButton({
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick' | 'type'>): React.JSX.Element {
  const t = useTranslate()
  const connect = useAppStore((state) => state.connectCurrentDolphinProfile)
  const signingIn = useAppStore((state) => Boolean(state.dolphinProfileSignInProgress))
  return (
    <Button
      {...props}
      type="button"
      disabled={disabled || signingIn}
      onClick={() => void connect()}
    >
      {signingIn ? (
        <>
          <Loader2 className="animate-spin" />
          {t('auto.components.DolphinSignInProgress.signingIn', 'Signing in…')}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function DolphinSignInWaitNotice({
  className
}: {
  className?: string
}): React.JSX.Element | null {
  const t = useTranslate()
  const link = useAppStore((state) => state.dolphinProfileSignInProgress?.link)
  if (!link) {
    return null
  }
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-0.5 text-xs text-muted-foreground',
        className
      )}
    >
      <span className="pr-2">
        {t('auto.components.DolphinSignInProgress.waiting', 'Waiting for sign-in in your browser')}
      </span>
      <span aria-hidden>·</span>
      <Button type="button" variant="link" size="xs" onClick={() => void copySignInLink(link)}>
        {t('auto.components.DolphinSignInProgress.copyLink', 'Copy sign-in link')}
      </Button>
      <span aria-hidden>·</span>
      <Button
        type="button"
        variant="link"
        size="xs"
        onClick={() => void window.api.dolphinProfiles.cancelSignIn().catch(() => {})}
      >
        {t('auto.components.DolphinSignInProgress.cancel', 'Cancel')}
      </Button>
    </div>
  )
}
