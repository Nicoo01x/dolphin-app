import type React from 'react'
import { DOLPHIN_USA_LA_NUBE_DE_DOLPHIN } from '../../../../../shared/dolphin-brand'
import { SearchableSetting } from '../section-layout/SearchableSetting'

/**
 * Un ajuste que sólo existe con la nube de DOLPHIN, como el botón de DOLPHIN Mobile: esa es la app
 * de celular de DOLPHIN, no de Dolphin (ver DOLPHIN_USA_LA_NUBE_DE_DOLPHIN).
 *
 * Why un componente en lugar de un condicional en la sección de la base: cambia sólo el nombre de la
 * etiqueta y lo de adentro queda idéntico al de la base.
 */
export function SearchableSettingConNubeDeDolphin(
  props: React.ComponentProps<typeof SearchableSetting>
): React.JSX.Element | null {
  return DOLPHIN_USA_LA_NUBE_DE_DOLPHIN ? <SearchableSetting {...props} /> : null
}
