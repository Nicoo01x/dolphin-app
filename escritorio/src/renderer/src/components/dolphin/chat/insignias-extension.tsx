import type { CommentMarkdownExtension } from '@/components/sidebar/CommentMarkdown'
import {
  PROPIEDAD_COLOR,
  PROPIEDAD_INSIGNIA,
  PROPIEDAD_MARCA,
  remarkDolphinInsignias
} from './remark-insignias'
import {
  PROPIEDAD_REF,
  PROPIEDAD_REF_ID,
  PROPIEDAD_REF_TEXTO,
  remarkDolphinReferencias
} from './remark-referencias'
import { ReferenciaViva } from './ReferenciaViva'
import type { ClaseDeReferencia } from './referencias'
import './insignias.css'
import './referencias.css'

/** Los `data-*` que el sanitizador tiene que dejar pasar; sin esto el span sale pelado. */
const ATRIBUTOS = [
  PROPIEDAD_INSIGNIA,
  PROPIEDAD_MARCA,
  PROPIEDAD_COLOR,
  PROPIEDAD_REF,
  PROPIEDAD_REF_ID,
  PROPIEDAD_REF_TEXTO
]

/**
 * Un hexadecimal de CSS y nada más.
 *
 * El valor sale de un patrón que ya exige esta forma, pero esto es lo que termina adentro de un
 * `style`: se vuelve a comprobar acá, donde se usa, y no se confía en que el de arriba no cambie.
 */
const HEXADECIMAL = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * El `span` del markdown del chat.
 *
 * Es uno solo para los dos sistemas: react-markdown mapea por etiqueta, no por atributo. Si el
 * span trae `data-ref` es una referencia viva y la dibuja `ReferenciaViva`; cualquier otro —las
 * insignias de color, que son CSS puro— pasa derecho sin componente en el medio.
 */
function SpanDelChat({
  children,
  node: _node,
  ...resto
}: React.ComponentPropsWithoutRef<'span'> & { node?: unknown }): React.JSX.Element {
  // Why el cast: react-markdown tipa las props como las de un `<span>`, y los `data-*` que les
  // agrega el plugin de remark no están en `HTMLAttributes`.
  const datos = resto as Record<string, string | undefined>
  const clase = datos['data-ref'] as ClaseDeReferencia | undefined
  const id = datos['data-ref-id']
  const texto = datos['data-ref-texto']
  if (clase && id) {
    return (
      <ReferenciaViva clase={clase} id={id} texto={texto ?? id}>
        {children}
      </ReferenciaViva>
    )
  }
  // Un color se ve o no se ve: `#CFFF2E` no dice nada hasta que lo pegás en algún lado, así que
  // la insignia lleva la muestra adelante (pedido de Nico, 07/11).
  const color = datos['data-color']
  if (color && HEXADECIMAL.test(color)) {
    return (
      <span {...resto}>
        <i aria-hidden="true" className="insignia-muestra" style={{ background: color }} />
        {children}
      </span>
    )
  }
  return <span {...resto}>{children}</span>
}

/**
 * Las insignias de color y las referencias vivas, como extensión del markdown del chat.
 *
 * El orden de los plugins importa: las referencias primero, porque `#412` tiene que salir como
 * issue y no como el número 412 suelto.
 */
export const EXTENSION_INSIGNIAS: CommentMarkdownExtension = {
  remarkPlugins: [remarkDolphinReferencias(), remarkDolphinInsignias],
  sanitizeAttributes: { span: ATRIBUTOS },
  components: { span: SpanDelChat }
}

/**
 * Suma las insignias y las referencias a la extensión que ya tenga el texto (los visuales del
 * chat estructurado).
 *
 * Llamarla dentro de un useMemo: un objeto nuevo en cada render reconstruye los componentes.
 *
 * `ramas` son las del repo que se está mirando: sin esa lista no se marca ninguna rama, porque
 * `feat/algo` y `src/algo` se escriben igual y solo una lleva a algún lado.
 */
export function conInsignias(
  base: CommentMarkdownExtension | undefined,
  ramas?: readonly string[]
): CommentMarkdownExtension {
  const referencias = remarkDolphinReferencias(ramas ? { ramas } : {})
  if (!base) {
    return { ...EXTENSION_INSIGNIAS, remarkPlugins: [referencias, remarkDolphinInsignias] }
  }
  return {
    remarkPlugins: [...base.remarkPlugins, referencias, remarkDolphinInsignias],
    sanitizeAttributes: {
      ...base.sanitizeAttributes,
      span: [...(base.sanitizeAttributes.span ?? []), ...ATRIBUTOS]
    },
    components: { ...base.components, span: SpanDelChat }
  }
}
