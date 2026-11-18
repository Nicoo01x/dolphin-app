import { describe, expect, it } from 'vitest'
import {
  EDICION_CERRADA,
  hayPedidoEnVuelo,
  pasoDeEdicion,
  type EstadoEdicion,
  type SucesoEdicion
} from './edicion-en-el-lugar-estado'

/**
 * Los errores de Cmd+K no están en el dibujo: están en el tiempo.
 *
 * El modelo tarda segundos y la persona sigue usando el editor. Casi todas estas pruebas son de
 * una sola cosa: que una respuesta que llega tarde no escriba nada.
 */

const TRAMO = { desde: 10, hasta: 20 }

const correr = (estado: EstadoEdicion, sucesos: SucesoEdicion[]) =>
  sucesos.reduce((acumulado, suceso) => pasoDeEdicion(acumulado.estado, suceso), {
    estado,
    efecto: { tipo: 'nada' }
  } as ReturnType<typeof pasoDeEdicion>)

const abierto = pasoDeEdicion(EDICION_CERRADA, { tipo: 'abrir', tramo: TRAMO, revision: 1 }).estado

describe('el camino que funciona', () => {
  it('abrir, escribir el pedido, esperar, y aceptar aplica una vez', () => {
    const mandado = pasoDeEdicion(abierto, { tipo: 'enviar', instruccion: 'que sume' })
    expect(mandado.estado.fase).toBe('esperando')
    expect(mandado.efecto).toEqual({
      tipo: 'pedirAlModelo',
      tramo: TRAMO,
      instruccion: 'que sume',
      revision: 1
    })

    const llegado = pasoDeEdicion(mandado.estado, { tipo: 'llego', codigo: 'a + b', revision: 1 })
    expect(llegado.estado).toMatchObject({ fase: 'propuesta', codigo: 'a + b' })
    expect(llegado.efecto.tipo).toBe('nada')

    const aceptado = pasoDeEdicion(llegado.estado, { tipo: 'aceptar' })
    expect(aceptado.efecto).toEqual({ tipo: 'aplicar', tramo: TRAMO, codigo: 'a + b' })
    expect(aceptado.estado).toEqual(EDICION_CERRADA)
  })

  it('un segundo aceptar no vuelve a aplicar', () => {
    const final = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'llego', codigo: 'a', revision: 1 },
      { tipo: 'aceptar' },
      { tipo: 'aceptar' }
    ])
    expect(final.efecto.tipo).toBe('nada')
  })
})

describe('una respuesta sin cambio', () => {
  const contestado = correr(abierto, [
    { tipo: 'enviar', instruccion: '¿para qué sirve?' },
    { tipo: 'contesto', texto: 'Arma el encabezado.', revision: 1 }
  ]).estado

  it('queda a la vista para leer, con lo que se preguntó', () => {
    expect(contestado).toMatchObject({
      fase: 'respuesta',
      instruccion: '¿para qué sirve?',
      texto: 'Arma el encabezado.'
    })
  })

  // Lo que no puede pasar nunca: que Aceptar escriba la explicación en el archivo.
  it('aceptar no aplica nada', () => {
    const paso = pasoDeEdicion(contestado, { tipo: 'aceptar' })
    expect(paso.efecto.tipo).toBe('nada')
    expect(paso.estado).toBe(contestado)
  })

  it('se puede seguir preguntando, y lo que se habló viaja con el pedido', () => {
    const paso = pasoDeEdicion(contestado, { tipo: 'enviar', instruccion: '¿y si es nulo?' })
    expect(paso.estado.fase).toBe('esperando')
    expect(paso.efecto).toEqual({
      tipo: 'pedirAlModelo',
      tramo: TRAMO,
      instruccion: '¿y si es nulo?',
      revision: 1,
      previa: { pedido: '¿para qué sirve?', respuesta: 'Arma el encabezado.' }
    })
  })

  it('una respuesta que llega tarde se tira igual que un reemplazo', () => {
    const esperando = correr(abierto, [{ tipo: 'enviar', instruccion: 'x' }]).estado
    expect(pasoDeEdicion(esperando, { tipo: 'contesto', texto: 't', revision: 9 }).estado).toBe(
      esperando
    )
  })
})

