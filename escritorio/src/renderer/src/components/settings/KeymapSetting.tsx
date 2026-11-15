import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { keymapDe, KEYMAPS, type Keymap } from '../editor/keymap-del-editor'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { SettingsRow, SettingsSegmentedControl } from './form-controls/SettingsFormControls'

type KeymapSettingProps = {
  settings: Pick<GlobalSettings, 'editorKeymap'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

/**
 * Qué teclado obedece el editor de archivos.
 *
 * Quien escribe en Vim escribe en Vim en todos lados, y un editor que lo ignora es un editor que
 * no va a usar. Es lo más votado del editor en los issues de arriba y no lo tenía ninguno de los
 * dos lados.
 *
 * El modo elegido se carga recién al elegirlo: quien se queda con el teclado de siempre —la
 * mayoría— no baja ni un byte de más.
 */
const NOMBRES: Record<Keymap, string> = {
  vscode: 'VS Code',
  vim: 'Vim',
  emacs: 'Emacs'
}

export function KeymapSetting({ settings, updateSettings }: KeymapSettingProps): React.JSX.Element {
  const actual = keymapDe(settings.editorKeymap)
  const titulo = translate('auto.components.settings.KeymapSetting.title', 'Editor keymap')
  const descripcion = translate(
    'auto.components.settings.KeymapSetting.description',
    'Which keybindings the file editor obeys. Vim and Emacs load only when you pick them.'
  )

  return (
    <SearchableSetting
      title={titulo}
      description={descripcion}
      keywords={['keymap', 'keybindings', 'vim', 'emacs', 'vscode', 'editor', 'shortcuts']}
    >
      <SettingsRow
        label={titulo}
        description={descripcion}
        control={
          <SettingsSegmentedControl<Keymap>
            value={actual}
            ariaLabel={titulo}
            options={KEYMAPS.map((keymap) => ({ value: keymap, label: NOMBRES[keymap] }))}
            onChange={(keymap) => updateSettings({ editorKeymap: keymap })}
          />
        }
      />
    </SearchableSetting>
  )
}
