import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DOLPHIND_MOBILE_WEB_DIR,
  DOLPHIND_MOBILE_WEB_MANIFEST,
  DOLPHIND_SERVER_TARGET_FILENAME
} from '../../shared/dolphind-artifacts'
import { listDolphindArtifactFilenames } from './dolphind-artifact-identity'

describe('listDolphindArtifactFilenames', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dolphind-identity-'))
    await writeFile(join(directory, DOLPHIND_SERVER_TARGET_FILENAME), 'linux-x64-glibc\n')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('covers a server built without the mobile page instead of refusing it', async () => {
    const filenames = await listDolphindArtifactFilenames(directory)

    expect(filenames.length).toBeGreaterThan(0)
    expect(filenames).not.toContain(DOLPHIND_MOBILE_WEB_MANIFEST)
    expect(filenames.some((filename) => filename.startsWith(`${DOLPHIND_MOBILE_WEB_DIR}/`))).toBe(
      false
    )
  })

  it('still covers the page when the slot ships one', async () => {
    const manifest = join(directory, DOLPHIND_MOBILE_WEB_MANIFEST)
    await mkdir(dirname(manifest), { recursive: true })
    await writeFile(manifest, JSON.stringify({ assets: [{ path: 'index.html' }] }))

    const filenames = await listDolphindArtifactFilenames(directory)

    expect(filenames).toContain(DOLPHIND_MOBILE_WEB_MANIFEST)
    expect(filenames).toContain(`${DOLPHIND_MOBILE_WEB_DIR}/index.html`)
  })
})
