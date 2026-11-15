import type { Repo } from '../../../../shared/repo-types'
import { getWorkItemRepo, type WorkItemRepoRef } from '@/lib/work-items/work-item-repo-row'

type RepoBackedProjectDialogState = {
  repoId: string
  workItem: WorkItemRepoRef
}

type SlugProjectDialogState = {
  origin: {
    owner: string
    repo: string
    host?: string
  }
}

type RepoNotInDolphinDialogState = {
  owner: string
  repo: string
  host?: string
}

type RepoMatch = {
  id: string
}

type LookupSlug = (slug: string, host?: string) => readonly RepoMatch[]

function shouldCloseFallbackDialog(args: {
  lookupSlug: LookupSlug
  selectedRepoIds: ReadonlySet<string>
  owner: string
  repo: string
  host?: string
}): boolean {
  const matches = args.lookupSlug(`${args.owner}/${args.repo}`, args.host)
  const selectedMatchCount = matches.filter((match) => args.selectedRepoIds.has(match.id)).length
  const unselectedMatchCount = matches.length - selectedMatchCount
  return selectedMatchCount > 0 || unselectedMatchCount > 0
}

/** The open dialog and the repo row its item came from, or neither once that row is gone. */
export function resolveRepoBackedProjectDialogState<T extends RepoBackedProjectDialogState>(
  dialog: T | null,
  repos: readonly Repo[],
  selectedRepoIds: ReadonlySet<string>
): { dialog: T | null; repo: Repo | null } {
  if (!dialog || !selectedRepoIds.has(dialog.repoId)) {
    return { dialog: null, repo: null }
  }
  // Why: by id alone a twin resolves to the other host's row, and the dialog would act there.
  const repo = getWorkItemRepo(repos, dialog.workItem) ?? null
  return repo ? { dialog, repo } : { dialog: null, repo: null }
}

export function resolveMissingRepoProjectDialogState<
  TSlugDialog extends SlugProjectDialogState,
  TRepoNotInDolphin extends RepoNotInDolphinDialogState
>(args: {
  slugIndexReady: boolean
  slugDialog: TSlugDialog | null
  repoNotInDolphin: TRepoNotInDolphin | null
  lookupSlug: LookupSlug
  selectedRepoIds: ReadonlySet<string>
}): {
  slugDialog: TSlugDialog | null
  repoNotInDolphin: TRepoNotInDolphin | null
} {
  const { lookupSlug, repoNotInDolphin, selectedRepoIds, slugDialog, slugIndexReady } = args
  if (!slugIndexReady) {
    return { slugDialog: null, repoNotInDolphin: null }
  }
  return {
    slugDialog:
      slugDialog &&
      shouldCloseFallbackDialog({
        lookupSlug,
        selectedRepoIds,
        owner: slugDialog.origin.owner,
        repo: slugDialog.origin.repo,
        host: slugDialog.origin.host
      })
        ? null
        : slugDialog,
    repoNotInDolphin:
      repoNotInDolphin &&
      shouldCloseFallbackDialog({
        lookupSlug,
        selectedRepoIds,
        owner: repoNotInDolphin.owner,
        repo: repoNotInDolphin.repo,
        host: repoNotInDolphin.host
      })
        ? null
        : repoNotInDolphin
  }
}
