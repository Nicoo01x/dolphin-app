import { RefreshCw } from 'lucide-react'
import type { Translate } from '@/i18n/use-translate'
import type { Aviso } from './cola-de-avisos'
import { BotonDeAviso, CuerpoDelAviso } from './PiezasDelAviso'

function tituloDeSkills(t: Translate, cuantas: number): string {
  return cuantas === 1
    ? t(
        'auto.components.skills.SkillFreshnessNudge.titleOne',
        'An installed Dolphin skill is out of date'
      )
    : t(
        'auto.components.skills.SkillFreshnessNudge.title',
        '{{count}} installed Dolphin skills are out of date',
        { count: cuantas, defaultValue_one: '{{count}} installed Dolphin skill is out of date' }
      )
}

/**
 * Las skills de Dolphin instaladas que quedaron viejas. Pide una acción, así que va después de la
 * interfaz de chat y antes de cualquier preferencia. Qué se nombra y cuándo se vuelve a ofrecer lo
 * sigue decidiendo `SkillFreshnessNudge`; acá sólo se dibuja. La × (o arrastrarla) es la misma
 * «no me lo muestres» que tenía el toast: vuelve con la próxima versión de las skills.
 */
export function avisoDeSkills({
  id,
  cuantas,
  nombres,
  alActualizar,
  alDescartar
}: {
  readonly id: string
  readonly cuantas: number
  /** Los nombres de las skills, tal cual: no se traducen. */
  readonly nombres: string
  readonly alActualizar: () => void
  readonly alDescartar: () => void
}): Aviso {
  return {
    id,
    importancia: 'accion',
    titulo: (t) => tituloDeSkills(t, cuantas),
    alDescartar,
    contenido: ({ responder, descartar }, t) => (
      <CuerpoDelAviso
        titulo={tituloDeSkills(t, cuantas)}
        onAhoraNo={descartar}
        botones={
          <BotonDeAviso principal onClick={() => responder(alActualizar)}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {cuantas === 1
              ? t('auto.components.skills.SkillFreshnessNudge.updateOne', 'Update skill')
              : t('auto.components.skills.SkillFreshnessNudge.updateMany', 'Update skills')}
          </BotonDeAviso>
        }
      >
        {t(
          'auto.components.skills.SkillFreshnessNudge.description',
          'Update {{value0}} so agents follow the current instructions for this version of Dolphin.',
          { value0: nombres }
        )}
      </CuerpoDelAviso>
    )
  }
}
