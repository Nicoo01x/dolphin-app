import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { PerillasDelTema } from '../../../../shared/tema-de-la-interfaz'
import { tokensDelTemaElegido } from '../../../../shared/tema-de-la-interfaz-settings'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { ColorField, NumberField, SettingsSwitchRow } from './form-controls/SettingsFormControls'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { getInterfaceThemeEntries } from './appearance-interface-theme-search'

/**
 * Los de fábrica son los de la piel de Dolphin (assets/piel-dolphin.css): prender las perillas sin
 * tocar nada tiene que dejar la app como estaba, no saltar a otra paleta. Sin acento de color: el
 * acento es la tinta. Contraste 0 porque es lo que más se acerca a los tonos de la piel —con 0 el
 * motor da el flotante en #1e1e1e y la barra en #151515, que es el panel—.
 */
const defaults: Record<'claro' | 'oscuro', PerillasDelTema> = {
  claro: { acento: '#181818', superficie: '#fcfcfc', tinta: '#181818', contraste: 0 },
  oscuro: { acento: '#f0f0f0', superficie: '#101010', tinta: '#f0f0f0', contraste: 0 }
}

/**
 * Qué hace cada perilla, dicho en términos de lo que se ve y no del token que mueve.
 *
 * Son tres colores y no dieciocho a propósito: de estos tres el motor deriva los dieciocho tokens
 * de la cáscara. Elegir dieciocho colores a mano no da un tema, da un tema roto.
 */
const ETIQUETAS = {
  acento: { titulo: 'Accent', ayuda: 'Buttons, links and anything the app wants you to notice.' },
  superficie: { titulo: 'Surface', ayuda: 'The background everything else sits on.' },
  tinta: { titulo: 'Ink', ayuda: 'Text. It is nudged until it stays readable on the surface.' }
} as const

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisiblePrimary?: boolean
}

export function AppearanceInterfaceThemeSection({
  settings,
  updateSettings,
  forceVisiblePrimary
}: Props): React.JSX.Element {
  const entry = getInterfaceThemeEntries()[0]
  const theme = settings.temaPropio
  const active = !!theme && theme.activo !== false
  function change(scheme: 'claro' | 'oscuro', updates: Partial<PerillasDelTema>): void {
    updateSettings({
      temaPropio: {
        ...theme,
        activo: active,
        [scheme]: { ...(theme?.[scheme] ?? defaults[scheme]), ...updates }
      }
    })
  }
  return (
    <SearchableSetting id={entry.targetSectionId} {...entry} forceVisible={forceVisiblePrimary}>
      <div className="divide-y divide-border/40">
        <SettingsSwitchRow
          label={entry.title}
          description={entry.description}
          checked={active}
          onChange={() =>
            updateSettings({
              temaPropio: {
                claro: defaults.claro,
                oscuro: defaults.oscuro,
                ...theme,
                activo: !active
              }
            })
          }
        />
        {(['claro', 'oscuro'] as const).map((scheme) => {
          const knobs = theme?.[scheme] ?? defaults[scheme]
          return (
            <fieldset key={scheme} className="min-w-0 py-3">
              <legend className="text-sm font-semibold">
                {scheme === 'claro'
                  ? translate('settings.appearance.interfaceTheme.light', 'Light theme')
                  : translate('settings.appearance.interfaceTheme.dark', 'Dark theme')}
              </legend>
              {(['acento', 'superficie', 'tinta'] as const).map((key) => (
                <ColorField
                  key={key}
                  label={translate(
                    `settings.appearance.interfaceTheme.${key}`,
                    ETIQUETAS[key].titulo
                  )}
                  description={translate(
                    `settings.appearance.interfaceTheme.${key}Help`,
                    ETIQUETAS[key].ayuda
                  )}
                  value={knobs[key]}
                  fallback={defaults[scheme][key]}
                  onChange={(value) => change(scheme, { [key]: value })}
                />
              ))}
              <NumberField
                label={translate('settings.appearance.interfaceTheme.contrast', 'Contrast')}
                description={translate(
                  'settings.appearance.interfaceTheme.contrastHelp',
                  'How far the surfaces step apart from each other, from flat to stark.'
                )}
                value={knobs.contraste}
                min={0}
                max={100}
                integer
                onChange={(contraste) => change(scheme, { contraste })}
              />
              {active && theme?.[scheme] && !tokensDelTemaElegido(theme, scheme === 'oscuro') ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {translate(
                    'settings.appearance.interfaceTheme.invalid',
                    'Enter valid hex colors to apply this theme.'
                  )}
                </p>
              ) : null}
            </fieldset>
          )
        })}
        <div className="py-3">
          {/* Vuelve los colores a los de fábrica SIN apagar la función: apagarla ya es lo que
              hace el interruptor de arriba, y dos controles para lo mismo dejan a la persona
              sin forma de deshacer un color que tocó de más. */}
          <Button
            variant="outline"
            size="sm"
            disabled={!theme?.claro && !theme?.oscuro}
            onClick={() =>
              updateSettings({
                temaPropio: { activo: active, claro: defaults.claro, oscuro: defaults.oscuro }
              })
            }
          >
            {translate('settings.appearance.interfaceTheme.reset', 'Reset the colors')}
          </Button>
        </div>
      </div>
    </SearchableSetting>
  )
}
