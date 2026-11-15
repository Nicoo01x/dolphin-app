// Lo que importa acá no es que formatee: es que SIEMPRE guarde. Cada caso de abajo es una forma
// de que el formateador falle, y en todas el archivo tiene que terminar escrito.

import { describe, expect, it, vi } from 'vitest'
import {
  guardarConFormato,
  type AccionDeFormato,
  type EditorQueFormatea
} from './formatear-al-guardar'

/** Un editor de mentira cuyo formateador hace lo que diga el caso. */
function editorFalso(opciones: {
  readonly texto: string
  readonly accion?: AccionDeFormato | null
}): EditorQueFormatea {
  let texto = opciones.texto
  return {
    getValue: () => texto,
    getAction: () => {
      if (opciones.accion === undefined) {
        return {
          isSupported: () => true,
          run: async () => {
            texto = texto.trim()
          }
        }
      }
      return opciones.accion
    }
  }
}

describe('guardar con formato', () => {
  it('formatea y guarda lo que quedó después de formatear', async () => {
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({ texto: '  hola  ' }),
      formatearPrimero: true,
      guardar
    })
    expect(salida).toBe('formateado')
    expect(guardar).toHaveBeenCalledWith('hola')
  })

  it('apagado, guarda el texto tal cual y no toca el formateador', async () => {
    const run = vi.fn()
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({ texto: '  hola  ', accion: { isSupported: () => true, run } }),
      formatearPrimero: false,
      guardar
    })
    expect(salida).toBe('apagado')
    expect(run).not.toHaveBeenCalled()
    expect(guardar).toHaveBeenCalledWith('  hola  ')
  })

  it('sin servidor de lenguaje para ese archivo, guarda igual', async () => {
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({ texto: 'x', accion: { isSupported: () => false, run: vi.fn() } }),
      formatearPrimero: true,
      guardar
    })
    expect(salida).toBe('sin-formateador')
    expect(guardar).toHaveBeenCalledWith('x')
  })

  it('sin la acción registrada todavía, guarda igual', async () => {
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({ texto: 'x', accion: null }),
      formatearPrimero: true,
      guardar
    })
    expect(salida).toBe('sin-formateador')
    expect(guardar).toHaveBeenCalledWith('x')
  })

  it('si el formateador tira, guarda igual', async () => {
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({
        texto: 'x',
        accion: {
          isSupported: () => true,
          run: async () => {
            throw new Error('el servidor se cayó')
          }
        }
      }),
      formatearPrimero: true,
      guardar
    })
    expect(salida).toBe('falló')
    expect(guardar).toHaveBeenCalledWith('x')
  })

  it('si el formateador se cuelga, guarda al llegar al tope y no espera para siempre', async () => {
    const guardar = vi.fn()
    const salida = await guardarConFormato({
      editor: editorFalso({
        texto: 'x',
        accion: { isSupported: () => true, run: () => new Promise<void>(() => {}) }
      }),
      formatearPrimero: true,
      guardar,
      topeMs: 5,
      esperar: async () => {}
    })
    expect(salida).toBe('tardó')
    expect(guardar).toHaveBeenCalledWith('x')
  })

  it('guarda una sola vez, aunque el formateador conteste después del tope', async () => {
    const guardar = vi.fn()
    // En un objeto y no en un `let`: TypeScript estrecha a `never` una variable que sólo se
    // asigna dentro del ejecutor de una promesa, y después no deja llamarla.
    const tardio: { soltar: (() => void) | null } = { soltar: null }
    const salida = await guardarConFormato({
      editor: editorFalso({
        texto: 'x',
        accion: {
          isSupported: () => true,
          run: () =>
            new Promise<void>((listo) => {
              tardio.soltar = listo
            })
        }
      }),
      formatearPrimero: true,
      guardar,
      esperar: async () => {}
    })
    expect(salida).toBe('tardó')
    tardio.soltar?.()
    await Promise.resolve()
    expect(guardar).toHaveBeenCalledTimes(1)
  })
})
