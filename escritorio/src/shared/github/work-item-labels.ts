/**
 * Los nombres y los colores de las etiquetas de un issue o un PR.
 *
 * GitHub manda cada etiqueta como `{ name, color }` con el color en hex sin `#`, y hasta el
 * 08/11/2026 el normalizador se quedaba sólo con el nombre: en pantalla todas salían grises
 * y dos etiquetas distintas se veían iguales. Acá se leen las dos cosas del mismo objeto.
 */

/** Hex de 6 dígitos sin `#`, que es como GitHub escribe el color de una etiqueta. */
const HEX_DE_ETIQUETA = /^[0-9a-fA-F]{6}$/

function nombreDeEtiqueta(label: unknown): string {
  if (typeof label === 'string') {
    return label
  }
  if (typeof label === 'object' && label !== null && 'name' in label) {
    return String((label as { name?: unknown }).name ?? '')
  }
  return ''
}

function colorDeEtiqueta(label: unknown): string | null {
  if (typeof label !== 'object' || label === null || !('color' in label)) {
    return null
  }
  const crudo = (label as { color?: unknown }).color
  if (typeof crudo !== 'string') {
    return null
  }
  const limpio = crudo.trim().replace(/^#/, '')
  return HEX_DE_ETIQUETA.test(limpio) ? limpio.toLowerCase() : null
}

/** Los nombres, en orden y sin los vacíos. */
export function workItemLabelNames(labels: unknown): string[] {
  return Array.isArray(labels) ? labels.map(nombreDeEtiqueta).filter(Boolean) : []
}

/**
 * `{ labelColors }` con lo que se pudo leer, u `{}` cuando no hay ningún color.
 *
 * Why devolver el objeto para esparcir y no el mapa: así una respuesta sin colores —la de
 * `gh pr view`, por ejemplo— no agrega un `labelColors: {}` vacío a cada fila guardada.
 */
export function workItemLabelColors(labels: unknown): { labelColors?: Record<string, string> } {
  if (!Array.isArray(labels)) {
    return {}
  }
  const colores: Record<string, string> = {}
  for (const label of labels) {
    const nombre = nombreDeEtiqueta(label)
    const color = colorDeEtiqueta(label)
    if (nombre && color) {
      colores[nombre] = color
    }
  }
  return Object.keys(colores).length > 0 ? { labelColors: colores } : {}
}

/**
 * Cómo pintar la pastilla de una etiqueta: el color de GitHub de fondo y el texto en negro o
 * en blanco, el que se lea.
 *
 * Why calcular la luminancia y no usar siempre blanco: GitHub tiene etiquetas amarillo flúor
 * (`fbca04`) y blanco sobre eso no se lee. El umbral y la fórmula son los de la W3C para
 * luminancia relativa, que es lo que usa GitHub.
 */
export function workItemLabelChipStyle(
  color: string | undefined
): { backgroundColor: string; color: string; borderColor: string } | null {
  if (!color || !HEX_DE_ETIQUETA.test(color.replace(/^#/, ''))) {
    return null
  }
  const hex = color.replace(/^#/, '').toLowerCase()
  const canal = (desde: number): number => {
    const v = Number.parseInt(hex.slice(desde, desde + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminancia = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
  return {
    backgroundColor: `#${hex}`,
    color: luminancia > 0.179 ? '#000000' : '#ffffff',
    // Un borde del mismo color apenas oscurecido: separa la pastilla de un fondo parecido.
    borderColor: `color-mix(in srgb, #${hex} 80%, #000000)`
  }
}
