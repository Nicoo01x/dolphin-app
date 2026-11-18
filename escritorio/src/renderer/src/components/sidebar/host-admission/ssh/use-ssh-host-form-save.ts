import { useState } from 'react'
import { useAppStore } from '@/store/index'
import type { EditingTarget } from '../../../ssh-host-form/ssh-target-draft'
import { saveNewSshHostFromForm } from './add-remote-host-ssh-actions'

export type SshHostFormSave = {
  /** Why the connection test failed, with its next step; null until a test fails. */
  testFailure: string | null
  clearTestFailure: () => void
  /** `skipTest` is "Save anyway": the person chose to keep a host that didn't answer. */
  save: (skipTest?: boolean) => Promise<void>
}

/**
 * Save a host from the SSH form, trying it first.
 *
 * Why test before saving: a host saved with a typo or a closed port only failed later, on the
 * first connect, far from the form where it could be fixed. Testing first keeps the person on
 * the form with the reason and its next step, and "Save anyway" keeps the choice theirs.
 */
export function useSshHostFormSave({
  form,
  setIsSaving,
  onSaved
}: {
  form: EditingTarget
  setIsSaving: (saving: boolean) => void
  onSaved: () => void
}): SshHostFormSave {
  const setSshTargetsMetadata = useAppStore((s) => s.setSshTargetsMetadata)
  const recordSshRepoReadoptions = useAppStore((s) => s.recordSshRepoReadoptions)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [testFailure, setTestFailure] = useState<string | null>(null)

  const save = async (skipTest = false): Promise<void> => {
    setIsSaving(true)
    setTestFailure(null)
    try {
      const outcome = await saveNewSshHostFromForm({
        form,
        ssh: window.api.ssh,
        recordSshRepoReadoptions,
        setSshTargetsMetadata,
        recordFeatureInteraction,
        // A preload from before the draft test (a hot-reloaded renderer) saves untested.
        ...(skipTest || typeof window.api.ssh.testDraftConnection !== 'function'
          ? {}
          : {
              testFirst: {
                run: (target) => window.api.ssh.testDraftConnection({ target }),
                onFailed: setTestFailure
              }
            })
      })
      if (outcome === 'saved') {
        onSaved()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { testFailure, clearTestFailure: () => setTestFailure(null), save }
}
