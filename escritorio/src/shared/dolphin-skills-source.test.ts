import { describe, expect, it } from 'vitest'
import { formatDolphinSkillsDirArgument, readDolphinSkillsDirArgument } from './dolphin-skills-source'
import { buildAgentFeatureSkillInstallCommand } from './agent-feature-install-commands'

const CARPETA = 'D:\\Proyectos Nico\\dolphin-escritorio\\skills'

describe('las skills propias de Dolphin', () => {
  it('la carpeta viaja de main a la ventana como argumento, y sin él no hay carpeta', () => {
    const argv = ['electron', formatDolphinSkillsDirArgument(CARPETA), '--otro=1']
    expect(readDolphinSkillsDirArgument(argv)).toBe(CARPETA)
    expect(readDolphinSkillsDirArgument(['electron'])).toBeNull()
  })

  it('el comando instala desde la carpeta propia, con barras normales y entre comillas, y no del repo de Dolphin', () => {
    const comando = buildAgentFeatureSkillInstallCommand(['dolphin-cli', 'orchestration'], {
      sourceCommit: 'abc123',
      source: CARPETA
    })
    expect(comando).toBe(
      'npx skills@1.7.2 add "D:/Proyectos Nico/dolphin-escritorio/skills" --skill dolphin-cli --skill orchestration --global'
    )
    expect(comando).not.toContain('stablyai')
  })

  it('sin carpeta propia el comando queda como antes, pinneado al commit', () => {
    expect(
      buildAgentFeatureSkillInstallCommand(['orchestration'], { sourceCommit: 'abc123' })
    ).toBe(
      'npx skills@1.7.2 add https://github.com/stablyai/orca/tree/abc123 --skill orchestration --global'
    )
  })
})
