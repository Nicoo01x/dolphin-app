import type {
  ClaudeUsageDailyPoint,
  ClaudeUsageSummary
} from '../../../../shared/claude-usage-types'
import type { CodexUsageDailyPoint, CodexUsageSummary } from '../../../../shared/codex-usage-types'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { useIntlLocale, useTranslate, type Translate } from '@/i18n/use-translate'
import { GitHubIcon } from '@/components/icons/GitHubIcon'
import { DOLPHIN_GITHUB_URL } from '../../../../shared/dolphin-brand'

export type ClaudeShareData = {
  provider: 'claude'
  summary: ClaudeUsageSummary
  daily: ClaudeUsageDailyPoint[]
}

export type CodexShareData = {
  provider: 'codex'
  summary: CodexUsageSummary
  daily: CodexUsageDailyPoint[]
}

export function formatTokens(value: number, intlLocale: string = getIntlLocale()): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return value.toLocaleString(intlLocale)
}

export function formatCost(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

export function formatDateRange(range: string, intlLocale: string = getIntlLocale()): string {
  const now = new Date()
  const end = now.toLocaleDateString(intlLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  if (range === 'all') {
    return `Through ${end}`
  }
  const days = Number.parseInt(range)
  if (Number.isNaN(days)) {
    return end
  }
  const start = new Date(now.getTime() - days * 86_400_000)
  const startStr = start.toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' })
  return `${startStr} – ${end}`
}

export const RANGE_LABELS: Record<string, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time'
}

export function getDailyTotal(entry: ClaudeUsageDailyPoint | CodexUsageDailyPoint): number {
  if ('cacheReadTokens' in entry) {
    return entry.inputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheWriteTokens
  }
  return entry.totalTokens
}

export type DailySegment = { key: string; value: number; color: string }

export function getDailySegments(
  entry: ClaudeUsageDailyPoint | CodexUsageDailyPoint
): DailySegment[] {
  // Preserve chart segment order in the bottom-aligned stack.
  if ('cacheReadTokens' in entry) {
    return [
      { key: 'cache-write', value: entry.cacheWriteTokens, color: 'rgba(217, 70, 239, 0.7)' },
      { key: 'cache-read', value: entry.cacheReadTokens, color: 'rgba(251, 191, 36, 0.7)' },
      { key: 'output', value: entry.outputTokens, color: 'rgba(52, 211, 153, 0.8)' },
      { key: 'input', value: entry.inputTokens, color: 'rgba(56, 189, 248, 0.8)' }
    ]
  }
  return [
    { key: 'input', value: entry.inputTokens, color: 'rgba(56, 189, 248, 0.8)' },
    { key: 'output', value: entry.outputTokens, color: 'rgba(52, 211, 153, 0.8)' },
    { key: 'cached', value: entry.cachedInputTokens, color: 'rgba(251, 191, 36, 0.7)' },
    { key: 'reasoning', value: entry.reasoningOutputTokens, color: 'rgba(217, 70, 239, 0.7)' }
  ]
}

export function getLegendItems(provider: 'claude' | 'codex', t: Translate = translate) {
  if (provider === 'claude') {
    return [
      {
        label: t('auto.components.stats.share.card.utils.c2d7b23d57', 'Input'),
        color: 'rgba(56, 189, 248, 0.8)'
      },
      {
        label: t('auto.components.stats.share.card.utils.33d38e2177', 'Output'),
        color: 'rgba(52, 211, 153, 0.8)'
      },
      {
        label: t('auto.components.stats.share.card.utils.cc28cb965e', 'Cache read'),
        color: 'rgba(251, 191, 36, 0.7)'
      },
      {
        label: t('auto.components.stats.share.card.utils.9d166247ee', 'Cache write'),
        color: 'rgba(217, 70, 239, 0.7)'
      }
    ]
  }
  return [
    {
      label: t('auto.components.stats.share.card.utils.c2d7b23d57', 'Input'),
      color: 'rgba(56, 189, 248, 0.8)'
    },
    {
      label: t('auto.components.stats.share.card.utils.33d38e2177', 'Output'),
      color: 'rgba(52, 211, 153, 0.8)'
    },
    {
      label: t('auto.components.stats.share.card.utils.4ee864629a', 'Cached input'),
      color: 'rgba(251, 191, 36, 0.7)'
    },
    {
      label: t('auto.components.stats.share.card.utils.7080aeaebb', 'Reasoning'),
      color: 'rgba(217, 70, 239, 0.7)'
    }
  ]
}

/** El delfín de Dolphin (el mismo trazo que resources/logo.svg), en blanco para la tarjeta oscura. */
export function DolphinLogo(): React.JSX.Element {
  return (
    <svg
      width={26}
      height={21}
      viewBox="0 0 462 370"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.9, verticalAlign: 'middle' }}
    >
      <path
        style={{ fill: '#ffffff' }}
        fillRule="evenodd"
        d="M171.3 2.0L190.0 2.9L204.0 5.7L214.0 8.9L228.0 15.0L256.0 31.5L267.0 36.2L282.0 39.1L319.0 41.7L340.0 44.8L349.0 46.8L366.0 51.8L387.0 60.8L403.0 70.8L410.5 77.0L417.2 84.0L425.2 96.0L431.9 114.0L448.0 126.7L454.4 133.0L457.2 137.0L459.2 142.0L459.3 146.0L458.4 148.0L455.0 150.2L452.0 150.1L423.0 141.7L414.0 139.8L397.0 137.6L384.0 137.1L370.0 137.8L354.0 140.7L337.0 146.8L327.0 152.6L319.0 158.7L292.0 184.1L279.0 193.3L266.0 200.4L249.0 207.3L234.0 211.4L217.0 214.2L205.0 214.6L204.1 214.0L222.0 201.3L234.1 190.0L243.4 179.0L257.7 158.0L268.2 146.0L277.0 137.9L292.0 127.7L304.0 121.7L315.0 117.6L336.0 112.7L359.0 110.8L384.0 112.4L385.7 112.0L374.0 106.8L360.0 102.6L342.0 99.5L329.0 98.5L309.0 98.8L292.0 100.7L276.0 103.7L261.0 107.6L240.0 114.9L214.0 126.8L200.0 134.8L186.0 143.8L166.0 158.8L145.0 177.6L125.7 198.0L106.8 221.0L80.0 257.3L79.2 256.0L78.9 251.0L79.4 238.0L83.6 213.0L91.7 187.0L103.9 160.0L118.8 135.0L133.7 115.0L148.6 98.0L163.0 83.8L181.1 68.0L184.5 63.0L185.3 57.0L183.2 50.0L178.5 41.0L173.3 34.0L168.0 28.0L161.0 21.7L151.0 14.9L141.3 10.0L140.8 9.0L145.0 6.8L152.0 4.6L162.0 2.7ZM127.3 225.0L128.0 224.4L128.6 225.0L120.6 239.0L114.6 254.0L111.8 268.0L111.8 276.0L113.6 285.0L116.5 292.0L119.8 298.0L137.2 324.0L144.2 339.0L147.2 351.0L147.7 356.0L147.4 364.0L146.0 367.9L133.2 351.0L119.0 338.7L111.0 333.7L100.0 328.6L90.0 325.7L83.0 324.6L68.0 324.8L57.0 326.9L45.0 330.7L35.0 334.9L24.0 340.6L13.0 347.7L3.0 355.2L2.1 355.0L1.8 350.0L2.6 344.0L6.7 332.0L14.7 318.0L25.0 305.2L36.0 294.8L44.0 288.8L73.0 271.3L87.0 261.3L119.0 231.6Z"
      />
    </svg>
  )
}

