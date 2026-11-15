import { describe, expect, it } from 'vitest'
import { buildGitHubFeedbackIssueUrl } from './feedback-github-url'

describe('buildGitHubFeedbackIssueUrl', () => {
  it('opens a new issue with the feedback prefilled', () => {
    const url = new URL(
      buildGitHubFeedbackIssueUrl('https://github.com/acme/dolphin/', 'It broke\n\nDetails')
    )

    expect(url.pathname).toBe('/acme/dolphin/issues/new')
    expect(url.searchParams.get('title')).toBe('Feedback from Dolphin')
    expect(url.searchParams.get('body')).toBe('It broke\n\nDetails')
  })
})
