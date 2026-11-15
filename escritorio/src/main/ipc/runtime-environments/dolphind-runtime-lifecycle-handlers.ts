import { ipcMain } from 'electron'
import type { DolphindManagedRuntimeStatus } from '../../../shared/dolphind-managed-runtime'
import { createManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-runtime-deployment'
import { getManagedDolphindRuntimeStatus } from '../../managed-server/lifecycle/dolphind-runtime-status'

export function registerDolphindRuntimeLifecycleHandlers(options: {
  getUserDataPath: () => string
}): void {
  ipcMain.handle(
    'runtimeEnvironments:deployDolphind',
    async (_event, args: { name: string; sshTargetId: string; force?: boolean }) =>
      createManagedDolphindEnvironment(options.getUserDataPath(), {
        name: requiredString(args?.name, 'Server name'),
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        force: args?.force === true
      })
  )
  ipcMain.handle(
    'runtimeEnvironments:getDolphindStatus',
    (_event, args: { selector: string }): Promise<DolphindManagedRuntimeStatus> =>
      getManagedDolphindRuntimeStatus(
        options.getUserDataPath(),
        requiredString(args?.selector, 'Server')
      )
  )
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}
