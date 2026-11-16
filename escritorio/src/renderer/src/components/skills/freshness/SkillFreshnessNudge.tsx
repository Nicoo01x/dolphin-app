import { useEffect, useRef } from 'react'
import { useSkillFreshness } from '@/hooks/skills/freshness/useSkillFreshness'
import { useActiveProjectSkillRuntime } from '@/hooks/skills/runtime/useActiveProjectSkillRuntime'
import { bundledSkillTargetKey } from '@/lib/skills/runtime/bundled-skill-target'
import { useAppStore } from '@/store/index'
import {
  bundledSkillNudgeEntries,
  bundledSkillNudgeKey
} from '../../../../../shared/bundled-skill-summary'
import { requestSkillFreshnessUpdateDialog } from './skill-freshness-update-dialog'
import { autoUpdateUnmodifiedSkills } from './skill-freshness-auto-update'
import { encolarAviso, retirarAviso } from '@/components/dolphin/avisos/avisos-store'
import { avisoDeSkills } from '@/components/dolphin/avisos/aviso-de-skills'

const MAX_DISMISSED_FRESHNESS_NUDGES = 512
const NO_DISMISSED_FRESHNESS_NUDGES: string[] = []

type ActiveFreshnessNudge = {
  id: string
  fingerprint: string
  persistDismissal: boolean
}

export function SkillFreshnessNudge(): null {
  const target = useActiveProjectSkillRuntime().bundledSkillTarget
  const targetKey = target ? bundledSkillTargetKey(target) : null
  const state = useSkillFreshness(target)
  const settingsLoaded = useAppStore((store) => store.settings !== null)
  const dismissed = useAppStore(
    (store) => store.settings?.dismissedSkillFreshnessNudges ?? NO_DISMISSED_FRESHNESS_NUDGES
  )
  const updateSettings = useAppStore((store) => store.updateSettings)
  const shownFingerprints = useRef(new Set<string>())
  const persistedFingerprints = useRef(new Set<string>())
  const activeNudgeRef = useRef<ActiveFreshnessNudge | null>(null)

  useEffect(() => {
    // Programmatic retraction is not a user dismissal, so the same nudge may return this session.
    const retract = (active: ActiveFreshnessNudge): void => {
      active.persistDismissal = false
      activeNudgeRef.current = null
      shownFingerprints.current.delete(active.fingerprint)
      retirarAviso(active.id)
    }
    if (!target || !targetKey) {
      const active = activeNudgeRef.current
      if (active) {
        retract(active)
      }
      return
    }
    const plan = state.plan
    if (!settingsLoaded) {
      return
    }
    if (!plan) {
      const active = activeNudgeRef.current
      if (state.error && active) {
        // Retract authority based on old bytes after a failed recheck without persisting a user dismissal.
        retract(active)
      }
      return
    }
    // Unedited Dolphin copies update without consent; the nudge names only edited, unknown or broken ones.
    const autoUpdating = autoUpdateUnmodifiedSkills(target, plan)
    // Fingerprint host, counted skills and offered bytes so changed bundles can prompt again.
    const fingerprint = bundledSkillNudgeKey(targetKey, plan, autoUpdating)
    if (!fingerprint || dismissed.includes(fingerprint)) {
      const active = activeNudgeRef.current
      if (active) {
        // Retracting a resolved/replaced nudge is not an explicit user dismissal.
        retract(active)
      }
      return
    }
    const active = activeNudgeRef.current
    if (active?.fingerprint === fingerprint) {
      return
    }
    if (active) {
      retract(active)
    }
    if (shownFingerprints.current.has(fingerprint)) {
      return
    }
    shownFingerprints.current.add(fingerprint)

    const persistDismissal = (): void => {
      if (persistedFingerprints.current.has(fingerprint)) {
        return
      }
      persistedFingerprints.current.add(fingerprint)
      const current = useAppStore.getState().settings?.dismissedSkillFreshnessNudges ?? []
      const next = [...new Set([...current, fingerprint])].slice(-MAX_DISMISSED_FRESHNESS_NUDGES)
      void updateSettings({ dismissedSkillFreshnessNudges: next }).catch(() => {
        persistedFingerprints.current.delete(fingerprint)
      })
    }
    const names = new Set(bundledSkillNudgeEntries(plan, autoUpdating).map((entry) => entry.name))
    // Name outdated skills directly; translate the sentence while interpolating identifiers unchanged.
    const outdatedNames = [...names]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .join(', ')
    const nextActive: ActiveFreshnessNudge = {
      id: `skill-freshness:${fingerprint}`,
      fingerprint,
      persistDismissal: true
    }
    // Dolphin: the nudge waits its turn in the centered notice queue instead of stacking as a toast.
    encolarAviso(
      avisoDeSkills({
        id: nextActive.id,
        cuantas: names.size,
        nombres: outdatedNames,
        // Persist only an explicit dismissal (the x, Escape or dragging it away); review is engagement.
        // Quitting while it waits records nothing, allowing one prompt next launch.
        alDescartar: () => {
          if (nextActive.persistDismissal) {
            persistDismissal()
          }
          if (activeNudgeRef.current === nextActive) {
            activeNudgeRef.current = null
          }
        },
        alActualizar: () => {
          // Clear ownership so later inventory cannot retain a closed notice.
          nextActive.persistDismissal = false
          if (activeNudgeRef.current === nextActive) {
            activeNudgeRef.current = null
          }
          requestSkillFreshnessUpdateDialog()
        }
      })
    )
    activeNudgeRef.current = nextActive
  }, [target, targetKey, dismissed, settingsLoaded, state.error, state.plan, updateSettings])

  return null
}
