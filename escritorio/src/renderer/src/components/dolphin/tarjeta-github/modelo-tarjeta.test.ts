import { describe, expect, it } from 'vitest'
import {
  CELDAS_MAXIMAS,
  estadoDeRevision,
  estadoDeTarjeta,
  etiquetasDe,
  repartoDeCambios,
  revisoresDe,
  segmentosDeChecks,
  tiempoRelativo
} from './modelo-tarjeta'

describe('estadoDeTarjeta', () => {
  it('distingue los cuatro estados de un PR con su tono', () => {
    expect(estadoDeTarjeta({ type: 'pr', state: 'open' }, {})).toEqual({
      clave: 'abierto',
      tono: 'verde'
    })
    expect(estadoDeTarjeta({ type: 'pr', state: 'draft' }, {}).clave).toBe('borrador')
    expect(estadoDeTarjeta({ type: 'pr', state: 'merged' }, {}).tono).toBe('violeta')
    expect(estadoDeTarjeta({ type: 'pr', state: 'closed' }, {}).tono).toBe('rojo')
  })

  it('un issue cerrado dice por qué; sin motivo se lee como completado', () => {
    const cerrado = { type: 'issue', state: 'closed' } as const
    expect(estadoDeTarjeta(cerrado, { motivoDeCierre: 'no-planeado' })).toEqual({
      clave: 'no-planeado',
      tono: 'gris'
    })
    expect(estadoDeTarjeta(cerrado, {}).clave).toBe('completado')
    expect(estadoDeTarjeta({ type: 'issue', state: 'open' }, {}).tono).toBe('verde')
  })
})

describe('repartoDeCambios', () => {
  it('reparte en proporción y nunca deja invisible la parte chica', () => {
    expect(repartoDeCambios(300, 100)).toEqual({ agregadas: 0.75, quitadas: 0.25 })
    const chico = repartoDeCambios(1, 900)
    expect(chico?.agregadas).toBeGreaterThanOrEqual(0.06)
    expect(repartoDeCambios(10, 0)).toEqual({ agregadas: 1, quitadas: 0 })
  })

  it('sin números no hay barra; con ceros, una barra vacía', () => {
    expect(repartoDeCambios(undefined, undefined)).toBeNull()
    expect(repartoDeCambios(0, 0)).toEqual({ agregadas: 0, quitadas: 0 })
  })
})

describe('segmentosDeChecks', () => {
  const cuenta = (parcial: Partial<Record<string, number>>) => {
    const base = { pasaron: 0, fallaron: 0, corriendo: 0, pendientes: 0, omitidos: 0, ...parcial }
    return { ...base, total: Object.values(base).reduce((a, b) => a + b, 0) }
  }

  it('con pocos checks, una celda por check en el orden de la tira', () => {
    const segmentos = segmentosDeChecks(cuenta({ pasaron: 2, fallaron: 1 }))
    expect(segmentos.map((s) => s.clase)).toEqual(['pasaron', 'pasaron', 'fallaron'])
  })

  it('con muchos, una barra por clase con su peso', () => {
    const segmentos = segmentosDeChecks(cuenta({ pasaron: CELDAS_MAXIMAS, fallaron: 2 }))
    expect(segmentos).toEqual([
      { clase: 'pasaron', peso: CELDAS_MAXIMAS },
      { clase: 'fallaron', peso: 2 }
    ])
  })

  it('sin checks no hay tira', () => {
    expect(segmentosDeChecks(cuenta({}))).toEqual([])
  })
})

describe('revisores y revisión', () => {
  it('pone primero a quien ya revisó y no repite a nadie', () => {
    const revisores = revisoresDe(
      {
        reviewRequests: [
          { login: 'Ana', name: null, avatarUrl: '' },
          { login: 'beto', name: null, avatarUrl: 'b' }
        ]
      },
      { latestReviews: [{ login: 'ana', state: 'APPROVED', avatarUrl: null }] }
    )
    expect(revisores).toEqual([
      { login: 'ana', avatarUrl: null, estado: 'aprobo' },
      { login: 'beto', avatarUrl: 'b', estado: 'esperando' }
    ])
  })

  it('la decisión de GitHub manda; sin ella, alguien esperando es «esperando revisión»', () => {
    const abierto = { state: 'open', reviewDecision: undefined } as const
    expect(estadoDeRevision(abierto, { reviewDecision: 'APPROVED' }, [])).toBe('aprobado')
    expect(
      estadoDeRevision(abierto, {}, [{ login: 'a', avatarUrl: null, estado: 'esperando' }])
    ).toBe('esperando')
    expect(estadoDeRevision(abierto, {}, [])).toBeNull()
    expect(estadoDeRevision({ state: 'merged' }, { reviewDecision: 'APPROVED' }, [])).toBeNull()
  })
})

describe('etiquetasDe', () => {
  it('toma el color de GitHub sólo si es un hex válido', () => {
    expect(
      etiquetasDe({ labels: ['bug', 'raro'], labelColors: { bug: 'd73a4a', raro: 'url(x)' } })
    ).toEqual([
      { nombre: 'bug', color: '#d73a4a' },
      { nombre: 'raro', color: null }
    ])
  })
})

describe('tiempoRelativo', () => {
  const ahora = Date.parse('2026-11-11T12:00:00Z')

  // Se compara contra Intl mismo y no contra un texto fijo: cada versión de ICU abrevia distinto.
  const corto = (locale: string, valor: number, unidad: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(valor, unidad)

  it('en el idioma pedido, estilo corto y con la unidad más grande que entra', () => {
    expect(tiempoRelativo('2026-11-08T12:00:00Z', 'es', ahora)).toBe(corto('es', -3, 'day'))
    expect(tiempoRelativo('2026-11-08T12:00:00Z', 'es', ahora)).toMatch(/^hace 3/)
    expect(tiempoRelativo('2026-11-08T12:00:00Z', 'en', ahora)).toBe(corto('en', -3, 'day'))
    expect(tiempoRelativo('2026-11-11T10:00:00Z', 'en', ahora)).toBe(corto('en', -2, 'hour'))
    expect(tiempoRelativo('2026-10-21T12:00:00Z', 'en', ahora)).toBe(corto('en', -3, 'week'))
    expect(tiempoRelativo('2025-11-01T12:00:00Z', 'en', ahora)).toBe(corto('en', -1, 'year'))
    expect(tiempoRelativo('2026-11-11T11:59:50Z', 'en', ahora)).toBe(corto('en', 0, 'second'))
  })

  it('una fecha vacía o rota no se dibuja', () => {
    expect(tiempoRelativo('', 'es', ahora)).toBeNull()
    expect(tiempoRelativo('mañana', 'es', ahora)).toBeNull()
  })
})
