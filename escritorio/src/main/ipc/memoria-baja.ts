import { ipcMain, type WebContents } from 'electron'
import {
  SILENCIO_DESPUES_MS,
  type AvisoDeMemoriaBaja,
  type EstadoDeMemoriaBaja
} from '../../shared/modo-poca-ram'
import type { Store } from '../persistence/loading-store/store'
import { collectMemorySnapshot } from '../memory/collector'
import { collectHostMemory } from '../memory/host-memory'
import { instalarLecturaDelModoPocaRam } from '../memoria-baja/modo-activo'
import { INTERVALO_DE_MUESTREO_MS, VigiaDeMemoriaBaja } from '../memoria-baja/vigia-de-memoria-baja'

export const CANAL_DEL_AVISO_DE_MEMORIA_BAJA = 'memoriaBaja:aviso'

/**
 * El vigía de la memoria y sus tres canales. Lo escuchan las ventanas que montan la cola de avisos
 * (`memoriaBaja:suscribir`), no todas: una ventana del tablero no tiene dónde mostrar el cartel.
 *
 * Un aviso que salta antes de que la ventana se suscriba (la app recién abierta en una máquina ya
 * apretada) no se pierde: queda guardado y se entrega con la primera suscripción.
 */
export function registerMemoriaBajaHandlers(store: Store): void {
  const suscriptas = new Set<WebContents>()
  let pendiente: AvisoDeMemoriaBaja | null = null

  const entregar = (aviso: AvisoDeMemoriaBaja): void => {
    let entregado = false
    for (const ventana of suscriptas) {
      if (!ventana.isDestroyed()) {
        ventana.send(CANAL_DEL_AVISO_DE_MEMORIA_BAJA, aviso)
        entregado = true
      }
    }
    pendiente = entregado ? null : aviso
  }

  const vigia = new VigiaDeMemoriaBaja({
    leerAjustes: () => store.getSettings(),
    leerMemoria: collectHostMemory,
    sacarFoto: () => collectMemorySnapshot(store),
    avisar: entregar
  })
  instalarLecturaDelModoPocaRam(() => vigia.activo())
  const reloj = setInterval(() => void vigia.muestrear(), INTERVALO_DE_MUESTREO_MS)
  reloj.unref()

  ipcMain.handle('memoriaBaja:suscribir', (event): EstadoDeMemoriaBaja => {
    const ventana = event.sender
    if (!suscriptas.has(ventana)) {
      suscriptas.add(ventana)
      ventana.once('destroyed', () => suscriptas.delete(ventana))
    }
    if (pendiente) {
      const aviso = pendiente
      // Después de contestar: la ventana ya tiene puesto el oído cuando llega.
      setTimeout(() => entregar(aviso), 0)
    }
    return vigia.estado()
  })
  ipcMain.handle('memoriaBaja:silenciar', (): void => vigia.silenciar(SILENCIO_DESPUES_MS))
  ipcMain.handle('memoriaBaja:estado', (): EstadoDeMemoriaBaja => vigia.estado())
}
