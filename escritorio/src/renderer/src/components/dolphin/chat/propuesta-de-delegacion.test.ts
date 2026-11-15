import { describe, expect, it } from 'vitest'
import { firmaDeLaPropuesta, propuestaDeDelegacion, tituloDeTarea } from './propuesta-de-delegacion'

/** A quién delegarle cada parte del plan que el líder acabó de dejar. */

const PLAN = `El plan, entonces:

1. Mover el cálculo del total a src/precios.ts — hoy lo hace la pantalla
2. Escribir el test del redondeo a dos decimales
3. Actualizar la doc de la API

¿Arranco?`

describe('qué conviene delegar', () => {
  it('del plan numerado saca una tarea por renglón, con su título y su pedido', () => {
    const propuesta = propuestaDeDelegacion(PLAN)
    expect(propuesta?.tareas.map((tarea) => tarea.id)).toEqual(['t1', 't2', 't3'])
    expect(propuesta?.tareas[0]).toEqual({
      id: 't1',
      titulo: 'Mover el cálculo del total a src/precios.ts',
      pedido: 'Mover el cálculo del total a src/precios.ts — hoy lo hace la pantalla'
    })
    expect(propuesta?.tareas[2]?.titulo).toBe('Actualizar la doc de la API')
  })

  it('también con viñetas y con casillas de to-do', () => {
    const propuesta = propuestaDeDelegacion(`Propongo esto:
- [ ] Arreglar el login que no vuelve
- [x] Sumar el test de sesión vencida
* Revisar los permisos del panel`)
    expect(propuesta?.tareas.map((tarea) => tarea.titulo)).toEqual([
      'Arreglar el login que no vuelve',
      'Sumar el test de sesión vencida',
      'Revisar los permisos del panel'
    ])
  })

  it('con numeradas y subpuntos, cada tarea aparece una sola vez', () => {
    // Tomar las dos listas duplicaba cada tarea: la numerada y su propio detalle.
    const propuesta = propuestaDeDelegacion(`El plan:
1. Arreglar el redondeo del total
   - mirar src/precios.ts
   - sumarle el test
2. Avisar en la pantalla cuando falla`)
    expect(propuesta?.tareas).toHaveLength(2)
    expect(propuesta?.tareas[1]?.pedido).toBe('Avisar en la pantalla cuando falla')
  })

  it('una lista adentro de un bloque de código es un ejemplo, no el plan', () => {
    expect(
      propuestaDeDelegacion(`Voy a hacer una sola cosa: cambiar el formato de la respuesta.

\`\`\`json
1. uno
2. dos
3. tres
\`\`\``)
    ).toBeNull()
  })

  it('sin anuncio de plan no se propone nada, aunque haya una lista', () => {
    // Un informe de lo que ya hizo: delegarlo sería volver a hacerlo.
    expect(
      propuestaDeDelegacion(`Listo, quedó así:
1. Moví el cálculo a src/precios.ts
2. Sumé el test del redondeo`)
    ).toBeNull()
  })

  it('con una sola tarea no hay a quién delegarle', () => {
    expect(
      propuestaDeDelegacion(`El plan es uno solo:
1. Arreglar el redondeo del total y sumarle el test`)
    ).toBeNull()
  })

  it('mientras el líder piensa no se propone nada', () => {
    expect(propuestaDeDelegacion(PLAN, { trabajando: true })).toBeNull()
  })

  it('un mensaje vacío o sin mensaje tampoco', () => {
    expect(propuestaDeDelegacion('')).toBeNull()
    expect(propuestaDeDelegacion(null)).toBeNull()
    expect(propuestaDeDelegacion(undefined)).toBeNull()
  })

  it('no manda más compañeros que el tope del plan del núcleo', () => {
    const diez = Array.from({ length: 10 }, (_, i) => `${i + 1}. Arreglar la pantalla ${i + 1}`)
    const propuesta = propuestaDeDelegacion(`El plan:\n${diez.join('\n')}`)
    expect(propuesta?.tareas).toHaveLength(8)
  })

  it('un renglón repetido no abre dos trabajos iguales', () => {
    const propuesta = propuestaDeDelegacion(`El plan:
1. Arreglar el redondeo del total
2. Arreglar el redondeo del total
3. Avisar en la pantalla cuando falla`)
    expect(propuesta?.tareas).toHaveLength(2)
  })

  it('las negritas y las comillas de código no viajan al pedido', () => {
    const propuesta = propuestaDeDelegacion(`El plan:
1. Tocar \`src/precios.ts\` **sin** romper el total
2. Sumarle el test del redondeo`)
    expect(propuesta?.tareas[0]?.pedido).toBe('Tocar src/precios.ts sin romper el total')
  })

  it('un nombre con guion bajo sigue entero: no es marcado', () => {
    const propuesta = propuestaDeDelegacion(`El plan:
1. Leer file_path desde el bloque de la herramienta
2. Sumarle el test del caso vacío`)
    expect(propuesta?.tareas[0]?.pedido).toContain('file_path')
  })
})

describe('el título de una tarea', () => {
  it('corta donde empieza el detalle', () => {
    expect(tituloDeTarea('Mover el total a precios.ts: hoy lo hace la pantalla')).toBe(
      'Mover el total a precios.ts'
    )
    expect(tituloDeTarea('Arreglar el login. Vuelve a la home sin avisar')).toBe(
      'Arreglar el login'
    )
  })

  it('un renglón largo sin detalle se corta en una palabra entera', () => {
    const largo = `Revisar ${'una cosa más '.repeat(12)}y listo`
    const titulo = tituloDeTarea(largo)
    expect(titulo.length).toBeLessThanOrEqual(73)
    expect(titulo.endsWith('…')).toBe(true)
    expect(titulo).not.toContain('  ')
  })
})

describe('la firma de la propuesta', () => {
  it('el mismo plan da la misma firma, y otro plan otra', () => {
    const primera = propuestaDeDelegacion(PLAN)
    const segunda = propuestaDeDelegacion(PLAN)
    expect(primera && segunda && firmaDeLaPropuesta(primera)).toBe(
      segunda && firmaDeLaPropuesta(segunda)
    )
    const otra = propuestaDeDelegacion(`El plan:
1. Borrar la pantalla vieja
2. Avisar a los que la usaban`)
    expect(otra && firmaDeLaPropuesta(otra)).not.toBe(primera && firmaDeLaPropuesta(primera))
  })
})
