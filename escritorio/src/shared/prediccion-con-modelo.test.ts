import { describe, expect, it } from 'vitest'
import {
  MAXIMO_DE_LA_SUGERENCIA,
  promptDePrediccion,
  sugerenciaDeLaRespuesta,
  valeLaPenaPreguntar
} from './prediccion-con-modelo'

/**
 * Lo que se le manda al modelo y lo que se acepta de vuelta.
 *
 * Esto se inserta en el archivo de alguien con UNA tecla, así que lo que se descarta importa más
 * que lo que se acepta: una respuesta de media función, o una que repite lo que ya estaba escrito,
 * no es una sugerencia floja — es un archivo roto que nadie leyó antes de aceptar.
 */

const contexto = { antes: 'const total = ', despues: ';\n' }

describe('lo que se le pide al modelo', () => {
  it('dice que la respuesta se inserta tal cual y cómo decir que no hay nada', () => {
    const p = promptDePrediccion({ antes: 'const a = ', despues: ';', rutaDelArchivo: 'x.ts' })
    expect(p).toContain('se inserta TAL CUAL')
    expect(p).toContain('NADA')
    expect(p).toContain('x.ts')
  })

  it('lleva lo último que se escribió cuando se sabe: es la pista más fuerte', () => {
    const con = promptDePrediccion({
      antes: 'a',
      despues: '',
      rutaDelArchivo: 'x.ts',
      ultimaEdicion: 'renombró precio a monto'
    })
    expect(con).toContain('renombró precio a monto')
    expect(promptDePrediccion({ antes: 'a', despues: '', rutaDelArchivo: 'x.ts' })).not.toContain(
      'Lo último que escribió'
    )
  })
})

describe('lo que se acepta de vuelta', () => {
  it('toma el código y le saca las cercas', () => {
    expect(sugerenciaDeLaRespuesta('```ts\nprecio + envio\n```', contexto)).toBe('precio + envio')
  })

  it('un «NADA» es una respuesta válida y no una sugerencia', () => {
    expect(sugerenciaDeLaRespuesta('NADA', contexto)).toBeUndefined()
    expect(sugerenciaDeLaRespuesta('nada.', contexto)).toBeUndefined()
    expect(sugerenciaDeLaRespuesta('   ', contexto)).toBeUndefined()
  })

  it('descarta entera una respuesta demasiado larga en vez de recortarla', () => {
    const larga = 'x'.repeat(MAXIMO_DE_LA_SUGERENCIA + 1)
    expect(sugerenciaDeLaRespuesta(larga, contexto)).toBeUndefined()
  })

  it('descarta una respuesta de demasiadas líneas: media función pegada es peor que nada', () => {
    expect(sugerenciaDeLaRespuesta('a\nb\nc\nd\ne\nf\ng\nh\ni', contexto)).toBeUndefined()
  })

  it('no duplica lo que ya está escrito después del cursor', () => {
    // El cursor está en «const total = » y a la derecha ya hay un «;».
    expect(sugerenciaDeLaRespuesta('precio + envio;', contexto)).toBe('precio + envio')
  })

  it('si lo único que contestó ya estaba escrito, no hay sugerencia', () => {
    expect(sugerenciaDeLaRespuesta(';', contexto)).toBeUndefined()
  })
})

describe('cuándo vale la pena gastar en preguntar', () => {
  const base = {
    lineaHastaElCursor: 'const total = ',
    alFinalDeLaLinea: true,
    caracteresDesdeLaUltima: 4
  }

  it('sí cuando hay algo escrito, el cursor está al final y se escribió desde la última', () => {
    expect(valeLaPenaPreguntar(base)).toBe(true)
  })

  it('no en el medio de una línea: lo que falta ya está escrito a la derecha', () => {
    expect(valeLaPenaPreguntar({ ...base, alFinalDeLaLinea: false })).toBe(false)
  })

  it('no con una línea casi vacía: lo que vuelva sería inventado', () => {
    expect(valeLaPenaPreguntar({ ...base, lineaHastaElCursor: '  c' })).toBe(false)
    expect(valeLaPenaPreguntar({ ...base, lineaHastaElCursor: '   ' })).toBe(false)
  })

  it('no si no se escribió nada nuevo: la respuesta sería la de recién', () => {
    expect(valeLaPenaPreguntar({ ...base, caracteresDesdeLaUltima: 0 })).toBe(false)
  })
})
