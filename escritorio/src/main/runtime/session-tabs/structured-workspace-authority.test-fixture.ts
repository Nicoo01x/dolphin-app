import type { DolphinRuntimeService } from '../dolphin-runtime'

export const availableRevealWorkspace: DolphinRuntimeService['prepareStructuredAgentSessionRevealWorkspace'] =
  async () => ({
    current: () => true,
    check: () => {},
    release: Object.assign(() => {}, { isCurrent: () => true })
  })
