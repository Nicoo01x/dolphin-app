import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { SettingsSwitchRow } from './form-controls/SettingsFormControls'

type FormatOnSaveSettingProps = {
  settings: Pick<GlobalSettings, 'editorFormatOnSave'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

/**
 * Off by default, and the description says who does the formatting: the language server already
 * installed for that language, not a formatter Dolphin ships. Nothing is installed by turning
 * this on, and a file whose language has no server saves exactly as before.
 */
export function FormatOnSaveSetting({
  settings,
  updateSettings
}: FormatOnSaveSettingProps): React.JSX.Element {
  const enabled = settings.editorFormatOnSave === true

  return (
    <SearchableSetting
      title={translate('auto.components.settings.FormatOnSaveSetting.title', 'Format on Save')}
      description={translate(
        'auto.components.settings.FormatOnSaveSetting.description',
        "Run the language server's formatter when you save. Files whose language has no server installed are saved unchanged."
      )}
      keywords={['format', 'formatting', 'prettier', 'save', 'lsp', 'language server']}
    >
      <SettingsSwitchRow
        label={translate('auto.components.settings.FormatOnSaveSetting.title', 'Format on Save')}
        description={translate(
          'auto.components.settings.FormatOnSaveSetting.description',
          "Run the language server's formatter when you save. Files whose language has no server installed are saved unchanged."
        )}
        checked={enabled}
        onChange={() => updateSettings({ editorFormatOnSave: !enabled })}
      />
    </SearchableSetting>
  )
}
