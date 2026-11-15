import { existsSync } from 'node:fs'
import path from 'node:path'
import { buildCli } from './cli-build/build-cli.mjs'

/**
 * Dolphin: los agentes que corren en la app de desarrollo orquestan con `dolphin-dev`, que
 * ejecuta `out/cli/index.js`. `pnpm dev` no lo compilaba, así que en un checkout nuevo la
 * orquestación fallaba con «CLI not built yet» y había que acordarse de `pnpm run build:cli`.
 * Se compila solo cuando falta: recompilarlo en cada arranque sumaría segundos sin necesidad.
 */
export async function ensureDevCliBuilt(repoRoot) {
  if (existsSync(path.join(repoRoot, 'out', 'cli', 'index.js'))) {
    return false
  }
  console.log('[dolphin-dev] Building the dolphin-dev CLI for agents (first run)...')
  await buildCli({ root: repoRoot })
  return true
}
