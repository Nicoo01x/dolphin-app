import { DolphinRuntimeWithLinearCommands } from '../integrations/linear/linear-commands'
import type { RuntimeConstructionDependencies } from './runtime-construction-dependencies'
import type { DolphinRuntimeWithPreservedBranchCleanup as HostServices } from './runtime-host-services'

/**
 * El enganche de Dolphin para avisar un límite de uso: la rotación de cuentas lo escucha.
 *
 * Why un eslabón de la jerarquía: el constructor de la base está en su tope de líneas; acá el aviso
 * se guarda antes de que ese constructor corra, y la base sólo le pasa sus dependencias a `super`.
 */
export abstract class DolphinRuntimeWithUsageLimitNotice extends DolphinRuntimeWithLinearCommands {
  declare protected readonly onUsageLimitFn: HostServices['onUsageLimitFn']

  constructor(deps?: Pick<RuntimeConstructionDependencies, 'onUsageLimit'>) {
    super()
    this.onUsageLimitFn = deps?.onUsageLimit ?? null
  }
}
