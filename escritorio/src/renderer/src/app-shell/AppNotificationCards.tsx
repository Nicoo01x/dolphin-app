import { Suspense, type JSX } from 'react'
import type { TopLevelView } from '../../../shared/ui-chrome-types'
import { lazyWithRetry as lazy } from '@/app-shell/startup/lazy-with-retry'
import { CodexSharedSettingsNoticeCard } from '../components/CodexSharedSettingsNoticeCard'
import { NotificationCardStack } from '../components/NotificationCardStack'
import { StarNagCard } from '../components/StarNagCard'
import { AvisoDeLaInterfazDeChat } from '../components/dolphin/avisos/AvisoDeLaInterfazDeChat'
import { ColaDeAvisos } from '../components/dolphin/avisos/ColaDeAvisos'
import { OverlayBoundary } from './app-root-surface-boundaries'

const UpdateCard = lazy(() =>
  import('../components/UpdateCard').then((module) => ({ default: module.UpdateCard }))
)
const UnexpectedSignoutCard = lazy(() =>
  import('../components/UnexpectedSignoutCard').then((module) => ({
    default: module.UnexpectedSignoutCard
  }))
)

/**
 * The bottom-right notification stack and every card that shares it, plus Dolphin's centered
 * notice queue: the Chat UI launch card, outdated skills and the terminal preferences go there,
 * one at a time, instead of piling up in this corner.
 */
export function AppNotificationCards({
  activeView,
  shouldMountUpdateCard,
  chatUiHereCornerCardOpen,
  onChatUiHereCornerCardClose,
  noticesPaused
}: {
  activeView: TopLevelView
  shouldMountUpdateCard: boolean
  chatUiHereCornerCardOpen: boolean
  onChatUiHereCornerCardClose: () => void
  /** First-run onboarding is on screen: centered notices wait until it is done. */
  noticesPaused: boolean
}): JSX.Element {
  return (
    <>
      <OverlayBoundary boundaryId="overlay.dolphin-notice-queue" resetKey={activeView}>
        <AvisoDeLaInterfazDeChat
          abierto={chatUiHereCornerCardOpen}
          onCerrar={onChatUiHereCornerCardClose}
        />
        <ColaDeAvisos enPausa={noticesPaused} />
      </OverlayBoundary>
      <NotificationCardStack>
        {shouldMountUpdateCard ? (
          <Suspense fallback={null}>
            <OverlayBoundary boundaryId="overlay.update-card" resetKey={activeView}>
              <UpdateCard />
            </OverlayBoundary>
          </Suspense>
        ) : null}
        <Suspense fallback={null}>
          <OverlayBoundary boundaryId="overlay.unexpected-signout" resetKey={activeView}>
            <UnexpectedSignoutCard />
          </OverlayBoundary>
        </Suspense>
        <OverlayBoundary boundaryId="overlay.star-nag" resetKey={activeView}>
          <StarNagCard />
        </OverlayBoundary>
        <OverlayBoundary boundaryId="overlay.codex-shared-settings-notice" resetKey={activeView}>
          <CodexSharedSettingsNoticeCard />
        </OverlayBoundary>
      </NotificationCardStack>
    </>
  )
}