describe('lo que llega tarde no escribe nada', () => {
  it('una respuesta después de cancelar se tira', () => {
    const final = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'cancelar' },
      { tipo: 'llego', codigo: 'a', revision: 1 }
    ])
    expect(final.estado).toEqual(EDICION_CERRADA)
    expect(final.efecto.tipo).toBe('nada')
  })

  // La peor: el tramo se midió sobre el documento de antes. Aplicarlo borra otra cosa.
  it('una respuesta de una revisión vieja se tira', () => {
    const esperando = correr(abierto, [{ tipo: 'enviar', instruccion: 'x' }]).estado
    const tarde = pasoDeEdicion(esperando, { tipo: 'llego', codigo: 'a', revision: 0 })
    expect(tarde.efecto.tipo).toBe('nada')
    expect(tarde.estado.fase).toBe('esperando')
  })

  it('si el documento cambia mientras se espera, el pedido se cierra', () => {
    const final = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'documentoCambio', revision: 2 },
      { tipo: 'llego', codigo: 'a', revision: 1 }
    ])
    expect(final.estado).toEqual(EDICION_CERRADA)
    expect(final.efecto.tipo).toBe('nada')
  })

  it('un cambio que no mueve la revisión no cierra nada', () => {
    const final = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'documentoCambio', revision: 1 }
    ])
    expect(final.estado.fase).toBe('esperando')
  })
})

describe('los bordes', () => {
  it('un pedido vacío no se manda y el cuadrito queda abierto', () => {
    for (const instruccion of ['', '   ', '\n']) {
      const paso = pasoDeEdicion(abierto, { tipo: 'enviar', instruccion })
      expect(paso.efecto.tipo).toBe('nada')
      expect(paso.estado.fase).toBe('escribiendo')
    }
  })

  it('aceptar sin propuesta no hace nada', () => {
    expect(pasoDeEdicion(abierto, { tipo: 'aceptar' }).efecto.tipo).toBe('nada')
    expect(pasoDeEdicion(EDICION_CERRADA, { tipo: 'aceptar' }).efecto.tipo).toBe('nada')
  })

  it('una falla deja el cuadrito abierto diciendo por qué, con el pedido intacto', () => {
    const esperando = correr(abierto, [{ tipo: 'enviar', instruccion: 'x' }]).estado
    const paso = pasoDeEdicion(esperando, { tipo: 'fallo', motivo: 'sin plan', revision: 1 })
    // Cerrarlo en silencio dejaba a la persona apretando Cmd+K sin saber qué había pasado.
    expect(paso.estado).toEqual({
      fase: 'fallo',
      tramo: TRAMO,
      revision: 1,
      instruccion: 'x',
      motivo: 'sin plan'
    })
    expect(paso.efecto).toEqual({ tipo: 'nada' })
  })

  it('una falla que llega tarde no abre ningún cartel', () => {
    const esperando = correr(abierto, [{ tipo: 'enviar', instruccion: 'x' }]).estado
    // Otra revisión: el documento ya es otro, igual que con una respuesta buena que llega tarde.
    expect(pasoDeEdicion(esperando, { tipo: 'fallo', motivo: 'tarde', revision: 9 }).estado).toBe(
      esperando
    )

    const conPropuesta = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'llego', codigo: 'a', revision: 1 }
    ]).estado
    expect(
      pasoDeEdicion(conPropuesta, { tipo: 'fallo', motivo: 'tarde', revision: 1 }).estado
    ).toBe(conPropuesta)
  })

  it('un documento que cambia cierra también el cartel de la falla', () => {
    const fallado = correr(abierto, [
      { tipo: 'enviar', instruccion: 'x' },
      { tipo: 'fallo', motivo: 'sin plan', revision: 1 }
    ]).estado
    expect(pasoDeEdicion(fallado, { tipo: 'documentoCambio', revision: 2 }).estado).toEqual(
      EDICION_CERRADA
    )
  })

  it('abrir de nuevo reemplaza lo anterior', () => {
    const otro = { desde: 50, hasta: 60 }
    const paso = pasoDeEdicion(abierto, { tipo: 'abrir', tramo: otro, revision: 3 })
    expect(paso.estado).toEqual({ fase: 'escribiendo', tramo: otro, revision: 3 })
  })

  it('sabe cuándo hay algo en vuelo que cortar', () => {
    expect(hayPedidoEnVuelo(EDICION_CERRADA)).toBe(false)
    expect(hayPedidoEnVuelo(abierto)).toBe(false)
    expect(hayPedidoEnVuelo(correr(abierto, [{ tipo: 'enviar', instruccion: 'x' }]).estado)).toBe(
      true
    )
  })
})
