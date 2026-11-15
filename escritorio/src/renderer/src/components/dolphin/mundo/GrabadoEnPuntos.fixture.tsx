import { defineFixture } from '../../../component-fixtures/component-fixture'
import { esperarGrabados } from './esperar-grabado'
import { GrabadoEnPuntos, type GrabadoCongelado } from './GrabadoEnPuntos'

/**
 * El grabado suelto, congelado en un instante. `pnpm fixtures:shot "dolphin/mundo/*" --theme both`.
 */
const instante = (congelado: GrabadoCongelado, { ancho = 1240, alto = 280 } = {}) =>
  defineFixture({
    width: ancho,
    interact: (cuadro) => esperarGrabados(cuadro),
    render: () => (
      <div className="relative w-full" style={{ height: alto }}>
        <GrabadoEnPuntos congelado={congelado} />
      </div>
    )
  })

/** A mitad del dibujo: lo hondo ya está, la superficie todavía no. */
export const dibujandose = instante({ progreso: 0.45, ms: 400 })
/** Quieto, entero. */
export const entero = instante({ progreso: 1, ms: 2000 })
/** Con el catalejo abierto en el medio. */
export const catalejo = instante({ progreso: 1, ms: 2000, lente: { x: 1010, y: 120, radio: 76 } })
/**
 * Los altos que puede tomar la franja (va de 300 px a un 58 % del área): la ola entera, sin
 * estirarse, y nunca más ancha que el 62 % del ancho.
 */
export const alto300 = instante({ progreso: 1, ms: 2000 }, { alto: 300 })
export const alto420 = instante({ progreso: 1, ms: 2000 }, { alto: 420 })
export const alto560 = instante({ progreso: 1, ms: 2000 }, { alto: 560 })
export const angosto = instante({ progreso: 1, ms: 2000 }, { ancho: 700, alto: 300 })
