import { describe, expect, it } from 'vitest'
import { textoDeDuracion, textoDeEdad, textosDelTiempoDeCheck } from './check-timing-text'

const seg = (n: number): number => n * 1000
const min = (n: number): number => n * 60_000
const hora = (n: number): number => n * 3_600_000

describe('cómo se escribe lo que tardó un check', () => {
  it('abajo del minuto, segundos sueltos', () => {
    expect(textoDeDuracion(seg(45), 'en')).toBe('45s')
    expect(textoDeDuracion(900, 'en')).toBe('0s')
  })

  it('minutos con sus segundos, y sin ellos cuando son cero', () => {
    expect(textoDeDuracion(min(3) + seg(12), 'en')).toBe('3m 12s')
    expect(textoDeDuracion(min(3), 'en')).toBe('3m')
  })

  it('de una hora para arriba, horas y minutos', () => {
    expect(textoDeDuracion(hora(2) + min(5), 'en')).toBe('2h 5m')
    expect(textoDeDuracion(hora(2), 'en')).toBe('2h')
  })

  it('redondea para abajo: 1m 59s no son dos minutos', () => {
    expect(textoDeDuracion(min(1) + seg(59), 'en')).toBe('1m 59s')
  })

  it('escribe las unidades en el idioma de la app', () => {
    // No son las mismas letras en todos lados; por eso sale de Intl y no de un literal.
    expect(textoDeDuracion(min(3) + seg(12), 'es')).toBe('3min 12s')
  })
})

describe('cómo se escribe hace cuánto terminó', () => {
  it('no cuenta segundos abajo del minuto', () => {
    // Why: contar segundos haría que la fila cambie cada vez que la mirás, y lo que importa es
    // si el resultado es de ahora o de hace rato.
    expect(textoDeEdad(seg(5), 'en')).toBe(textoDeEdad(seg(50), 'en'))
  })

  it('pasa de minutos a horas y a días', () => {
    expect(textoDeEdad(min(9), 'en')).toBe('9 min. ago')
    expect(textoDeEdad(hora(2) + min(30), 'en')).toBe('2 hr. ago')
    expect(textoDeEdad(hora(49), 'en')).toBe('2 days ago')
  })

  it('en francés dice «hace», no un signo menos suelto', () => {
    // El narrow de CLDR da `-2 h` en francés, que no se lee como una antigüedad. Por eso el
    // formato es `short` aunque en inglés sea un carácter más largo.
    // Se mira el principio y no la cadena entera: CLDR mete un espacio fino antes de la unidad.
    expect(textoDeEdad(hora(2), 'fr').startsWith('il y a 2')).toBe(true)
  })
})

describe('las dos piezas de la fila', () => {
  it('da las dos cuando el check terminó', () => {
    expect(textosDelTiempoDeCheck({ duracionMs: min(3), desdeElFinalMs: hora(2) }, 'en')).toEqual({
      duracion: '3m',
      edad: '2 hr. ago'
    })
  })

  it('mientras corre da sólo la duración', () => {
    expect(textosDelTiempoDeCheck({ duracionMs: min(12), desdeElFinalMs: null }, 'en')).toEqual({
      duracion: '12m',
      edad: null
    })
  })

  it('sin principio da sólo el «hace»', () => {
    expect(textosDelTiempoDeCheck({ duracionMs: null, desdeElFinalMs: min(4) }, 'en')).toEqual({
      duracion: null,
      edad: '4 min. ago'
    })
  })
})
