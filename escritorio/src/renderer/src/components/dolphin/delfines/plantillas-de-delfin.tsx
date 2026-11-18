import { Newspaper, PenLine, Radar, Telescope, type LucideIcon } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { PlantillaDeDelfin } from '../../../../../shared/delfines-types'

/**
 * Las cuatro plantillas del núcleo (`src/bots/plantillas.ts`), con el ícono y las palabras con que
 * se ofrecen. Lo que hace cada una lo decide el núcleo; acá sólo se nombra.
 */
export const ICONO_DE_PLANTILLA: Record<PlantillaDeDelfin, LucideIcon> = {
  vigia: Radar,
  parte: Newspaper,
  investigador: Telescope,
  escritor: PenLine
}

export function nombreDePlantilla(plantilla: PlantillaDeDelfin): string {
  switch (plantilla) {
    case 'vigia':
      return translate('delfines.plantilla.vigia.nombre', 'Lookout')
    case 'parte':
      return translate('delfines.plantilla.parte.nombre', 'Daily report')
    case 'investigador':
      return translate('delfines.plantilla.investigador.nombre', 'Researcher')
    case 'escritor':
      return translate('delfines.plantilla.escritor.nombre', 'Writer')
  }
}

/** Una línea: qué hace y cada cuánto. */
export function queHacePlantilla(plantilla: PlantillaDeDelfin): string {
  switch (plantilla) {
    case 'vigia':
      return translate(
        'delfines.plantilla.vigia.que',
        'Watches a repo every 30 minutes and only speaks up when something breaks'
      )
    case 'parte':
      return translate(
        'delfines.plantilla.parte.que',
        'Every morning at 8, what happened yesterday in your repos'
      )
    case 'investigador':
      return translate(
        'delfines.plantilla.investigador.que',
        'Looks things up when you ask, with sources'
      )
    case 'escritor':
      return translate(
        'delfines.plantilla.escritor.que',
        'Writes a piece every day and leaves it in its folder'
      )
  }
}

/** El nombre que se le propone al bot nuevo: el de la plantilla, en el idioma de la app. */
export function nombreSugerido(plantilla: PlantillaDeDelfin): string {
  switch (plantilla) {
    case 'vigia':
      return translate('delfines.plantilla.vigia.sugerido', 'Lookout')
    case 'parte':
      return translate('delfines.plantilla.parte.sugerido', 'Report')
    case 'investigador':
      return translate('delfines.plantilla.investigador.sugerido', 'Researcher')
    case 'escritor':
      return translate('delfines.plantilla.escritor.sugerido', 'Writer')
  }
}
