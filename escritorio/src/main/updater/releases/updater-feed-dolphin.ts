import { getDolphinUpdateRepository } from '../../../shared/dolphin-brand'
import { UpdaterInstallExecution } from '../lifecycle/updater-install-execution'

/** El eslabón de Dolphin en la cadena del actualizador de la base. */
export abstract class UpdaterInstallExecutionDolphin extends UpdaterInstallExecution {
  /**
   * Why: sin un repo de actualizaciones propio no hay versión estable de Dolphin para ofrecer, y
   * salir a buscarla al de la base ofrecería la base.
   */
  protected sinRepoDeActualizaciones(): boolean {
    return !getDolphinUpdateRepository()
  }
}
