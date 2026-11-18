import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  DOLPHIND_MOBILE_WEB_MANIFEST,
  DOLPHIND_SERVER_TARGET_FILENAME,
  DOLPHIND_VERSION,
  dolphindArtifactFilenames,
  dolphindMobileWebAssetFilenames
} from '../../shared/dolphind-artifacts'
import { COMPAT_SERVER_TARGETS, SERVER_TARGETS } from '../../shared/node-runtime-pin'
import { dolphindAgentBrowserNativeName } from '../../shared/dolphind-agent-browser-name'

/** Hash installed bytes in the build's order; a version marker is not proof of delivery. */
export async function readDolphindArtifactIdentity(directory: string): Promise<string> {
  const hash = createHash('sha256')
  for (const filename of await listDolphindArtifactFilenames(directory)) {
    for await (const chunk of createReadStream(join(directory, filename))) {
      hash.update(chunk)
    }
  }
  return `${DOLPHIND_VERSION}+${hash.digest('hex').slice(0, 12)}`
}

/**
 * The page's assets, or none when the slot ships no page.
 * Why: a build without the mobile app ships a server without the page, which
 * `dolphindArtifactFilenames` already treats as a supported degradation; reading the manifest
 * unconditionally made that server refuse to start ("artifacts are incomplete or altered").
 */
async function readMobileWebAssetFilenames(directory: string): Promise<string[]> {
  const manifest = join(directory, DOLPHIND_MOBILE_WEB_MANIFEST)
  if (!existsSync(manifest)) {
    return []
  }
  return dolphindMobileWebAssetFilenames(await readFile(manifest, 'utf8'))
}

/** The installed files the artifact identity covers, in the build's order. */
export async function listDolphindArtifactFilenames(directory: string): Promise<string[]> {
  const target = z
    .enum([...SERVER_TARGETS, ...COMPAT_SERVER_TARGETS])
    .parse((await readFile(join(directory, DOLPHIND_SERVER_TARGET_FILENAME), 'utf8')).trim())
  const platform = target.startsWith('win32-')
    ? 'win32'
    : target.startsWith('darwin-')
      ? 'darwin'
      : 'linux'
  const browser = dolphindAgentBrowserNativeName(
    platform,
    target.split('-')[1] ?? '',
    target.endsWith('-musl') ? 'musl' : 'glibc'
  )
  const filenames = dolphindArtifactFilenames(target, await readMobileWebAssetFilenames(directory))
  if (existsSync(join(directory, browser))) {
    filenames.push(browser)
  }
  return filenames
}
