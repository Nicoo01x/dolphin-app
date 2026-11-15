import type { Store } from '../loading-store/store'
import {
  listDolphindMigrationSourceCutovers,
  setDolphindMigrationJournalChangeListener
} from './dolphind-migration-cutover-journal'

export function installDolphindMigrationScrollbackRetention(
  userDataPath: string,
  store: Pick<Store, 'syncDolphindMigrationScrollbackRetention'>
): void {
  const sync = (path: string): void => {
    try {
      // Retain bytes until durable commit/abort; closed tabs must still upload on retry.
      const pending = listDolphindMigrationSourceCutovers(path).filter(
        (cutover) => cutover.phase === 'source-fenced' || cutover.phase === 'destination-staged'
      )
      store.syncDolphindMigrationScrollbackRetention(pending.map((cutover) => cutover.manifest))
    } catch (error) {
      // An unreadable journal keeps whatever is held; releasing on a guess could lose bytes.
      console.warn('[dolphind-migration] Could not sync scrollback retention:', error)
    }
  }
  setDolphindMigrationJournalChangeListener(sync)
  sync(userDataPath)
}
