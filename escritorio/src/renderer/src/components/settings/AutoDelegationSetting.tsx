import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { Switch } from '../ui/switch'
import { searchKeywords } from './search/settings-search-keywords'

type AutoDelegationSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

/**
 * El interruptor de la delegación automática.
 *
 * Por qué vive acá y no adentro del chat: lo que decide es cuánto puede abrir Dolphin por su
 * cuenta, y eso se elige una vez, no por conversación. El aviso de la función (el cartel con el
 * video) enlaza a esta fila, así que su texto tiene que alcanzar para decidir sin volver al aviso.
 *
 * Los textos pasan por `translate` con su fallback en inglés, como el resto de los ajustes: la
 * interfaz de la app está en inglés y los catálogos tienen las traducciones. Escribirlos sueltos
 * los deja afuera de todos los idiomas, y el verificador de localización lo corta.
 *
 * Y la clave va escrita en la llamada, no en una constante de arriba: el extractor que llena
 * `en.json` lee el código sin ejecutarlo, así que una clave guardada en una variable no la ve
 * y la fila termina fuera de los catálogos aunque el `translate` esté puesto.
 */
export function AutoDelegationSetting({
  settings,
  updateSettings
}: AutoDelegationSettingProps): React.JSX.Element {
  const prendida = settings.autoDelegation === true
  const titulo = translate(
    'auto.components.settings.AutoDelegationSetting.title',
    'Intelligent Orchestration'
  )

  return (
    <SearchableSetting
      title={titulo}
      description={translate(
        'auto.components.settings.AutoDelegationSetting.summary',
        'The lead splits a large task and opens one teammate per part, each with its own model.'
      )}
      keywords={searchKeywords([
        { key: 'auto.components.settings.autoDelegation.search.delegate', fallback: 'delegate' },
        {
          key: 'auto.components.settings.autoDelegation.search.delegation',
          fallback: 'delegation'
        },
        {
          key: 'auto.components.settings.autoDelegation.search.orchestrate',
          fallback: 'orchestrate'
        },
        { key: 'auto.components.settings.autoDelegation.search.team', fallback: 'team' },
        { key: 'auto.components.settings.autoDelegation.search.teammates', fallback: 'teammates' },
        { key: 'auto.components.settings.autoDelegation.search.lead', fallback: 'lead' }
      ])}
      className="space-y-3 py-2"
      id="experimental-auto-delegation"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>{titulo}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.AutoDelegationSetting.description',
              'When a task is worth splitting, the lead splits it and each part opens its own terminal with its own model. Off, nothing is delegated and nothing pops up asking. Turning it on makes one task open several agent sessions, so it spends more. The same switch is in the chat bar.'
            )}
          </p>
        </div>
        <Switch
          checked={prendida}
          aria-label={translate(
            'auto.components.settings.AutoDelegationSetting.toggleLabel',
            'Turn Intelligent Orchestration on or off'
          )}
          onCheckedChange={() => updateSettings({ autoDelegation: !prendida })}
        />
      </div>
    </SearchableSetting>
  )
}
