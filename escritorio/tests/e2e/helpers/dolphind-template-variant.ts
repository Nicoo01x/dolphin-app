// Change only template build identity to model an app update bundling a newer dolphind.
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DOLPHIND_TEMPLATE_MANIFEST_FILENAME,
  DOLPHIND_VERSION
} from '../../../src/shared/dolphind-artifacts'

const ENTRY = 'dolphind.js'

/** Rewrites `templateDir` in place; its manifest keeps verifying. */
export function makeDolphindTemplateVariant(templateDir: string, tag: string): void {
  const entry = path.join(templateDir, ENTRY)
  appendFileSync(entry, `\n// dolphind e2e template variant ${tag}\n`)
  const manifestPath = path.join(templateDir, DOLPHIND_TEMPLATE_MANIFEST_FILENAME)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.commonSha256[ENTRY] = createHash('sha256').update(readFileSync(entry)).digest('hex')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** The host's activation record, read the way a client reads it. */
export function readHostDolphindActivation(exec: (command: string) => string): {
  active?: string
  previous?: string
  activeAppVersion?: string
} {
  return JSON.parse(exec('cat "$HOME/.dolphin-remote/dolphind-active.json"'))
}

export function isDolphindFullVersion(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${DOLPHIND_VERSION}+`)
}
