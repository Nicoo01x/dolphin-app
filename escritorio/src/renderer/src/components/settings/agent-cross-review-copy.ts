import { translate } from '@/i18n/i18n'

export function getAgentCrossReviewTitle(): string {
  return translate(
    'auto.components.settings.agent-cross-review-copy.title',
    'Cross-review when the agent stops'
  )
}

export function getAgentCrossReviewDescription(): string {
  return translate(
    'auto.components.settings.agent-cross-review-copy.description',
    'When the agent finishes a turn with changes, another model reviews the diff. Uses your plan quota.'
  )
}
