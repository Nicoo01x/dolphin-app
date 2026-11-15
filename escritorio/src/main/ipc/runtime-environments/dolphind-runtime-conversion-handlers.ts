import { ipcMain } from 'electron'
import type {
  DolphindManagedConversionResult,
  DolphindManagedPendingMigrationRow
} from '../../../shared/dolphind-managed-runtime'
import { listPendingManagedDolphindMigrations } from '../../managed-server/lifecycle/dolphind-managed-migration-status'
import { convertSshTargetToManagedDolphind } from '../../managed-server/lifecycle/dolphind-runtime-conversion'
import { conversionCollaborators } from '../../managed-server/lifecycle/dolphind-runtime-conversion-wiring'
import { requiredString } from './dolphind-runtime-lifecycle-handlers'

export function registerDolphindRuntimeConversionHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:convertSshHostToManagedDolphind',
    (
      _event,
      args: { sshTargetId: string; name: string }
    ): Promise<DolphindManagedConversionResult> => {
      return convertSshTargetToManagedDolphind(getUserDataPath(), {
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        name: requiredString(args?.name, 'Server name'),
        ...conversionCollaborators()
      })
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:listPendingDolphindMigrations',
    (): DolphindManagedPendingMigrationRow[] =>
      listPendingManagedDolphindMigrations(getUserDataPath())
  )
}
