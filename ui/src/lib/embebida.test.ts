import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('dolphinNuevaTarea', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { location: { search: '?embebida=1' } })
  })

  it('guarda la tarea hasta que Nueva se monta y luego llena el campo', async () => {
    const { dolphinNuevaTarea, registrarCampoNuevaTarea, tomarTareaNuevaPendiente } =
      await import('./embebida')
    dolphinNuevaTarea('Arreglar el issue\nissue nicoo01x/dolphin-app#1')
    const aplicar = vi.fn()

    expect(tomarTareaNuevaPendiente()).toBe('Arreglar el issue\nissue nicoo01x/dolphin-app#1')
    const limpiar = registrarCampoNuevaTarea(aplicar)
    dolphinNuevaTarea('Otra tarea')

    expect(aplicar).toHaveBeenCalledWith('Otra tarea')
    limpiar()
  })
})