export function BackgroundGlows(): React.JSX.Element {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '-60%',
          right: '-20%',
          width: 300,
          height: 300,
          background: 'radial-gradient(circle, rgba(20, 71, 230, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-40%',
          left: '-10%',
          width: 250,
          height: 250,
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
          pointerEvents: 'none'
        }}
      />
    </>
  )
}

export function CardFooter(props: {
  summary: { inputTokens: number; outputTokens: number }
}): React.JSX.Element {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  return (
    <div
      style={{
        display: 'table',
        width: '100%',
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        position: 'relative',
        zIndex: 1
      }}
    >
      <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          <strong style={{ color: '#ccc' }}>
            {formatTokens(props.summary.inputTokens, intlLocale)}
          </strong>{' '}
          {t('auto.components.stats.share.card.utils.5d66fdd7c2', 'input')}
        </span>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 16 }}>
          <strong style={{ color: '#ccc' }}>
            {formatTokens(props.summary.outputTokens, intlLocale)}
          </strong>{' '}
          {t('auto.components.stats.share.card.utils.d864fc5f98', 'output')}
        </span>
      </div>
      {/* Why: el pie llevaba el repo de Dolphin, que es otra app; va el de Dolphin cuando exista. */}
      {DOLPHIN_GITHUB_URL ? (
        <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
          <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <GitHubIcon
              width={13}
              height={13}
              fill="#888"
              style={{ opacity: 0.6, verticalAlign: 'middle' }}
            />
          </span>
          <span
            style={{
              fontSize: 11,
              color: '#888',
              letterSpacing: 0.2,
              verticalAlign: 'middle',
              marginLeft: 5
            }}
          >
            {DOLPHIN_GITHUB_URL.replace(/^https:\/\//, '')}
          </span>
        </div>
      ) : null}
    </div>
  )
}
