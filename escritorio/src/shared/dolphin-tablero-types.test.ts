import { describe, expect, it } from 'vitest'
import {
  agruparPorColumna,
  comoTarjetaDelTablero,
  hayTarjetas,
  sePuedeEmpezar,
  textoParaElPrompt,
  type TarjetaDelTablero
} from './dolphin-tablero-types'

const tarjeta = (parcial: Partial<TarjetaDelTablero>): TarjetaDelTablero => ({
  id: 'a',
  titulo: 'Algo',
  columna: 'ideas',
  tipo: 'tarea',
  movida: '2026-10-29T00:00:00.000Z',
  ...parcial
})

describe('comoTarjetaDelTablero', () => {
  it('lee una tarjeta como la deja el núcleo', () => {
    expect(
      comoTarjetaDelTablero({
        id: 't1',
        titulo: 'Traer la bandeja',
        tipo: 'idea',
        columna: 'ideas',
        creada: '2026-10-29T01:59:22.323Z',
        movida: '2026-10-30T01:59:22.323Z',
        comentarios: [],
        historial: []
      })
    ).toEqual({
      id: 't1',
      titulo: 'Traer la bandeja',
      tipo: 'idea',
      columna: 'ideas',
      movida: '2026-10-30T01:59:22.323Z'
    })
  })

  it('usa la fecha de creación si falta la de movimiento y el tipo por defecto es tarea', () => {
    expect(
      comoTarjetaDelTablero({ id: 't', titulo: 'X', columna: 'hecho', creada: '2026-01-01' })
    ).toMatchObject({ tipo: 'tarea', movida: '2026-01-01' })
  })

  it('conserva quién la toma y su rama', () => {
    expect(
      comoTarjetaDelTablero({
        id: 't',
        titulo: 'X',
        columna: 'haciendo',
        quien: 'agentes',
        rama: 'dolphin/x'
      })
    ).toMatchObject({ quien: 'agentes', rama: 'dolphin/x' })
  })

  it('lee la última pasada del portón de su rama y descarta las fases que no entiende', () => {
    expect(
      comoTarjetaDelTablero({
        id: 't',
        titulo: 'X',
        columna: 'para-revisar',
        rama: 'dolphin/x',
        porton: [
          { fase: 'tipos', estado: 'paso' },
          { fase: 'test', estado: 'fallo' },
          { fase: 'lint', estado: 'quien-sabe' },
          { estado: 'paso' },
          { fase: 'build', estado: 'sin-correr' }
        ]
      })?.porton
    ).toEqual([
      { fase: 'tipos', estado: 'paso' },
      { fase: 'test', estado: 'fallo' },
      { fase: 'build', estado: 'sin-correr' }
    ])
  })

  it('sin rama no hay portón que mostrar, aunque el archivo traiga uno', () => {
    expect(
      comoTarjetaDelTablero({
        id: 't',
        titulo: 'X',
        columna: 'ideas',
        porton: [{ fase: 'tipos', estado: 'paso' }]
      })
    ).not.toHaveProperty('porton')
  })

  it.each([null, 'texto', 3, {}, { id: 't', titulo: '  ', columna: 'ideas' }])(
    'descarta lo que no es una tarjeta (%j)',
    (dato) => {
      expect(comoTarjetaDelTablero(dato)).toBeUndefined()
    }
  )

  it('descarta una columna que no existe', () => {
    expect(comoTarjetaDelTablero({ id: 't', titulo: 'X', columna: 'archivo' })).toBeUndefined()
  })
})

describe('agruparPorColumna', () => {
  it('devuelve siempre las cinco columnas en su orden, aunque estén vacías', () => {
    expect(agruparPorColumna([]).map((c) => c.columna)).toEqual([
      'ideas',
      'para-hacer',
      'haciendo',
      'para-revisar',
      'hecho'
    ])
  })

  it('reparte cada tarjeta en su columna con lo más nuevo arriba', () => {
    const vieja = tarjeta({ id: 'v', columna: 'haciendo', movida: '2026-01-01' })
    const nueva = tarjeta({ id: 'n', columna: 'haciendo', movida: '2026-02-01' })
    const hecha = tarjeta({ id: 'h', columna: 'hecho' })
    const columnas = agruparPorColumna([vieja, hecha, nueva])
    expect(columnas.find((c) => c.columna === 'haciendo')?.tarjetas.map((t) => t.id)).toEqual([
      'n',
      'v'
    ])
    expect(columnas.find((c) => c.columna === 'hecho')?.tarjetas).toHaveLength(1)
    expect(columnas.find((c) => c.columna === 'ideas')?.tarjetas).toEqual([])
  })

  it('no modifica la lista que recibe', () => {
    const entrada = [tarjeta({ id: '1' }), tarjeta({ id: '2', movida: '2027-01-01' })]
    const copia = [...entrada]
    agruparPorColumna(entrada)
    expect(entrada).toEqual(copia)
  })
})

describe('hayTarjetas', () => {
  it('es falso mientras se lee, sin tablero o con el tablero vacío', () => {
    expect(hayTarjetas(null)).toBe(false)
    expect(hayTarjetas({ ok: false })).toBe(false)
    expect(hayTarjetas({ ok: true, tarjetas: [] })).toBe(false)
  })

  it('es verdadero con al menos una tarjeta', () => {
    expect(hayTarjetas({ ok: true, tarjetas: [tarjeta({})] })).toBe(true)
  })
})

describe('detalle y pedido para el prompt', () => {
  const base = {
    id: 'a',
    titulo: 'Sumar filtros',
    columna: 'ideas',
    creada: '2026-10-29T00:00:00Z'
  }

  it('lee el detalle si la tarjeta lo trae y lo omite si viene vacío', () => {
    expect(comoTarjetaDelTablero({ ...base, detalle: 'Por rama y por persona' })?.detalle).toBe(
      'Por rama y por persona'
    )
    expect(comoTarjetaDelTablero({ ...base, detalle: '   ' })).not.toHaveProperty('detalle')
  })

  it('arma el texto con el título solo, o con el detalle en otro párrafo', () => {
    expect(textoParaElPrompt(tarjeta({ titulo: 'Sumar filtros' }))).toBe('Sumar filtros')
    expect(textoParaElPrompt(tarjeta({ titulo: 'Sumar filtros', detalle: 'Por rama' }))).toBe(
      'Sumar filtros\n\nPor rama'
    )
  })

  it('sólo las columnas sin empezar se pueden tomar', () => {
    expect(sePuedeEmpezar(tarjeta({ columna: 'ideas' }))).toBe(true)
    expect(sePuedeEmpezar(tarjeta({ columna: 'para-hacer' }))).toBe(true)
    for (const columna of ['haciendo', 'para-revisar', 'hecho'] as const) {
      expect(sePuedeEmpezar(tarjeta({ columna }))).toBe(false)
    }
  })
})
