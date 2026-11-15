import { describe, expect, it } from 'vitest'
import { comoSeOfrece, sugerenciaDeRespuesta } from './sugerencia-de-respuesta'

/** Lo que vas a contestar, escrito antes de que lo escribas, y aceptado con Tab. */

describe('qué conviene contestarle al agente', () => {
  it('a una pregunta de sí o no, se ofrece seguir adelante', () => {
    expect(sugerenciaDeRespuesta('Encontré el bug en el redondeo. ¿Lo arreglo?')).toEqual({
      texto: 'go ahead',
      motivo: 'pregunta'
    })
    expect(sugerenciaDeRespuesta('Can I go ahead with the refactor?')?.texto).toBe('go ahead')
  })

  it('las palabras con tilde se reconocen igual que las demás', () => {
    // El `\b` de JavaScript parte las palabras acentuadas, así que estas reglas no matcheaban
    // nunca y solo andaban las inglesas.
    expect(sugerenciaDeRespuesta('Ya lo dejé commiteado.')?.motivo).toBe('termino')
    expect(sugerenciaDeRespuesta('Falló el typecheck.')?.motivo).toBe('fallo')
    expect(sugerenciaDeRespuesta('Terminé con eso.')?.motivo).toBe('termino')
    expect(sugerenciaDeRespuesta('Quedó andando.')?.motivo).toBe('termino')
    expect(sugerenciaDeRespuesta('¿Continúo con lo que falta?')?.motivo).toBe('pregunta')
    // Y una palabra que apenas empieza igual no cuenta.
    expect(sugerenciaDeRespuesta('Estoy revisando los listados de precios.')).toBeNull()
  })

  it('cuando cuenta lo que va a hacer, se ofrece arrancarlo', () => {
    const s = sugerenciaDeRespuesta(
      'El plan es: primero los tipos, después la pantalla y al final los tests.'
    )
    expect(s).toEqual({ texto: 'start it', motivo: 'plan' })
  })

  it('cuando terminó, lo que uno quiere es ver qué cambió', () => {
    expect(sugerenciaDeRespuesta('Listo: quedó en la rama dolphin/u1 y pasó el portón.')).toEqual({
      texto: 'show me what you changed',
      motivo: 'termino'
    })
  })

  it('cuando algo falló, lo primero es saber qué pasó', () => {
    expect(sugerenciaDeRespuesta('No pude: falló el typecheck en dos archivos.')?.motivo).toBe(
      'fallo'
    )
  })

  it('una pregunta cualquiera también se contesta', () => {
    expect(sugerenciaDeRespuesta('¿De los dos caminos, cuál preferís?')?.motivo).toBe('pregunta')
  })

  it('mientras el agente escribe no se sugiere nada: lo que uno quiere ahí es leer', () => {
    expect(sugerenciaDeRespuesta('¿Lo arreglo?', { trabajando: true })).toBeNull()
  })

  it('con algo escrito tampoco: lo que estás escribiendo manda', () => {
    expect(sugerenciaDeRespuesta('¿Lo arreglo?', { borrador: 'no, mejor' })).toBeNull()
    // Espacios en blanco no son un borrador.
    expect(sugerenciaDeRespuesta('¿Lo arreglo?', { borrador: '   ' })).not.toBeNull()
  })

  it('un mensaje que no espera nada no sugiere nada', () => {
    expect(sugerenciaDeRespuesta('Estoy leyendo los archivos del módulo de pagos.')).toBeNull()
    expect(sugerenciaDeRespuesta('')).toBeNull()
    expect(sugerenciaDeRespuesta(null)).toBeNull()
  })

  it('una pregunta en el medio de un texto largo no cuenta: lo que importa es cómo termina', () => {
    const largo = `¿Por qué fallaba? ${'Porque el tope era muy corto. '.repeat(30)}Ya lo dejé arreglado y commiteado.`
    // Termina contando que terminó, no preguntando.
    expect(sugerenciaDeRespuesta(largo)?.motivo).toBe('termino')
  })

  it('se ofrece diciendo con qué se acepta', () => {
    expect(comoSeOfrece({ texto: 'go ahead', motivo: 'pregunta' })).toContain('go ahead')
    expect(comoSeOfrece({ texto: 'go ahead', motivo: 'pregunta' })).toContain('Tab')
  })
})
