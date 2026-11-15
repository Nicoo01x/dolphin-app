import type { DolphinChoquesRepo } from '../../../../shared/dolphin-choques'
import { translate } from '@/i18n/i18n'

export function OrchestrationConflicts({
  repos
}: {
  repos: readonly DolphinChoquesRepo[]
}): React.JSX.Element | null {
  if (repos.length === 0) {
    return null
  }
  const count = repos.reduce((total, repo) => total + repo.choques.length, 0)
  return (
    <section className="rounded-2xl bg-card/60 p-4" aria-labelledby="orchestration-conflicts-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="orchestration-conflicts-title" className="text-[13px] font-semibold">
          {translate('auto.components.orchestration.conflictsTitle', 'Worktree conflicts')}
        </h2>
        <span className="text-[13px] text-muted-foreground">
          {translate('auto.components.orchestration.conflictsCount', '{{value0}} detected', {
            value0: String(count)
          })}
        </span>
      </div>
      <div className="space-y-2">
        {repos.flatMap((repo) =>
          repo.choques.map((choque) => (
            <div key={`${repo.repoPath}:${choque.a}:${choque.b}`} className="rounded-xl bg-muted/30 p-3">
              <p className="text-[13px] font-medium">
                {repo.repoName}: {choque.a} · {choque.b}
              </p>
              <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
                {choque.archivos.map((archivo) => (
                  <li key={archivo} className="font-mono">
                    {archivo}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
