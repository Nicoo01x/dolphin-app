// Always report available to prevent plaintext fallback; throw on seal/unseal when the key is unavailable.
import type { SecretStore } from '../../shared/secret-store'
import { sweepStaleRecordStaging } from './dolphind-secret-key-record'
import {
  dolphindSecretStatePath,
  resolveState,
  type DolphindSecretStorePrepareOptions,
  type StoreState
} from './dolphind-secret-key-resolution'
import { openDolphindSecret, sealDolphindSecret } from './dolphind-secret-sealing'

export type DolphindSecretStore = SecretStore & {
  prepare(options: DolphindSecretStorePrepareOptions): Promise<boolean>
}

export function createDolphindSecretStore(
  log: (message: string) => void = (message) => console.warn(message)
): DolphindSecretStore {
  let state: StoreState = { kind: 'pending' }
  const readyKey = (): Buffer => {
    if (state.kind === 'ready') {
      return state.key
    }
    throw new Error(
      state.kind === 'unavailable'
        ? state.message
        : 'dolphind_secret_store_not_prepared — the headless secret store has not loaded its key yet'
    )
  }
  return {
    isEncryptionAvailable: () => state.kind !== 'plaintext',
    encryptString: (plainText) => sealDolphindSecret(readyKey(), plainText),
    decryptString: (cipher) => openDolphindSecret(readyKey(), cipher),
    describeProtectionGap: () => {
      switch (state.kind) {
        case 'ready':
          return state.gap
        case 'unavailable':
          return state.message
        case 'plaintext':
          return state.reason
        case 'pending':
          return "Dolphin's headless server has not loaded its credential key yet."
      }
    },
    async prepare(next) {
      sweepStaleRecordStaging(dolphindSecretStatePath(next))
      state = await resolveState(next, log)
      return state.kind === 'ready'
    }
  }
}
