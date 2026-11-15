import { marcaDeModelo, partirEnInsignias } from './insignias'

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

/** La propiedad de hast que lleva la clase; sale como `data-insignia` en el HTML. */
export const PROPIEDAD_INSIGNIA = 'dataInsignia'

/** De quién es el modelo nombrado; sale como `data-marca` y el CSS le pone el logo delante. */
export const PROPIEDAD_MARCA = 'dataMarca'

/**
 * El hexadecimal de un color; sale como `data-color` y el componente le dibuja la muestra.
 *
 * Viaja como atributo y no como `style` porque el sanitizador del chat deja pasar atributos, no
 * estilos: el color lo pinta React, que lo vuelve a validar antes de ponerlo.
 */
export const PROPIEDAD_COLOR = 'dataColor'

function partir(texto: string): Nodo[] {
  const trozos = partirEnInsignias(texto)
  if (trozos.every((trozo) => trozo.tipo === 'texto')) {
    return [{ type: 'text', value: texto }]
  }
  return trozos.map((trozo) =>
    trozo.tipo === 'texto'
      ? { type: 'text', value: trozo.valor }
      : {
          type: 'dolphinInsignia',
          children: [{ type: 'text', value: trozo.valor }],
          data: {
            hName: 'span',
            hProperties: {
              [PROPIEDAD_INSIGNIA]: trozo.clase,
              // Nombrar a Claude, a Gemini o a GPT trae su logo (pedido de Nico, 30/10).
              ...(trozo.clase === 'modelo'
                ? { [PROPIEDAD_MARCA]: marcaDeModelo(trozo.valor) }
                : {}),
              ...(trozo.clase === 'color' ? { [PROPIEDAD_COLOR]: trozo.valor } : {})
            }
          }
        }
  )
}

function recorrer(padre: Nodo): void {
  if (!padre.children || NO_SE_TOCA.has(padre.type)) {
    return
  }
  padre.children = padre.children.flatMap((hijo) => {
    if (hijo.type === 'text' && typeof hijo.value === 'string') {
      return partir(hijo.value)
    }
    recorrer(hijo)
    return [hijo]
  })
}

/** Plugin de remark: los datos del texto del agente salen como `<span data-insignia="…">`. */
export function remarkDolphinInsignias(): (tree: Nodo) => void {
  return (tree) => recorrer(tree)
}
