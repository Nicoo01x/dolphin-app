import { BrowserWindow } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import type { DolphinRuntimeService } from '../../runtime/dolphin-runtime'
import { registrarIsla } from '../../dolphin/dolphin-isla'
import { registrarXray } from '../../dolphin/dolphin-xray'
import { registerDolphinHandlers } from '../dolphin'
import { registerDelfinesHandlers } from '../delfines'
import { registrarLsp } from '../lsp'
import { registrarWinForms } from '../winforms'

let registrado = false

/**
 * El IPC propio de Dolphin, que la base no tiene.
 *
 * Why al lado de `registerCoreHandlers` y no adentro: esa función de la base está en su tope de
 * líneas. Igual que ella, se llama cada vez que macOS reemplaza la ventana, y registra una sola vez.
 */
export function registrarHandlersDolphin(store: Store, runtime: DolphinRuntimeService): void {
  if (registrado) {
    return
  }
  registrado = true
  // Los servidores de lenguaje se arrancan al abrir el primer archivo de su lenguaje, no acá. Lo que
  // se registra es el puente; la ventana se busca al momento de mandar un diagnóstico porque la de
  // ahora puede no ser la de entonces.
  registrarLsp(() => BrowserWindow.getAllWindows()[0] ?? null)
  registrarIsla(store)
  registrarXray()
  registerDolphinHandlers(store, runtime)
  registerDelfinesHandlers(store)
  registrarWinForms()
}
