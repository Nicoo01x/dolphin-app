import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editorDeCodigoReclamaCtrlK } from '../../shared/ctrl-k-del-editor-de-codigo'
import { getUserKeybindingsPath } from './keybinding-file'
import { KeybindingService } from './keybinding-service'

/**
 * «Restablecer al valor predeterminado» de «Cambiar de worktree», con el servicio de la base de verdad
 * (sobre un home temporal: el archivo real de atajos es global y no se toca).
 */
describe('restablecer la paleta de worktrees y Ctrl+K en el editor', () => {
  let home: string
  const ctrlK = { type: 'keyDown', key: 'k', code: 'KeyK', control: true }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dolphin-kb-restablecer-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it.each([false, true])(
    'después de cambiarla y restablecerla, el editor vuelve a quedarse con Ctrl+K (cohorte vieja: %s)',
    (cohorteVieja) => {
      const servicio = new KeybindingService({
        homePath: home,
        platform: 'win32',
        legacySearchDefaults: cohorteVieja
      })
      servicio.setActionBindings('worktree.palette', ['Mod+Alt+K'])
      const restablecido = servicio.setActionBindings('worktree.palette', null)

      // Así lo deja la base a propósito (`getKeybindingResetBindings`): el atajo de fábrica, escrito.
      const archivo = JSON.parse(readFileSync(getUserKeybindingsPath(home), 'utf8'))
      expect(archivo.platforms.win32['worktree.palette']).toEqual(['Mod+K'])

      expect(
        editorDeCodigoReclamaCtrlK({
          input: ctrlK,
          platform: 'win32',
          keybindings: restablecido.overrides,
          editorEnfocado: true
        })
      ).toBe(true)
      // Fuera del editor, Ctrl+K sigue siendo la paleta.
      expect(
        editorDeCodigoReclamaCtrlK({
          input: ctrlK,
          platform: 'win32',
          keybindings: restablecido.overrides,
          editorEnfocado: false
        })
      ).toBe(false)
    }
  )
})
