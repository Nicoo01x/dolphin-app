import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_TRANSCRIPT_COLUMN_CLASS,
  NATIVE_CHAT_TRANSCRIPT_TEXT_INSET
} from './appearance/native-chat-appearance-style'

/**
 * La conversación y el compositor tienen que empezar en la misma vertical.
 *
 * Sus columnas son las dos `max-w-(--chat-content-max-width)` centradas en el mismo panel, así que
 * las cajas coinciden solas: lo único que puede desalinear el texto es el sangrado de adentro. El
 * del compositor no es un número sino una suma de tres piezas, y por eso se desacopló sin que nadie
 * lo notara.
 *
 * Medido con la app corriendo: la conversación arrancaba 12,7px a la izquierda del renglón que se
 * escribe. Y no alcanza con un número fijo, porque en el chat `--spacing` se deriva del tamaño de
 * letra: con 17px de letra el sangrado es 18px, con 14px es 15px.
 *
 * Esta prueba vuelve a hacer la cuenta leyendo las dos fuentes. No comprueba que se vea lindo:
 * comprueba que las dos mitades del chat sigan de acuerdo cuando alguien toque una de ellas.
 */

// La base (11/11) movió el compositor a composer/editor/ y la hoja a appearance/.
const COMPOSITOR = readFileSync(
  join(__dirname, 'composer', 'editor', 'NativeChatComposerField.tsx'),
  'utf8'
)
const HOJA = readFileSync(join(__dirname, 'appearance', 'native-chat-appearance.css'), 'utf8')

/** Las clases del compositor que suman el sangrado, en unidades de `--spacing`. */
const PIEZAS = [
  { clase: 'p-1.5', unidades: 1.5, que: 'el relleno del marco' },
  { clase: 'px-2', unidades: 2, que: 'el relleno del campo de texto' }
] as const

/** El divisor con el que el chat deriva `--spacing` del tamaño de letra. */
const DIVISOR = 3.5

describe('la conversación arranca donde arranca el compositor', () => {
  it.each(PIEZAS)('el compositor todavía tiene $que ($clase)', ({ clase }) => {
    expect(
      COMPOSITOR.includes(clase),
      `NativeChatComposerField ya no usa "${clase}". Si cambió su sangrado, rehacé la cuenta en ` +
        'NATIVE_CHAT_TRANSCRIPT_TEXT_INSET.'
    ).toBe(true)
  })

  it('el marco del compositor sigue teniendo su borde de 1px', () => {
    // La base separó el ancho del borde (`rounded-xl border p-1.5`) de su color, que ahora depende de
    // si el compositor está lanzando.
    expect(COMPOSITOR).toContain('rounded-xl border p-1.5')
    expect(COMPOSITOR).toContain('border-chat-composer-border')
  })

  /** Lo que hace que la fórmula sea exacta y no una aproximación. */
  it('el chat deriva su espaciado del tamaño de letra con el mismo divisor', () => {
    expect(HOJA).toContain(`--spacing: calc(var(--chat-ui-size) / ${DIVISOR})`)
  })

  it('las piezas del compositor suman justo un tamaño de letra', () => {
    const unidades = PIEZAS.reduce((total, pieza) => total + pieza.unidades, 0)
    expect(unidades).toBe(DIVISOR)
  })

  it('el sangrado declarado es el borde más un tamaño de letra', () => {
    expect(NATIVE_CHAT_TRANSCRIPT_TEXT_INSET).toBe('calc(1px+var(--chat-ui-size))')
  })

  it('la columna de la conversación usa ese sangrado', () => {
    expect(NATIVE_CHAT_TRANSCRIPT_COLUMN_CLASS).toContain(
      `px-[${NATIVE_CHAT_TRANSCRIPT_TEXT_INSET}]`
    )
  })

  // Si alguna de las dos dejara de centrarse con el mismo ancho, las cajas no coincidirían y el
  // sangrado no alcanzaría para alinearlas.
  it('las dos columnas se centran con el mismo ancho', () => {
    expect(NATIVE_CHAT_TRANSCRIPT_COLUMN_CLASS).toContain('mx-auto')
    expect(NATIVE_CHAT_TRANSCRIPT_COLUMN_CLASS).toContain('max-w-(--chat-content-max-width)')
    // La base partió la clase: `relative w-full` siempre y el centrado sólo fuera del lanzador.
    expect(COMPOSITOR).toContain("'relative w-full'")
    expect(COMPOSITOR).toContain("'mx-auto max-w-(--chat-content-max-width)'")
  })
})
