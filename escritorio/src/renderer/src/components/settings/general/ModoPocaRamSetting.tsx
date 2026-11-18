import { useEffect, useState } from 'react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import {
  resolverModoPocaRam,
  resolverUmbralPocaRamGb,
  UMBRALES_POCA_RAM_GB,
  type EstadoDeMemoriaBaja,
  type ModoPocaRam
} from '../../../../../shared/modo-poca-ram'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { formatearMemoria, numeroDeGb } from '@/components/dolphin/memoria-baja/formato-de-memoria'
import { Label } from '../../ui/label'
import { SettingsSegmentedControl } from '../form-controls/SettingsFormControls'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsGroup } from '../section-layout/SettingsGroup'
import { matchesSettingsSearch } from '../search/settings-search'
import {
  descripcionModoPocaRam,
  getGeneralMemoriaBajaSearchEntries,
  SECCION_MODO_POCA_RAM,
  tituloModoPocaRam
} from './general-memoria-baja-search'

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  query: string
}

const REFRESCO_MS = 5_000

/** Cuánto hay libre ahora, leído del mismo vigía que decide el aviso. Sólo mientras se ve. */
function useMemoriaAhora(): EstadoDeMemoriaBaja | null {
  const [estado, setEstado] = useState<EstadoDeMemoriaBaja | null>(null)
  useEffect(() => {
    const api = window.api?.memoriaBaja
    if (!api) {
      return
    }
    let vivo = true
    const leer = (): void => {
      void api
        .estado()
        .then((siguiente) => {
          if (vivo) {
            setEstado(siguiente)
          }
        })
        .catch(() => undefined)
    }
    leer()
    const reloj = window.setInterval(leer, REFRESCO_MS)
    return () => {
      vivo = false
      window.clearInterval(reloj)
    }
  }, [])
  return estado
}

function LineaDeAhora({
  estado
}: {
  readonly estado: EstadoDeMemoriaBaja | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const locale = useIntlLocale()
  if (estado?.disponible == null || estado.total == null) {
    return null
  }
  const texto = t('memoriaBaja.ajuste.ahora', 'Now: {{libre}} free of {{total}}', {
    libre: formatearMemoria(estado.disponible, locale),
    total: formatearMemoria(estado.total, locale)
  })
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {estado.activo ? `${texto} · ${t('memoriaBaja.ajuste.activo', 'low RAM mode on')}` : texto}
    </p>
  )
}

/**
 * El modo poca RAM, en General: automático (salta solo bajo el umbral), siempre o apagado, y el
 * umbral cuando es automático. El cartel de poca RAM trae acá con «no avisar más».
 */
export function ModoPocaRamSetting({
  settings,
  updateSettings,
  query
}: Props): React.JSX.Element | null {
  const t = useTranslate()
  const locale = useIntlLocale()
  const estado = useMemoriaAhora()
  if (!matchesSettingsSearch(query, getGeneralMemoriaBajaSearchEntries())) {
    return null
  }
  const modo = resolverModoPocaRam(settings.modoPocaRam)
  const umbral = resolverUmbralPocaRamGb(settings.umbralPocaRamGb)
  const titulo = tituloModoPocaRam()
  return (
    <SettingsGroup title={t('memoriaBaja.ajuste.grupo', 'Memory')}>
      <SearchableSetting
        id={SECCION_MODO_POCA_RAM}
        title={titulo}
        description={descripcionModoPocaRam()}
        forceVisible
        className="flex items-center justify-between gap-4 py-3"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label>{titulo}</Label>
          <p className="text-xs text-muted-foreground">{descripcionModoPocaRam()}</p>
          <LineaDeAhora estado={estado} />
        </div>
        <SettingsSegmentedControl<ModoPocaRam>
          ariaLabel={titulo}
          value={modo}
          onChange={(siguiente) => updateSettings({ modoPocaRam: siguiente })}
          options={[
            { value: 'automatico', label: t('memoriaBaja.ajuste.automatico', 'Automatic') },
            { value: 'siempre', label: t('memoriaBaja.ajuste.siempre', 'Always on') },
            { value: 'apagado', label: t('memoriaBaja.ajuste.apagado', 'Off') }
          ]}
        />
      </SearchableSetting>
      {modo === 'automatico' ? (
        <SearchableSetting
          title={t('memoriaBaja.ajuste.umbral', 'Warn below')}
          forceVisible
          className="flex items-center justify-between gap-4 py-3"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Label>{t('memoriaBaja.ajuste.umbral', 'Warn below')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('memoriaBaja.ajuste.umbralDescripcion', 'Free memory that sets off the warning.')}
            </p>
          </div>
          <SettingsSegmentedControl<number>
            ariaLabel={t('memoriaBaja.ajuste.umbral', 'Warn below')}
            value={umbral}
            onChange={(siguiente) => updateSettings({ umbralPocaRamGb: siguiente })}
            options={UMBRALES_POCA_RAM_GB.map((gb) => ({
              value: gb,
              label: t('memoriaBaja.ajuste.gb', '{{gb}} GB', { gb: numeroDeGb(gb, locale) })
            }))}
          />
        </SearchableSetting>
      ) : null}
    </SettingsGroup>
  )
}
