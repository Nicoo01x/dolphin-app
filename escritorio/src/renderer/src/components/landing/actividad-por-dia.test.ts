// El calendario del mapa de actividad: dónde arranca la semana, qué columna lleva el nombre del
// mes, y por qué un día que todavía no pasó no es un día sin nada.

import { describe, expect, it } from 'vitest'
import { claveDelDia, mapaDeActividad } from './actividad-por-dia'

/** Miércoles 12 de noviembre de 2026, a media tarde en hora local. */
const MIERCOLES = new Date(2026, 10, 12, 15, 30).getTime()

function dia(aaaa: number, mes: number, d: number, hora = 10): number {
  return new Date(aaaa, mes, d, hora).getTime()
}

describe('el mapa de actividad', () => {
  it('arranca las columnas en lunes y termina en el dia pedido', () => {
    const mapa = mapaDeActividad([], { hasta: MIERCOLES, semanas: 2 })
    expect(mapa.semanas).toHaveLength(2)
    // La ultima columna es la semana de hoy: lunes 9, martes 10, miercoles 11... y 12 es jueves.
    const ultima = mapa.semanas[1]
    expect(ultima?.[0]?.fecha).toBe('2026-11-09')
    expect(ultima?.[3]?.fecha).toBe('2026-11-12')
  })

  it('los dias que todavia no pasaron quedan en null, no en cero', () => {
    const mapa = mapaDeActividad([], { hasta: MIERCOLES, semanas: 1 })
    const semana = mapa.semanas[0]
    // Jueves 12 es el ultimo dia con casillero; viernes, sabado y domingo no existen todavia.
    expect(semana?.[3]).not.toBeNull()
    expect(semana?.[4]).toBeNull()
    expect(semana?.[6]).toBeNull()
  })

  it('cuenta por dia local y deja afuera lo que cae fuera del periodo', () => {
    const mapa = mapaDeActividad(
      [
        dia(2026, 10, 12, 1),
        dia(2026, 10, 12, 23),
        dia(2026, 10, 11),
        // Muy anterior al periodo de dos semanas: no entra.
        dia(2026, 8, 1)
      ],
      { hasta: MIERCOLES, semanas: 2 }
    )
    expect(mapa.total).toBe(3)
    const hoy = mapa.semanas[1]?.[3]
    expect(hoy).toMatchObject({ fecha: '2026-11-12', cuantas: 2 })
    expect(mapa.semanas[1]?.[2]).toMatchObject({ fecha: '2026-11-11', cuantas: 1 })
  })

  it('los escalones salen de los dias que tuvieron algo, no de un numero fijo', () => {
    // Dos por dia todos los dias: con un corte fijo todo saldria del mismo color y el mapa no
    // diria nada; por cuartiles, dos es el escalon de abajo y seis el de arriba.
    const parejo = [dia(2026, 10, 9), dia(2026, 10, 9), dia(2026, 10, 10), dia(2026, 10, 10)]
    const conUnPico = [...parejo, ...Array.from({ length: 6 }, () => dia(2026, 10, 11))]
    const mapa = mapaDeActividad(conUnPico, { hasta: MIERCOLES, semanas: 1 })
    const [lunes, martes, miercoles] = [
      mapa.semanas[0]?.[0],
      mapa.semanas[0]?.[1],
      mapa.semanas[0]?.[2]
    ]
    expect(lunes?.nivel).toBe(1)
    expect(martes?.nivel).toBe(1)
    expect(miercoles?.nivel).toBe(4)
    // Un dia sin nada es nivel 0 y no entra en los cuartiles.
    expect(mapa.semanas[0]?.[3]?.nivel).toBe(0)
  })

  it('cada mes se etiqueta una sola vez, en la columna donde aparece', () => {
    const mapa = mapaDeActividad([], { hasta: MIERCOLES, semanas: 10, locale: 'es' })
    const etiquetas = mapa.meses.map((mes) => mes.etiqueta)
    expect(etiquetas.length).toBe(new Set(mapa.meses.map((mes) => mes.semana)).size)
    // Diez semanas hacia atrás desde noviembre tocan septiembre, octubre y noviembre.
    expect(etiquetas.length).toBeGreaterThanOrEqual(3)
    expect(mapa.meses[0]?.semana).toBe(0)
    // Las columnas van en orden y no se repiten.
    const columnas = mapa.meses.map((mes) => mes.semana)
    expect([...columnas].sort((a, b) => a - b)).toEqual(columnas)
  })

  it('la clave de un dia es su fecha local, sin saltar por la zona horaria', () => {
    expect(claveDelDia(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(claveDelDia(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})
