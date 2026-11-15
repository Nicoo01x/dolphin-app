import { describe, expect, it } from 'vitest'
import {
  getCompletedFeatureTipIds,
  getOrderedUnseenFeatureTips,
  normalizeFeatureTipIds,
  type FeatureTipId
} from './feature-tips'

describe('feature tips', () => {
  it('skips tips the user has already seen', () => {
    const tips = getOrderedUnseenFeatureTips({
      seenTipIds: new Set<FeatureTipId>([
        'delegacion-automatica',
        'chat-ui-here',
        'voice-dictation',
        'dolphin-cli',
        'cmd-j-palette',
        'agent-session-search'
      ])
    })

    expect(tips.map((tip) => tip.id)).toEqual([])
  })

  it('skips tips for features the user has already completed', () => {
    const tips = getOrderedUnseenFeatureTips({
      // cmd-j is a seen-based tip with no feature completion, so mark it seen here.
      seenTipIds: new Set<FeatureTipId>(['cmd-j-palette']),
      completedTipIds: getCompletedFeatureTipIds({
        autoDelegationEnabled: true,
        cliInstalled: true,
        voiceDictationEnabled: true,
        sessionSearchTipCompleted: true,
        chatUiLaunchTipCompleted: true
      })
    })

    expect(tips.map((tip) => tip.id)).toEqual([])
  })

  it('skips tips for features the user has already interacted with', () => {
    const tips = getOrderedUnseenFeatureTips({
      seenTipIds: new Set<FeatureTipId>(),
      completedTipIds: getCompletedFeatureTipIds({
        autoDelegationEnabled: true,
        cliInstalled: false,
        voiceDictationEnabled: false,
        sessionSearchTipCompleted: true,
        chatUiLaunchTipCompleted: true,
        featureInteractions: {
          'voice-dictation': { firstInteractedAt: 100, interactionCount: 1 }
        }
      })
    })

    expect(tips.map((tip) => tip.id)).toEqual(['dolphin-cli', 'cmd-j-palette'])
  })

  it('normalizes persisted tip ids', () => {
    expect(
      normalizeFeatureTipIds([
        'feature-tour',
        'dolphin-cli',
        'bogus',
        'cmd-j-palette',
        'voice-dictation'
      ])
    ).toEqual(['dolphin-cli', 'cmd-j-palette', 'voice-dictation'])
  })
})
