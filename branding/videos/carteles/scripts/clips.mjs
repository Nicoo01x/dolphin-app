/**
 * Los clips de los carteles, declarados una vez: los renderiza `render.mjs` y los reparte
 * `publicar.mjs`.
 *
 * `id` es el mismo que el de la `<Composition>` en src/Root.tsx y el que nombra el catálogo de
 * carteles de la app (escritorio/src/shared/carteles-de-funcion.ts). `poster` es el cuadro que se
 * ve antes de que el video arranque, así que tiene que ser uno donde ya se entienda el clip: en una
 * delegación, uno con las tres terminales abiertas y no el primero, que está casi vacío.
 */
export const CLIPS = [
  {
    id: 'delegacion',
    poster: 245
  },
  {
    // El mismo clip para el panel del aviso de función, que es casi cuadrado. Arranca 55 cuadros
    // más adelante que el ancho, así que su poster es el mismo momento corrido esos cuadros.
    id: 'delegacion-panel',
    poster: 190
  },
  {
    // Los dos permisos a la par. El poster es después de que la de la izquierda preguntó y la de
    // la derecha terminó: ahí la imagen quieta ya cuenta las dos consecuencias.
    id: 'permisos',
    poster: 230
  },
  {
    // El mismo, corrido los 70 cuadros con los que arranca el panel.
    id: 'permisos-panel',
    poster: 160
  },
  {
    // El portón. Después del cierre, no después del tercer escalón: ahí la imagen quieta tiene
    // las dos columnas resueltas —tres tildes de un lado, una cruz y el error del otro— Y la
    // línea que las explica. Con `preload="none"` en la web, el póster es lo que ve la mayoría.
    id: 'porton',
    poster: 285
  },
  {
    // El mismo, corrido los 62 cuadros con los que arranca el panel.
    id: 'porton-panel',
    poster: 223
  }
]
