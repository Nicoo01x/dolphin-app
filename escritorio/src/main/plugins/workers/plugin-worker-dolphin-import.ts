// No `node:module` import here: `dolphin plugin test` loads this on Node 20.6, which has no registerHooks.

// `orca` también: un worker escrito para la base importa `orca` y tiene que ver el mismo aviso.
export const isDolphinSpecifier = (specifier: string): boolean =>
  specifier === 'dolphin' ||
  specifier.startsWith('dolphin/') ||
  specifier === 'orca' ||
  specifier.startsWith('orca/')

/** Why a worker cannot import `dolphin` at run time; `dolphin plugin test` says the same. */
export function pluginWorkerDolphinImportMessage(specifier: string): string {
  return `cannot import "${specifier}" at run time: it only provides types. Write \`import type { DolphinWorkerApi } from 'dolphin/worker'\` and use the \`dolphin\` object passed to activate(dolphin).`
}
