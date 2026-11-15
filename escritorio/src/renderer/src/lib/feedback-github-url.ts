export function buildGitHubFeedbackIssueUrl(repositoryUrl: string, feedback: string): string {
  const issueUrl = `${repositoryUrl.replace(/\/+$/, '')}/issues/new`
  const params = new URLSearchParams({
    title: 'Feedback from Dolphin',
    body: feedback
  })
  return `${issueUrl}?${params.toString()}`
}
