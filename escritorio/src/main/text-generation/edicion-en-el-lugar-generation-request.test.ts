import { describe, expect, it } from 'vitest'
import { generarEdicionEnElLugar } from './edicion-en-el-lugar-generation-request'
import type { SpawnSourceControlAgent } from './source-control-text-generation-types'

/**
 * Editar con IA en el lugar va por la misma vía que el mensaje de commit.
 *
 * Lo propio de esta operación es cómo se lee lo que vuelve: se escribe derecho adentro de un
 * archivo de la persona, así que la cerca y la charla del modelo tienen que quedar afuera, y una
 * respuesta vacía tiene que fallar en vez de borrar la selección.
 */

const spawnAgent: SpawnSourceControlAgent = () => {
  throw new Error('no se usa en el camino remoto')
}

type AgentId = Parameters<typeof generarEdicionEnElLugar>[0]['params']['agentId']

const correr = async (stdout: string, agentId: AgentId = 'custom', model = '') => {
  let operacion = ''
  const resultado = await generarEdicionEnElLugar({
    prompt: 'Pedido: que sume',
    params: { agentId, model, customAgentCommand: 'agent' },
    target: {
      kind: 'remote',
      cwd: '/repo',
      missingBinaryLocation: 'remote PATH',
      execute: async (_plan, _cwd, _timeoutMs, pedida) => {
        operacion = pedida
        return { stdout, stderr: '', exitCode: 0, timedOut: false }
      }
    },
    spawnAgent
  })
  return { resultado, operacion }
}

describe('generarEdicionEnElLugar', () => {
  it('va por su propia operación, para que su cola y su cancelación sean suyas', async () => {
    const { operacion } = await correr('return a + b')
    expect(operacion).toBe('edicion-en-el-lugar')
  })

  it('devuelve el código pelado cuando el modelo contesta con cerca y charla', async () => {
    const { resultado } = await correr('Listo:\n```ts\nreturn a + b\n```\n¿Lo aplico?')
    expect(resultado).toMatchObject({ success: true, codigo: 'return a + b' })
  })

  it('una respuesta sin cerca es el código tal cual', async () => {
    const { resultado } = await correr('return a + b')
    expect(resultado).toMatchObject({ success: true, codigo: 'return a + b' })
  })

  // Si esto pasara por bueno, aceptar la sugerencia borraría lo que la persona tenía seleccionado.
  // Una salida en blanco la ataja la vía compartida; la cerca vacía llega hasta la guardia propia.
  it('una respuesta vacía falla en vez de borrar la selección', async () => {
    const { resultado } = await correr('   \n\n')
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error).toContain('empty edit')
    }
  })

  // Y con un agente de fábrica también: por eso este módulo no lleva su propia guardia de vacío.
  it('una cerca vacía falla igual con un agente de fábrica', async () => {
    const { resultado } = await correr('```ts\n```', 'claude', 'sonnet')
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error).toContain('empty edit')
    }
  })
})
