import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  resolverAlcanceDePrediccion,
  type AlcanceDePrediccion
} from '../../../../shared/prediccion-de-edicion-settings'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { Label } from '../ui/label'
import { SettingsSegmentedControl } from './form-controls/SettingsFormControls'

/**
 * El Tab predictivo, en sus tres escalones.
 *
 * Son tres y no un interruptor porque cuestan cosas distintas y la persona tiene que poder elegir
 * qué paga: el escalón local no abre procesos ni pide red, y el de modelo gasta cuota de verdad.
 * Por eso el default es el del medio y el de arriba se prende a mano, acá.
 */

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

const TITULO = translate(
  'auto.components.settings.EditorPrediccionSetting.titulo',
  'Predictive Tab'
)
const DESCRIPCION = translate(
  'auto.components.settings.EditorPrediccionSetting.descripcion',
  'After an edit, Tab offers the next one as ghost text. Local reads only the file you are editing and costs nothing; with a model also asks an agent, which uses your quota.'
)

export function EditorPrediccionSetting({ settings, updateSettings }: Props): React.JSX.Element {
  const valor = resolverAlcanceDePrediccion(settings.prediccionDeEdicion)
  return (
    <SearchableSetting
      title={TITULO}
      description={DESCRIPCION}
      keywords={[
        'tab',
        'predictive',
        'prediction',
        'ghost text',
        'autocomplete',
        'next edit',
        'rename',
        'predictivo',
        'prediccion'
      ]}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label>{TITULO}</Label>
        <p className="text-xs text-muted-foreground">{DESCRIPCION}</p>
      </div>
      <SettingsSegmentedControl
        ariaLabel={TITULO}
        value={valor}
        onChange={(opcion) =>
          updateSettings({ prediccionDeEdicion: opcion as AlcanceDePrediccion })
        }
        options={[
          {
            value: 'apagada',
            label: translate('auto.components.settings.EditorPrediccionSetting.apagada', 'Off')
          },
          {
            value: 'local',
            label: translate('auto.components.settings.EditorPrediccionSetting.local', 'Local')
          },
          {
            value: 'con-modelo',
            label: translate(
              'auto.components.settings.EditorPrediccionSetting.conModelo',
              'With a model'
            )
          }
        ]}
      />
    </SearchableSetting>
  )
}
