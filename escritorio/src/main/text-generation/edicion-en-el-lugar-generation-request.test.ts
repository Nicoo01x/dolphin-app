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

  it('devuelve el reemplazo pelado cuando el modelo lo marca y charla alrededor', async () => {
    const { resultado } = await correr('Listo:\n```reemplazo\nreturn a + b\n```\n¿Lo aplico?')
    expect(resultado).toMatchObject({ success: true, tipo: 'edicion', codigo: 'return a + b' })
  })

  it('un único bloque con el nombre del lenguaje, sin charla, también es un reemplazo', async () => {
    const { resultado } = await correr('```ts\nreturn a + b\n```')
    expect(resultado).toMatchObject({ success: true, tipo: 'edicion', codigo: 'return a + b' })
  })

  // El bug: «¿para qué sirve esta línea?» volvía como reemplazo, y Aceptar escribía la explicación
  // adentro del archivo.
  it('una pregunta vuelve como respuesta para leer, no como reemplazo', async () => {
    // Empieza con una lista a propósito: la limpieza de los mensajes de commit le saca la viñeta a
    // la primera línea, y acá eso rompería el markdown de la respuesta.
    const texto = '- `esquema` = `"Bearer"`\n- `token` = el del login'
    const { resultado } = await correr(texto)
    expect(resultado).toMatchObject({ success: true, tipo: 'respuesta', texto })
    expect(resultado).not.toHaveProperty('codigo')
  })

  it('dice qué agente contestó, para que el editor muestre su marca', async () => {
    const { resultado } = await correr('```reemplazo\nx\n```')
    expect(resultado).toMatchObject({ success: true, agentId: 'custom' })
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
