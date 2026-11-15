import { translate } from '@/i18n/i18n'
import type { FaseDelPortonDeTarjeta } from '../../../../../shared/dolphin-tablero-types'
import { TiraDeSegmentos } from '../tira/TiraDeSegmentos'
import { resumenDelPorton, segmentosDelPorton } from './porton-de-tarjeta'

function textoDelPorton(fases: readonly FaseDelPortonDeTarjeta[], llenas?: number): string {
  const { pasaron, total, rebote } = resumenDelPorton(fases, llenas)
  if (rebote) {
    return translate('auto.components.dolphin.tablero.gateBounced', 'Gate: bounced at {{value0}}', {
      value0: rebote
    })
  }
  return translate(
    'auto.components.dolphin.tablero.gatePassed',
    'Gate: {{value0}} of {{value1}} passed',
    {
      value0: pasaron,
      value1: total
    }
  )
}

/**
 * La tira del portón en una tarjeta del tablero: qué fases pasó su rama y dónde rebotó. El mismo
 * lenguaje que los checks de la tarjeta de GitHub. Para el lector y el puntero, la misma cuenta en
 * palabras.
 */
export function TiraDelPorton({
  fases,
  llenas,
  crece = true
}: {
  fases: readonly FaseDelPortonDeTarjeta[]
  /** Cuántas fases ya corrieron; por defecto, todas. */
  llenas?: number
  crece?: boolean
}): React.JSX.Element | null {
  if (fases.length === 0) {
    return null
  }
  const texto = textoDelPorton(fases, llenas)
  return (
    <span className="mt-2 block" title={texto} data-dolphin-tira-porton="">
      <TiraDeSegmentos segmentos={segmentosDelPorton(fases, llenas)} crece={crece} />
      <span className="sr-only">{texto}</span>
    </span>
  )
}
