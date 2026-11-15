import { cpSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  DOLPHIND_MOBILE_WEB_DIR,
  DOLPHIND_MOBILE_WEB_MANIFEST,
  dolphindMobileWebAssetFilenames
} from '../../../../src/shared/dolphind-artifacts.ts'

const { MOBILE_WEB_BUNDLE_DIR, assertMobileWebBundleBuilt } = createRequire(import.meta.url)(
  '../../desktop-distribution/runtime-verification/verify-packaged-mobile-web-bundle.cjs'
)
const { assertNoDarkOutputOfOffSwitches } = createRequire(import.meta.url)(
  '../../../dark-build-switches.cjs'
)

// Require a fresh built page as beforePack does: a dolphind package without it cannot serve phones.
export function stageDolphindMobileWebBundle(outputDir, bundleDir = MOBILE_WEB_BUNDLE_DIR) {
  // The release template refuses the variable itself.
  assertNoDarkOutputOfOffSwitches([bundleDir])
  if (!existsSync(bundleDir)) {
    return false
  }
  assertMobileWebBundleBuilt(bundleDir)
  // The guard refuses unlisted files, so the tree is the manifest, its assets and catalogs, and a dark marker.
  cpSync(bundleDir, join(outputDir, ...DOLPHIND_MOBILE_WEB_DIR.split('/')), { recursive: true })
  return true
}

export function readDolphindMobileWebAssetFilenames(packageDir) {
  const manifest = join(packageDir, ...DOLPHIND_MOBILE_WEB_MANIFEST.split('/'))
  if (!existsSync(manifest)) {
    return []
  }
  return dolphindMobileWebAssetFilenames(readFileSync(manifest, 'utf8'))
}
