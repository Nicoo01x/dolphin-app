import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runProcess } from '@dolphin/process-host'
import {
  DOLPHIND_LAUNCHER_FILENAME,
  DOLPHIND_SERVER_ENTRY_FILENAME
} from '../../shared/dolphind-artifacts'

let directory = ''
let launcher = ''

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dolphind-help-'))
  launcher = join(directory, DOLPHIND_LAUNCHER_FILENAME)
  const builder = pathToFileURL(
    join(process.cwd(), 'config/scripts/dolphind-distribution/server-bundle/dolphind-entry-build.mjs')
  ).href
  const built = await runProcess({
    program: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `import {buildDolphindEntry,buildDolphindLauncher} from ${JSON.stringify(builder)};` +
        `await buildDolphindEntry(${JSON.stringify(join(directory, DOLPHIND_SERVER_ENTRY_FILENAME))});` +
        `await buildDolphindLauncher(${JSON.stringify(launcher)});`
    ],
    env: { ...process.env, DOLPHIN_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 60_000
  })
  expect(built.code, built.stderr).toBe(0)
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('real dolphind executable help', () => {
  it('leaves an existing instance lock untouched', async () => {
    const dataRoot = join(directory, 'locked-profile')
    await mkdir(dataRoot)
    const lock = join(dataRoot, 'dolphind.lock')
    const content = 'an existing instance owns this profile\n'
    await writeFile(lock, content)
    const result = await runProcess({
      program: process.execPath,
      args: [launcher, '--help'],
      env: { ...process.env, DOLPHIN_BACKGROUND_LAUNCH: '1', DOLPHIN_USER_DATA: dataRoot },
      timeoutMs: 10_000
    })
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(await readFile(lock, 'utf8')).toBe(content)
    expect(await readdir(dataRoot)).toEqual(['dolphind.lock'])
  })
})
