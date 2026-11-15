import { DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED } from '../../shared/dolphin-brand'
import { isOfficialMarketplaceGitSource } from '../../shared/plugins/catalog/plugin-marketplace'
import type { PluginMarketplaceStore } from './catalog/plugin-marketplace-store'

type RegisteredSource = Awaited<ReturnType<PluginMarketplaceStore['listSources']>>[number]

const OFFICIAL_DISABLED_MESSAGE = 'the official marketplace is not enabled for this build'

// Why: en Dolphin el marketplace oficial es el de DOLPHIN, sin su lista de bloqueados. Apagado
// (ver DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED en shared/dolphin-brand.ts), ni se lista ni se refresca.
// El interruptor se lee acá y no viaja como opción del servicio de la base: así ese archivo sólo llama
// a estas funciones, y quien quiera probar el caso apagado lo pasa explícito.
export function isBlocked(
  source: RegisteredSource,
  officialEnabled = DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
): boolean {
  return !officialEnabled && isOfficialMarketplaceGitSource(source.source.url)
}

export async function allowed(
  store: PluginMarketplaceStore,
  officialEnabled = DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
): Promise<RegisteredSource[]> {
  return (await store.listSources()).filter((source) => !isBlocked(source, officialEnabled))
}

/** Agregar a mano la URL del marketplace de DOLPHIN tampoco vale cuando está apagado. */
export function assertAllowed(
  url: string,
  officialEnabled = DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
): void {
  if (!officialEnabled && isOfficialMarketplaceGitSource(url)) {
    throw new Error(OFFICIAL_DISABLED_MESSAGE)
  }
}

/** La misma fuente, después de pasar por `assertAllowed`. */
export function allowedSource<T extends { url: string }>(
  source: T,
  officialEnabled = DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
): T {
  assertAllowed(source.url, officialEnabled)
  return source
}

/** Sembrar el marketplace oficial apagado se rechaza sin tocar el store ni la red. */
export function allowedOfficialSeed<T>(
  seed: () => Promise<T>,
  officialEnabled = DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED
): Promise<T> {
  return officialEnabled ? seed() : Promise.reject(new Error(OFFICIAL_DISABLED_MESSAGE))
}
