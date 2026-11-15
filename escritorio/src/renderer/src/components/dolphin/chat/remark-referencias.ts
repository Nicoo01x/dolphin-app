import { referenciasEn, rotuloDe, type LoQueExiste } from './referencias'

/**
 * Plugin de remark que convierte lo que el agente nombra del proyecto en algo que se puede tocar.
 *
 * Un `#412`, un `PR #45`, un hash o el nombre de una rama salen como `<span data-ref="issue"
 * data-ref-id="412">`, y `ReferenciaViva` los dibuja como pastilla, con su tarjeta al pasar por
 * encima y su destino al tocarlos.
 *
 * Corre ANTES que el de las insignias: `#412` tiene que ser un issue, no el número 412 suelto.
 */

/** Lo mínimo de un nodo de mdast que el plugin mira; los demás campos viajan intactos. */
type Nodo = {
  type: string
  value?: string
  children?: Nodo[]
  data?: { hName?: string; hProperties?: Record<string, string> }
}

/** Adentro de esto el texto es del autor tal cual: código, enlaces y HTML no se tocan. */
const NO_SE_TOCA = new Set([
  'inlineCode',
  'code',
  'link',
  'linkReference',
  'html',
  'definition',
  'image',
  'imageReference'
])

export const PROPIEDAD_REF = 'dataRef'
export const PROPIEDAD_REF_ID = 'dataRefId'
/** Lo que se escribió, para que la tarjeta pueda mostrarlo si el rótulo se acortó. */
export const PROPIEDAD_REF_TEXTO = 'dataRefTexto'

function partir(texto: string, existe: LoQueExiste): Nodo[] {
  const hallazgos = referenciasEn(texto, existe)
  if (hallazgos.length === 0) {
    return [{ type: 'text', value: texto }]
  }
  const salida: Nodo[] = []
  let desde = 0
  for (const hallazgo of hallazgos) {
    if (hallazgo.desde > desde) {
      salida.push({ type: 'text', value: texto.slice(desde, hallazgo.desde) })
    }
    salida.push({
      type: 'dolphinReferencia',
      children: [{ type: 'text', value: rotuloDe(hallazgo) }],
      data: {
        hName: 'span',
        hProperties: {
          [PROPIEDAD_REF]: hallazgo.clase,
          [PROPIEDAD_REF_ID]: hallazgo.id,
          [PROPIEDAD_REF_TEXTO]: hallazgo.texto
        }
      }
    })
    desde = hallazgo.hasta
  }
  if (desde < texto.length) {
    salida.push({ type: 'text', value: texto.slice(desde) })
  }
  return salida
}

function recorrer(padre: Nodo, existe: LoQueExiste): void {
  if (!padre.children || NO_SE_TOCA.has(padre.type)) {
    return
  }
  padre.children = padre.children.flatMap((hijo) => {
    if (hijo.type === 'text' && typeof hijo.value === 'string') {
      return partir(hijo.value, existe)
    }
    recorrer(hijo, existe)
    return [hijo]
  })
}

/**
 * El plugin, atado al repo que se está mirando.
 *
 * Sin `ramas` no se marca ninguna rama, que es lo correcto: marcar algo que al tocarlo no lleva
 * a ningún lado es peor que dejarlo como texto.
 */
export function remarkDolphinReferencias(existe: LoQueExiste = {}) {
  return () => (tree: Nodo) => recorrer(tree, existe)
}
