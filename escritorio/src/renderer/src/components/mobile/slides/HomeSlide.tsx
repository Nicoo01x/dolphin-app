import { cn } from '../../../lib/class-names'
import { useTranslate } from '@/i18n/use-translate'

type AgentIndicator = 'waiting' | 'done' | 'working' | 'idle'

type JumpBackInRowProps = {
  className?: string
  indicator: AgentIndicator
  name: string
  status: string
  desktop: string
  time: string
}

const AGENT_DOT: Record<Exclude<AgentIndicator, 'working'>, string> = {
  waiting: 'is-red',
  done: 'is-green',
  idle: 'is-muted'
}

// Waiting and done ask something of the user, so only they tint the status word (mobile parity).
const STATUS_TONE: Partial<Record<AgentIndicator, string>> = {
  waiting: 'is-waiting',
  done: 'is-done'
}

export function HomeSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  const t = useTranslate()
  const macbookPro = t('auto.components.mobile.slides.HomeSlide.19c212e25e', 'MacBook Pro')
  return (
    <div className="mp-device-screen">
      <div className="mp-app-topbar">
        <div className="mp-app-brand">
          <DolphinMark />
          <span className="mp-app-brand-name">
            {t('auto.components.mobile.slides.HomeSlide.5d94e8ddcc', 'Dolphin')}
          </span>
        </div>
        <button
          type="button"
          className="mp-icon-button"
          aria-label={t('auto.components.mobile.slides.HomeSlide.af761a0c0d', 'Settings')}
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="mp-scroll-region">
        <div className="mp-home-heading is-first">
          {t('auto.components.mobile.slides.HomeSlide.dc1f3f5535', 'Jump back in')}
        </div>
        <div className="mp-home-group">
          <JumpBackInRow
            indicator="waiting"
            name="fix-auth-redirect"
            status={t('auto.components.mobile.slides.HomeSlide.c2a0215163', 'Waiting for input')}
            desktop={macbookPro}
            time={t('auto.components.mobile.slides.HomeSlide.0c14dac908', '2m')}
          />
          <JumpBackInRow
            className="is-tall-only"
            indicator="working"
            name="relay-reconnect-backoff"
            status={t('auto.components.mobile.slides.HomeSlide.609517273b', 'Working')}
            desktop={macbookPro}
            time={t('auto.components.mobile.slides.HomeSlide.005afbad3d', 'now')}
          />
        </div>

        <div className="mp-home-heading">
          {t('auto.components.mobile.slides.HomeSlide.2f1a1d10c4', 'Desktops')}
        </div>
        <div className="mp-home-group">
          {/* The carousel's next slide is this desktop's worktree list, so the tap lands here. */}
          <div className={cn('mp-home-row', tapping && 'is-tapping')}>
            <div className="mp-home-status">
              <span className="mp-status-dot is-green" />
            </div>
            <div className="mp-home-text">
              <div className="mp-home-title">{macbookPro}</div>
              <div className="mp-home-subtitle">
                {t('auto.components.mobile.slides.HomeSlide.04a94cadee', '40 worktrees · 5 active')}
              </div>
            </div>
            <div className="mp-home-trailing">
              <ChevronIcon />
            </div>
          </div>
          <div className="mp-home-row is-tall-only">
            <div className="mp-home-status">
              <span className="mp-status-dot is-muted" />
            </div>
            <div className="mp-home-text">
              <div className="mp-home-title">
                {t('auto.components.mobile.slides.HomeSlide.b5308d5e2c', 'M1 Mini')}
              </div>
              <div className="mp-home-subtitle">
                {t('auto.components.mobile.slides.HomeSlide.cf3f98fa3f', 'Disconnected')}
              </div>
            </div>
            <div className="mp-home-trailing">
              <ChevronIcon />
            </div>
          </div>
          <div className="mp-home-action-row is-tall-only">
            <PlusIcon />
            {t('auto.components.mobile.slides.HomeSlide.aefd110ea5', 'Pair a desktop')}
          </div>
        </div>

        <HomeSectionRow
          icon={<ListTodoIcon />}
          title={t('auto.components.mobile.slides.HomeSlide.a4c3f7b7aa', 'Tasks')}
          subtitle={t(
            'auto.components.mobile.slides.HomeSlide.aa44b4a6b2',
            'Browse your issues and reviews'
          )}
        />
        <HomeSectionRow
          icon={<CalendarClockIcon />}
          title={t('auto.components.mobile.slides.HomeSlide.eda5c8d01b', 'Automations')}
          subtitle={t(
            'auto.components.mobile.slides.HomeSlide.cd2ad5b641',
            'Schedule agent work and view runs'
          )}
        />
      </div>

      <div className="mp-home-bottom-bar">
        <div className="mp-home-bar-button is-primary">
          <PlusIcon />
          <span>{t('auto.components.mobile.slides.HomeSlide.d08ee9c466', 'New workspace')}</span>
        </div>
      </div>
    </div>
  )
}

