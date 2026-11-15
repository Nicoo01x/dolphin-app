import type { DolphindMigrationCatalogState } from '../../../../shared/dolphind-migration/dolphind-migration-manifest'

export async function resolveDurableDolphindCatalogMutation(
  mutate: () => Promise<DolphindMigrationCatalogState>,
  read: () => Promise<DolphindMigrationCatalogState>,
  accepted: (state: DolphindMigrationCatalogState) => boolean
) {
  try {
    return await mutate()
  } catch (mutationError) {
    let observed: DolphindMigrationCatalogState
    try {
      observed = await read()
    } catch {
      throw mutationError
    }
    if (!accepted(observed)) {
      throw mutationError
    }
  }
  // State reads may reflect unflushed mutations; an idempotent acknowledgment proves durability.
  return mutate()
}
