import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'

/**
 * The managed account whose folder is `target`: the session reports the account it actually ran
 * with, as a path, and this names it.
 *
 * Why its own module: both hosts need it, and dolphind had grown a second copy of the same lookup in
 * its account services — one the runtime constructor silently dropped, because it was handed over
 * as a dependency the runtime never declared.
 */
export function managedAccountIdAt<T extends { id: string }>(
  accounts: readonly T[] | undefined,
  folderOf: (account: T) => string,
  target: string
): string | undefined {
  const wanted = normalizeRuntimePathForComparison(target)
  return accounts?.find(
    (account) => normalizeRuntimePathForComparison(folderOf(account)) === wanted
  )?.id
}
