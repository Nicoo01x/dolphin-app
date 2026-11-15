import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { buildWorkspaceDirHistoryForUpdate } from '../applying-settings/terminal-settings-migrations'

/**
 * La carpeta de worktrees que sembraba Dolphin: la misma que la de Dolphin con `dolphin` en lugar de
 * `dolphin` (`~/dolphin/workspaces`).
 */
export function dolphinWorkspaceDirFor(dolphinDefault: string): string {
  return dolphinDefault.replace(/dolphin([\\/]workspaces)$/, 'dolphin$1')
}

/**
 * Why: un perfil que nació antes del rebrand (el de dev, `%APPDATA%\dolphin-dev`) guardó el default
 * de entonces, `~/dolphin/workspaces`, y los worktrees de Dolphin caían al lado de los de un Dolphin
 * instalado. Solo se mueve el default sin tocar: una carpeta elegida a mano se respeta. La vieja
 * pasa al historial, así los worktrees que ya viven ahí siguen siendo de la app.
 */
export function migrateDolphinWorkspaceDir(
  settings: GlobalSettings,
  dolphinDefault: string
): GlobalSettings {
  const legacy = dolphinWorkspaceDirFor(dolphinDefault)
  if (
    legacy === dolphinDefault ||
    normalizeRuntimePathForComparison(settings.workspaceDir ?? '') !==
      normalizeRuntimePathForComparison(legacy)
  ) {
    return settings
  }
  const history = buildWorkspaceDirHistoryForUpdate(settings, {
    workspaceDir: dolphinDefault
  })
  return {
    ...settings,
    workspaceDir: dolphinDefault,
    ...(history ? { workspaceDirHistory: history } : {})
  }
}
