import { build } from 'esbuild'
import { join } from 'node:path'
import { DOLPHIND_LINEAR_SDK_ENTRY } from '../../../../src/shared/dolphind-artifacts.ts'
import { DOLPHIND_SERVER_BUILD_TARGET } from './dolphind-entry-build.mjs'

// Bundle @linear/sdk into one CJS file for lazy require: copying would expose chunk names that change each release.
export async function stageDolphindLinearSdk(root, outputDir) {
  await build({
    stdin: {
      contents: "module.exports = require('@linear/sdk')",
      resolveDir: root,
      sourcefile: 'dolphind-linear-sdk-entry.js'
    },
    bundle: true,
    platform: 'node',
    target: DOLPHIND_SERVER_BUILD_TARGET,
    format: 'cjs',
    outfile: join(outputDir, DOLPHIND_LINEAR_SDK_ENTRY),
    minify: true,
    sourcemap: false,
    logLevel: 'error'
  })
}
