import { describe, expect, it } from 'vitest'
import { getAgentCatalog } from './agent-catalog/agent-catalog'
import { comandoDeInstalacion, paquetesDeInstalacion } from './agent-install-commands'

/**
 * Lo que ata esta tabla a la realidad.
 *
 * El comando que un paquete deja en el PATH tiene que ser el mismo con el que el catálogo detecta
 * al agente. Si se separan, el asistente instala algo y después sigue diciendo que el agente no
 * está: la persona aprieta el botón, espera, y queda igual que antes sin entender por qué.
 */

describe('los comandos de instalación', () => {
  const catalogo = getAgentCatalog()

  it('instalan el mismo binario con el que el catálogo detecta al agente', () => {
    for (const [agente, entrada] of paquetesDeInstalacion()) {
      const delCatalogo = catalogo.find((candidato) => candidato.id === agente)
      expect(delCatalogo, `${agente} no está en el catálogo`).toBeDefined()
      expect(entrada.comando, `${agente}: el paquete deja otro binario`).toBe(delCatalogo!.cmd)
    }
  })

  it('arma una línea de npm con el paquete', () => {
    expect(comandoDeInstalacion('claude')).toBe('npm install -g @anthropic-ai/claude-code')
  })

  it('un agente que no está en la tabla no inventa un comando', () => {
    // aider se instala con pip y cursor con un script de shell: no tienen entrada, y el asistente
    // tiene que seguir mandando a sus instrucciones en vez de correr algo que no existe.
    expect(comandoDeInstalacion('aider')).toBeNull()
    expect(comandoDeInstalacion('cursor')).toBeNull()
  })

  it('no ofrece instalar a Dolphin con npm: la app ES Dolphin', () => {
    expect(comandoDeInstalacion('dolphin')).toBeNull()
  })

  it('ningún paquete queda vacío ni con espacios', () => {
    for (const [agente, entrada] of paquetesDeInstalacion()) {
      expect(entrada.paquete, `${agente}`).toMatch(/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/)
    }
  })
})
