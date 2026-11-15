import { globSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Dolphin updater network destinations', () => {
  it('does not retain the old DOLPHIN destinations in updater code or config', () => {
    const paths = [
      ...globSync('src/main/updater*'),
      ...globSync('src/main/updater/**/*.ts'),
      'src/shared/release-channel.ts',
      'config/dev-app-update.yml',
      'src/renderer/src/components/maintenance/update-card/UpdateAvailableCardContent.tsx'
    ].filter(
      (path) =>
        statSync(path).isFile() && !path.includes('.test.') && !path.includes('updater-test-')
    )
    const forbidden = /stablyai\/dolphin|onorca\.dev|dolphin\.dev/i

    for (const path of paths) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(forbidden)
    }
  })
})
