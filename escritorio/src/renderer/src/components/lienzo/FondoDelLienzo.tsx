// El fondo del escritorio: «Siphonophorae», lámina 17 de Kunstformen der Natur (Ernst Haeckel,
// 1904), dominio público. Una colonia de bichos que trabajan juntos como si fueran uno, que es
// bastante exactamente lo que hace Dolphin.
import fondoDelLienzo from '../../assets/lienzo-sifonoforos.webp'
import type { ViewportTransform } from './canvas'

/**
 * El fondo del lienzo: un CUADRO a plena vista, no una textura.
 *
 * Las capas y sus números salen de medir Deska con CDP el 01/11 (informe en el scratchpad,
 * `deska-rea/`), que es la referencia que eligió Nico:
 *
 * 1. La lámina, `cover`, centrada, **opacidad 1** y desbordada 48 px para que el paneo nunca
 *    descubra el borde.
 * 2. Un velo de apenas **0,12**. Acá estaba el error que hacía que «no se pareciera a Deska»:
 *    el velo estaba en 0,8 y tapaba el cuadro entero, así que el escritorio era un fondo gris.
 * 3. La retícula de puntos, celda de 24 px en coordenadas del mundo, que es lo que hace que el
 *    plano se lea como un lienzo infinito y no como una foto.
 * 4. Una viñeta que apaga los bordes, para que lo que se lea sean las ventanas del medio.
 *
 * La lámina va **invertida**, y eso no es un efecto: es lo que la vuelve un cuadro oscuro. Deska
 * usa una foto de atardecer, que ya es oscura; la nuestra es un grabado sobre papel blanco, y con
 * el mismo tratamiento la pantalla quedaba casi en blanco. Invertida, el papel se vuelve el fondo
 * y las líneas quedan claras, que es como se vio siempre esta lámina en Dolphin. El azul lo ponen
 * el `sepia` y el `hue-rotate`: sin eso el gris del grabado se lee sucio sobre el negro neutro.
 */
export function FondoDelLienzo({ vista }: { vista: ViewportTransform }): React.JSX.Element {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute -inset-12 bg-cover bg-center"
        style={{
          backgroundImage: `url(${fondoDelLienzo})`,
          filter:
            'invert(1) grayscale(1) brightness(0.42) contrast(1.15) sepia(0.5) hue-rotate(175deg) saturate(1.4)'
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/[0.12]" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.046) 1px, rgba(0,0,0,0) 1px)',
          // Los puntos se acercan con el plano: si quedaran fijos, esto no se sentiría un lienzo
          // infinito, se sentiría una foto con puntitos encima.
          backgroundSize: `${24 * vista.zoom}px ${24 * vista.zoom}px`,
          backgroundPosition: `${vista.x}px ${vista.y}px`
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 45%, rgba(0,0,0,0) 38%, color-mix(in srgb, var(--color-lienzo-fondo) 70%, transparent) 100%)'
        }}
      />
    </>
  )
}
