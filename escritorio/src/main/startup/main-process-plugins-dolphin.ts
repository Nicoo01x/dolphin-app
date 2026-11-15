import { app } from 'electron'
import {
  DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED,
  DOLPHIN_USA_LA_NUBE_DE_DOLPHIN
} from '../../shared/dolphin-brand'
import { PluginKillListService } from '../plugins/catalog/plugin-kill-list-service'
import { getPluginsDataDir } from '../plugins/plugin-discovery'

export { cuandoSeAbraElCatalogo } from '../plugins/catalog/catalogo-abierto'

/**
 * El servicio de la lista de plugins bloqueados, armado como lo arma la base.
 *
 * Why acá: el arranque de plugins de la base está justo en su tope de líneas, y lo único que Dolphin
 * le cambia es cuándo se baja la lista; armarlo de este lado deja lugar para ese enganche.
 */
export function crearListaDeBloqueados(): PluginKillListService {
  return new PluginKillListService({
    pluginsDataDir: getPluginsDataDir(app.getPath('userData'))
  })
}

/** Why: la lista de plugins bloqueados vive en la nube de la base, que Dolphin no usa. */
export function bajaListaDeBloqueados(): boolean {
  return app.isPackaged && DOLPHIN_USA_LA_NUBE_DE_DOLPHIN
}

/**
 * Why: los conteos de instalaciones del catálogo salen de la nube de la base, que
 * Dolphin no usa. Sin esto, abrir el catálogo le pedía `stats.json` a su servidor.
 */
export function bajaEstadisticasDePlugins(): boolean {
  return DOLPHIN_USA_LA_NUBE_DE_DOLPHIN
}

/** Con el marketplace oficial apagado no se siembra ni el oficial ni el de la comunidad. */
export function siembraMarketplaces(): boolean {
  return DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
}
