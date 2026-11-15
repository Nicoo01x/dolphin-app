import { describe, expect, it } from 'vitest'
import {
  buildWindowsCmdSkillBranch,
  formatSkillsSourceForCommand,
  parseSkillsAddCommand,
  skillsCommandForWsl
} from './dolphin-skills-command'

describe('la carpeta de skills de Dolphin en un comando', () => {
  it('una ruta de Windows va con barras normales y sin comillas si no le hacen falta', () => {
    expect(formatSkillsSourceForCommand('D:\\proyectos\\dolphin-escritorio\\skills')).toBe(
      'D:/proyectos/dolphin-escritorio/skills'
    )
  })

  it('con espacios o paréntesis va entre comillas dobles, que valen en bash, PowerShell y cmd', () => {
    expect(formatSkillsSourceForCommand('C:\\Program Files (x86)\\Dolphin\\dolphin-skills')).toBe(
      '"C:/Program Files (x86)/Dolphin/dolphin-skills"'
    )
    expect(formatSkillsSourceForCommand('/Applications/Dolphin Beta.app/x')).toBe(
      '"/Applications/Dolphin Beta.app/x"'
    )
  })

  it('una URL no se toca', () => {
    const url = 'https://github.com/stablyai/dolphin/tree/0123abc'
    expect(formatSkillsSourceForCommand(url)).toBe(url)
  })

  it('reconoce la fuente sola o entre comillas', () => {
    expect(parseSkillsAddCommand('npx skills@1.7.2 add "C:/a b" --skill x')).toEqual({
      head: 'npx skills@1.7.2 add ',
      source: 'C:/a b',
      quoted: true,
      tail: ' --skill x'
    })
    expect(parseSkillsAddCommand('npx skills add orchestration --global')?.source).toBe(
      'orchestration'
    )
    expect(parseSkillsAddCommand('npx skills update orchestration')).toBeNull()
  })
})

describe('la rama de cmd que se pega en PowerShell', () => {
  it('sin una fuente entre comillas queda el comando entre paréntesis, como siempre', () => {
    expect(buildWindowsCmdSkillBranch('npx skills@1.7.2 add D:/x/skills --skill y')).toBe(
      '(npx skills@1.7.2 add D:/x/skills --skill y)'
    )
  })

  it('con una ruta entre comillas entra a la carpeta y le pasa «.»: ninguna comilla adentro', () => {
    const branch = buildWindowsCmdSkillBranch(
      'npx skills@1.7.2 add "C:/Program Files (x86)/Dolphin/dolphin-skills" --skill y --global'
    )
    expect(branch).toBe(
      'cd /d C:\\Program Files (x86)\\Dolphin\\dolphin-skills && npx skills@1.7.2 add . --skill y --global'
    )
    expect(branch).not.toContain('"')
  })

  it('una ruta con algo que cmd reinterpreta no se envuelve', () => {
    expect(
      buildWindowsCmdSkillBranch('npx skills@1.7.2 add "C:/Tom & Jerry/s" --skill y')
    ).toBeNull()
  })
})

describe('en WSL', () => {
  it('la carpeta de Windows se escribe como la ve Linux, por /mnt/<unidad>', () => {
    expect(skillsCommandForWsl('npx skills@1.7.2 add D:/proyectos/skills --skill y')).toBe(
      'npx skills@1.7.2 add /mnt/d/proyectos/skills --skill y'
    )
    expect(skillsCommandForWsl('npx skills@1.7.2 add "C:/Program Files/D/s" --skill y')).toBe(
      'npx skills@1.7.2 add "/mnt/c/Program Files/D/s" --skill y'
    )
  })

  it('una URL o un nombre suelto no se tocan', () => {
    const url = 'npx skills@1.7.2 add https://github.com/a/b/tree/c --skill y'
    expect(skillsCommandForWsl(url)).toBe(url)
    expect(skillsCommandForWsl('npx skills add orchestration --global')).toBe(
      'npx skills add orchestration --global'
    )
  })
})
