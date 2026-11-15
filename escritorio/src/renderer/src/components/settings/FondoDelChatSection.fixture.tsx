import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { enCastellano } from '../../component-fixtures/en-castellano'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { FondoDelChatSection } from './FondoDelChatSection'

/**
 * Ajustes → Apariencia → «Fondo del chat». `pnpm fixtures:shot "settings/FondoDelChatSection:*" --theme both`.
 */
function Seccion({ inicial }: { inicial: Partial<GlobalSettings> }): React.JSX.Element {
  const [ajustes, setAjustes] = useState(inicial)
  return (
    <div className="p-6">
      <FondoDelChatSection
        settings={ajustes as GlobalSettings}
        updateSettings={(cambios) => setAjustes((antes) => ({ ...antes, ...cambios }))}
        forceVisiblePrimary
      />
    </div>
  )
}

export const deFabrica = defineFixture(
  enCastellano({ width: 900, render: () => <Seccion inicial={{}} /> })
)

export const ninguno = defineFixture(
  enCastellano({
    width: 900,
    render: () => (
      <Seccion
        inicial={{ fondoDelChat: { fuente: { tipo: 'ninguno' }, velo: 0.7, desenfoque: false } }}
      />
    )
  })
)