function JumpBackInRow({
  className,
  indicator,
  name,
  status,
  desktop,
  time
}: JumpBackInRowProps): React.JSX.Element {
  return (
    <div className={cn('mp-home-row', className)}>
      <div className="mp-home-status">
        {indicator === 'working' ? (
          <div className="mp-wl-spinner" />
        ) : (
          <div className={cn('mp-wl-dot', AGENT_DOT[indicator])} />
        )}
      </div>
      <div className="mp-home-text">
        <div className="mp-home-title">{name}</div>
        <div className="mp-home-subtitle">
          <span className={STATUS_TONE[indicator]}>{status}</span> · {desktop}
        </div>
      </div>
      <div className="mp-home-trailing">
        {time}
        <ChevronIcon />
      </div>
    </div>
  )
}

// Phone Home's Tasks and Automations sections: a heading over a one-row group.
function HomeSectionRow({
  icon,
  title,
  subtitle
}: {
  icon: React.JSX.Element
  title: string
  subtitle: string
}): React.JSX.Element {
  return (
    <>
      <div className="mp-home-heading">{title}</div>
      <div className="mp-home-group">
        <div className="mp-home-row">
          <div className="mp-home-status">{icon}</div>
          <div className="mp-home-text">
            <div className="mp-home-title">{title}</div>
            <div className="mp-home-subtitle">{subtitle}</div>
          </div>
          <div className="mp-home-trailing">
            <ChevronIcon />
          </div>
        </div>
      </div>
    </>
  )
}

/** El delfín de Dolphin (el mismo trazo que resources/logo.svg); toma el color del texto. */
function DolphinMark(): React.JSX.Element {
  return (
    <svg className="mp-dolphin-logo" viewBox="0 0 462 370" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M171.3 2.0L190.0 2.9L204.0 5.7L214.0 8.9L228.0 15.0L256.0 31.5L267.0 36.2L282.0 39.1L319.0 41.7L340.0 44.8L349.0 46.8L366.0 51.8L387.0 60.8L403.0 70.8L410.5 77.0L417.2 84.0L425.2 96.0L431.9 114.0L448.0 126.7L454.4 133.0L457.2 137.0L459.2 142.0L459.3 146.0L458.4 148.0L455.0 150.2L452.0 150.1L423.0 141.7L414.0 139.8L397.0 137.6L384.0 137.1L370.0 137.8L354.0 140.7L337.0 146.8L327.0 152.6L319.0 158.7L292.0 184.1L279.0 193.3L266.0 200.4L249.0 207.3L234.0 211.4L217.0 214.2L205.0 214.6L204.1 214.0L222.0 201.3L234.1 190.0L243.4 179.0L257.7 158.0L268.2 146.0L277.0 137.9L292.0 127.7L304.0 121.7L315.0 117.6L336.0 112.7L359.0 110.8L384.0 112.4L385.7 112.0L374.0 106.8L360.0 102.6L342.0 99.5L329.0 98.5L309.0 98.8L292.0 100.7L276.0 103.7L261.0 107.6L240.0 114.9L214.0 126.8L200.0 134.8L186.0 143.8L166.0 158.8L145.0 177.6L125.7 198.0L106.8 221.0L80.0 257.3L79.2 256.0L78.9 251.0L79.4 238.0L83.6 213.0L91.7 187.0L103.9 160.0L118.8 135.0L133.7 115.0L148.6 98.0L163.0 83.8L181.1 68.0L184.5 63.0L185.3 57.0L183.2 50.0L178.5 41.0L173.3 34.0L168.0 28.0L161.0 21.7L151.0 14.9L141.3 10.0L140.8 9.0L145.0 6.8L152.0 4.6L162.0 2.7ZM127.3 225.0L128.0 224.4L128.6 225.0L120.6 239.0L114.6 254.0L111.8 268.0L111.8 276.0L113.6 285.0L116.5 292.0L119.8 298.0L137.2 324.0L144.2 339.0L147.2 351.0L147.7 356.0L147.4 364.0L146.0 367.9L133.2 351.0L119.0 338.7L111.0 333.7L100.0 328.6L90.0 325.7L83.0 324.6L68.0 324.8L57.0 326.9L45.0 330.7L35.0 334.9L24.0 340.6L13.0 347.7L3.0 355.2L2.1 355.0L1.8 350.0L2.6 344.0L6.7 332.0L14.7 318.0L25.0 305.2L36.0 294.8L44.0 288.8L73.0 271.3L87.0 261.3L119.0 231.6Z"
      />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ListTodoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  )
}

function CalendarClockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h5" />
      <path d="M17.5 17.5 16 16.3V14" />
      <circle cx="16" cy="16" r="6" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}
