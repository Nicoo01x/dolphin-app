import sierra from '../../../assets/fondos/sierra.webp'
import merced from '../../../assets/fondos/merced.webp'
import desfiladero from '../../../assets/fondos/desfiladero.webp'
import andes from '../../../assets/fondos/andes.webp'
import lago from '../../../assets/fondos/lago.webp'
import meandro from '../../../assets/fondos/meandro.webp'
import delaware from '../../../assets/fondos/delaware.webp'
import {
  FONDO_INCLUIDO_DE_FABRICA,
  type FondoIncluidoId
} from '../../../../../shared/fondo-del-chat'

/**
 * Los óleos que vienen con Dolphin. Origen y licencia de cada uno: `assets/fondos/FUENTE.md`.
 *
 * El nombre es el de la obra en castellano y corto, porque es lo que se lee abajo de la miniatura;
 * el artista va en el título de la miniatura para quien quiera saber de quién es.
 */
export type FondoIncluido = {
  readonly id: FondoIncluidoId
  readonly url: string
  readonly obra: string
  readonly artista: string
  readonly anio: number
}

export const FONDOS_INCLUIDOS: readonly FondoIncluido[] = [
  { id: 'sierra', url: sierra, obra: 'Sierra Nevada', artista: 'Albert Bierstadt', anio: 1868 },
  { id: 'merced', url: merced, obra: 'Río Merced', artista: 'Albert Bierstadt', anio: 1866 },
  {
    id: 'desfiladero',
    url: desfiladero,
    obra: 'Desfiladero',
    artista: 'Sanford Robinson Gifford',
    anio: 1862
  },
  { id: 'andes', url: andes, obra: 'Los Andes', artista: 'Frederic Edwin Church', anio: 1859 },
  { id: 'lago', url: lago, obra: 'Lago George', artista: 'John Frederick Kensett', anio: 1869 },
  { id: 'meandro', url: meandro, obra: 'El meandro', artista: 'Thomas Cole', anio: 1836 },
  { id: 'delaware', url: delaware, obra: 'Delaware', artista: 'George Inness', anio: 1861 }
]

export function fondoIncluido(id: string | undefined): FondoIncluido {
  return (
    FONDOS_INCLUIDOS.find((fondo) => fondo.id === id) ??
    FONDOS_INCLUIDOS.find((fondo) => fondo.id === FONDO_INCLUIDO_DE_FABRICA)!
  )
}
