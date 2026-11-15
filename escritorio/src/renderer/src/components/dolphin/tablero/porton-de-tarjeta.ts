import type {
  EstadoDeFaseDelPorton,
  FaseDelPortonDeTarjeta
} from '../../../../../shared/dolphin-tablero-types'
import type { SegmentoDeTira, TonoDeSegmento } from '../tira/TiraDeSegmentos'

const TONO_DE_FASE: Record<EstadoDeFaseDelPorton, TonoDeSegmento> = {
  paso: 'verde',
  fallo: 'rojo',
  salteada: 'gris',
  'sin-correr': 'hueso'
}

/**
 * La tira del portón de una tarjeta: un segmento por fase, en orden. `llenas` deja las primeras
 * con su resultado y el resto todavía sin correr (la tarjeta de ejemplo se va llenando así).
 */
export function segmentosDelPorton(
  fases: readonly FaseDelPortonDeTarjeta[],
  llenas = fases.length
): SegmentoDeTira[] {
  return fases.map((fase, indice) => {
    const estado: EstadoDeFaseDelPorton = indice < llenas ? fase.estado : 'sin-correr'
    return { tono: TONO_DE_FASE[estado], atenuado: estado === 'salteada', titulo: fase.fase }
  })
}

/** Lo mismo en cifras, para el texto que acompaña a la tira: cuántas pasaron y dónde rebotó. */
export function resumenDelPorton(
  fases: readonly FaseDelPortonDeTarjeta[],
  llenas = fases.length
): { pasaron: number; total: number; rebote: string | null } {
  const corridas = fases.slice(0, llenas)
  return {
    pasaron: corridas.filter((fase) => fase.estado === 'paso').length,
    total: fases.length,
    rebote: corridas.find((fase) => fase.estado === 'fallo')?.fase ?? null
  }
}
