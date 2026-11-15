/**
 * Dolphin habla el contrato público de la base (decisión del dueño, 11/11): un plugin escrito para
 * La base declara `engines.orca` y su release de catálogo `minimumOrca`, que en Dolphin se llaman
 * `engines.dolphin` y `minimumDolphin`. Acá se traducen antes de validar, así el resto del código
 * ve un solo nombre. Si el plugin trae los dos, gana el de Dolphin.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `{ engines: { orca } }` → `{ engines: { dolphin } }`; lo demás pasa igual. */
export function acceptOrcaManifestNames(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.engines) || !('orca' in raw.engines)) {
    return raw
  }
  const { orca, ...engines } = raw.engines
  return { ...raw, engines: 'dolphin' in engines ? engines : { ...engines, dolphin: orca } }
}

/** Una release de catálogo con `minimumOrca` → `minimumDolphin`; lo demás pasa igual. */
export function acceptOrcaCatalogReleaseNames(raw: unknown): unknown {
  if (!isRecord(raw) || !('minimumOrca' in raw)) {
    return raw
  }
  const { minimumOrca, ...release } = raw
  return 'minimumDolphin' in release ? release : { ...release, minimumDolphin: minimumOrca }
}

/** Un catálogo entero (`orca-catalog.json` u `orca-marketplace.json`): cada release de cada plugin. */
export function acceptOrcaCatalogNames(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.plugins)) {
    return raw
  }
  const plugins = raw.plugins.map((plugin: unknown) =>
    isRecord(plugin) && Array.isArray(plugin.releases)
      ? { ...plugin, releases: plugin.releases.map(acceptOrcaCatalogReleaseNames) }
      : plugin
  )
  return { ...raw, plugins }
}
