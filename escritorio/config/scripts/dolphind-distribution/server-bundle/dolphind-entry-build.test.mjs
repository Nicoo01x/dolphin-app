import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  buildDolphindCli,
  buildDolphindEntry,
  escapeLegalCommentTail,
  findNonAsciiSource,
  DOLPHIND_COMMONJS_MODULE_OPTIONS
} from './dolphind-entry-build.mjs'
import { runProcessSync } from '@dolphin/process-host'

const directory = mkdtempSync(join(tmpdir(), 'dolphin-structured-provider-build-'))
const bundle = join(directory, 'dolphind-server.js')

beforeAll(async () => {
  await buildDolphindEntry(bundle)
}, 60_000)

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

it('loads the structured Claude SDK through the packaged server under plain Node', () => {
  const loaded = runProcessSync({
    program: process.execPath,
    args: [bundle, '--dolphind-structured-provider-load-check'],
    cwd: directory,
    env: { DOLPHIN_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 30_000
  })
  expect(loaded.code, loaded.stderr.slice(-2_000)).toBe(0)
}, 40_000)

// #33592: the shipped CLI once bundled jsonc-parser's UMD build, whose relative requires fail.
it('runs a jsonc-parser-backed command from the packaged CLI under plain Node', async () => {
  const cli = join(directory, 'cli', 'index.js')
  await buildDolphindCli(cli)
  const home = join(directory, 'home')
  mkdirSync(home)
  const status = runProcessSync({
    program: process.execPath,
    args: [cli, 'agent', 'hooks', 'status', '--json'],
    cwd: home,
    env: {
      DOLPHIN_BACKGROUND_LAUNCH: '1',
      HOME: home,
      USERPROFILE: home,
      DOLPHIN_USER_DATA_PATH: join(home, 'user-data')
    },
    timeoutMs: 30_000
  })
  expect(status.code, status.stdout + status.stderr).toBe(0)
  expect(JSON.parse(status.stdout).ok).toBe(true)
}, 60_000)

it('resolves bundle-relative requires after deployment to a path with URL-special characters', async () => {
  const buildDirectory = join(directory, 'build')
  mkdirSync(buildDirectory)
  const outfile = join(buildDirectory, 'entry.cjs')
  await build({
    ...DOLPHIND_COMMONJS_MODULE_OPTIONS,
    stdin: {
      contents: `import { createRequire } from 'node:module';
        console.log(createRequire(import.meta.url)('./asset.cjs'));`,
      resolveDir: directory
    },
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile,
    minify: true,
    logLevel: 'error'
  })
  writeFileSync(join(buildDirectory, 'asset.cjs'), 'module.exports = "deployed asset"')
  const deployedDirectory = join(directory, 'deployed # 100%')
  renameSync(buildDirectory, deployedDirectory)
  const loaded = runProcessSync({
    program: process.execPath,
    args: [join(deployedDirectory, 'entry.cjs')],
    cwd: directory,
    env: { DOLPHIN_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 30_000
  })
  expect(loaded.code, loaded.stderr).toBe(0)
  expect(loaded.stdout.trim()).toBe('deployed asset')
})

it.each(['import.meta', 'import.meta.dirname', 'import.meta.filename', 'import.meta.resolve'])(
  'rejects unsupported %s instead of silently replacing it with an empty object',
  async (expression) => {
    await expect(
      build({
        ...DOLPHIND_COMMONJS_MODULE_OPTIONS,
        stdin: { contents: `console.log(${expression})`, resolveDir: directory },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        logLevel: 'silent'
      })
    ).rejects.toThrow('"import.meta" is not available')
  }
)

it('escapes only the trailing license comment, never code', () => {
  const code = 'a=/[\u2726]/;'
  const escaped = escapeLegalCommentTail(
    `${code}\n/*! Bundled license information:\n  (c) Jos\u00e9 \u{1F600}\n*/\n`
  )
  expect(escaped.startsWith(code)).toBe(true)
  expect(escaped).toContain('(c) Jos\\u{e9} \\u{1f600}')
  expect(findNonAsciiSource(escaped.slice(code.length))).toBeNull()
  expect(escapeLegalCommentTail(code)).toBe(code)
})
