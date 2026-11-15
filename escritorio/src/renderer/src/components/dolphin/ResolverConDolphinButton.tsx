import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { dolphinRunsFor } from './dolphin-available'
import { DolphinMark } from './DolphinMark'
import { destinoDolphinDeRepo, textoDeNuevaTareaDolphin } from './dolphin-new-task'
import type { Repo } from '../../../../shared/repo-types'

export function ResolverConDolphinButton({
  repo,
  title,
  body,
  url
}: {
  repo: Repo | null
  title: string
  body?: string
  url: string
}): React.JSX.Element | null {
  const openDolphinPage = useAppStore((state) => state.openDolphinPage)
  const setDolphinNuevaTarea = useAppStore((state) => state.setDolphinNuevaTarea)
  if (!repo || !dolphinRunsFor(repo)) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={translate(
            'auto.components.TaskPage.resolveWithDolphin',
            'Solve with Dolphin'
          )}
          onClick={(event) => {
            event.stopPropagation()
            setDolphinNuevaTarea(textoDeNuevaTareaDolphin(title, body, url))
            openDolphinPage('nueva', destinoDolphinDeRepo(repo))
          }}
        >
          <DolphinMark className="h-3 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('auto.components.TaskPage.resolveWithDolphin', 'Solve with Dolphin')}
      </TooltipContent>
    </Tooltip>
  )
}

/** La misma acción como ítem de un menú (el «…» de una fila de issue). */
export function ResolverConDolphinMenuItem({
  repo,
  title,
  url
}: {
  repo: Repo | null
  title: string
  url: string
}): React.JSX.Element | null {
  const openDolphinPage = useAppStore((state) => state.openDolphinPage)
  const setDolphinNuevaTarea = useAppStore((state) => state.setDolphinNuevaTarea)
  if (!repo || !dolphinRunsFor(repo)) {
    return null
  }
  return (
    <DropdownMenuItem
      onSelect={() => {
        setDolphinNuevaTarea(textoDeNuevaTareaDolphin(title, undefined, url))
        openDolphinPage('nueva', destinoDolphinDeRepo(repo))
      }}
    >
      {translate('auto.components.TaskPage.resolveWithDolphin', 'Solve with Dolphin')}
    </DropdownMenuItem>
  )
}
