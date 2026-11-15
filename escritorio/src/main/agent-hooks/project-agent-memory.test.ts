import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProjectMemoryHookResponse,
  buildStartupContext,
  detectCorrection,
  rankRelevantMemories
} from './project-agent-memory'
import {
  readProjectMemory,
  writeJsonWithMtimeRetry,
  type ProjectMemoryRecord
} from './project-agent-memory-storage'

const settings = { projectMemoryEnabled: true, learnFromCorrections: true }

type MemoryFixture = { recuerdos: readonly unknown[] }
type TrainingFixture = { aprendido?: readonly unknown[] }

function repoWithMemory(memory: MemoryFixture, training: TrainingFixture = {}): string {
  const repo = mkdtempSync(join(tmpdir(), 'dolphin-project-memory-'))
  const directory = join(repo, '.dolphin')
  mkdirSync(directory)
  writeFileSync(join(directory, 'memoria.json'), JSON.stringify(memory), 'utf8')
  writeFileSync(join(directory, 'entrenamiento.json'), JSON.stringify(training), 'utf8')
  return repo
}

function options(repo: string) {
  return {
    getSettings: () => settings,
    resolveRepoPath: () => repo
  }
}

describe('project agent memory', () => {
  it('builds a bounded startup block with active rules, decisions and training', () => {
    const recuerdos: ProjectMemoryRecord[] = [
      { id: 'rule', dicho: 'Usá pnpm para los comandos del proyecto', tipo: 'regla' },
      { id: 'decision', dicho: 'La API pública usa JSON', tipo: 'decision' },
      { id: 'inactive', dicho: 'No enviar secretos', activo: false, tipo: 'regla' },
      { id: 'note', dicho: 'Nota interna', tipo: 'nota' }
    ]
    const context = buildStartupContext(recuerdos, [
      { texto: 'El entrenador detectó pnpm', fuente: 'x' }
    ])
    expect(context).toContain('Memoria del proyecto (Dolphin):')
    expect(context).toContain('Usá pnpm')
    expect(context).toContain('La API pública')
    expect(context).toContain('El entrenador')
    expect(context).not.toContain('No enviar secretos')
    expect(context).not.toContain('Nota interna')
    expect([...context].length).toBeLessThanOrEqual(6000)
    const bounded = buildStartupContext(
      Array.from({ length: 500 }, (_, index) => ({
        id: `rule-${index}`,
        dicho: `Regla ${index} para el proyecto`,
        tipo: 'regla' as const
      })),
      []
    )
    expect([...bounded].length).toBeLessThanOrEqual(6000)
  })

  it('ranks relevant errors and file paths, and returns nothing unrelated', () => {
    const records: ProjectMemoryRecord[] = [
      { id: 'error', dicho: 'El error de auth está en src/auth/login.ts', tipo: 'error' },
      { id: 'other', dicho: 'Preferimos botones compactos', tipo: 'nota' }
    ]
    expect(rankRelevantMemories('Revisá src/auth/login.ts', records, [])[0]?.id).toBe('error')
    expect(rankRelevantMemories('¿Qué color usamos?', records, [])).toEqual([])
  })

  it.each([
    'no, usá la API nueva',
    'siempre corré los tests',
    'nunca edites package-lock.json',
    'te dije que uses pnpm',
    'acordate de validar Windows',
    'de ahora en más documentá las decisiones',
    'no hagas cambios fuera de src',
    'no uses ese endpoint',
    'always run the typecheck',
    "don't edit generated files"
  ])('detects correction: %s', (prompt) => {
    expect(detectCorrection(prompt)).toBe(prompt)
  })

  it.each([
    '¿qué hacemos hoy?',
    'podés revisar el componente?',
    'corré los tests',
    'me explicás este error?',
    'hay una regla de lint?',
    'abrí src/app.ts',
    'quiero un resumen',
    'can you inspect the log?',
    'please fix the test',
    'what is the next step?'
  ])('does not mistake ordinary prompts for corrections: %s', (prompt) => {
    expect(detectCorrection(prompt)).toBeNull()
  })

  it('a complaint with «siempre» is not a rule; a rule inside a long message is kept alone', () => {
    expect(detectCorrection('esto siempre falla cuando abro la isla, arreglalo')).toBeNull()
    expect(detectCorrection('¿siempre usás pnpm acá?')).toBeNull()
    expect(
      detectCorrection(
        'Dale, seguí con el panel. Y de ahora en más escribí los textos con voseo. Avisame cuando termines.'
      )
    ).toBe('Y de ahora en más escribí los textos con voseo.')
  })

  it('creates one inactive candidate and does not send it as context', async () => {
    const repo = repoWithMemory({ recuerdos: [] })
    const sent = new Set<string>()
    const body = {
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'no, usá la implementación nueva'
    }
    const first = await buildProjectMemoryHookResponse('claude', body, options(repo), sent)
    const second = await buildProjectMemoryHookResponse('claude', body, options(repo), sent)
    const memory = await readProjectMemory(repo)
    expect(first).toBe('')
    expect(second).toBe('')
    expect(memory.recuerdos).toHaveLength(1)
    expect(memory.recuerdos[0]).toMatchObject({ activo: false, candidato: true, tipo: 'regla' })
    rmSync(repo, { recursive: true, force: true })
  })

  it('does not propose again what was discarded in the Memoria view', async () => {
    const repo = repoWithMemory({ recuerdos: [] })
    writeFileSync(
      join(repo, '.dolphin', 'memoria-descartes.json'),
      JSON.stringify(['nunca usar pnpm npm'])
    )
    await buildProjectMemoryHookResponse(
      'claude',
      {
        hook_event_name: 'UserPromptSubmit',
        session_id: 's2',
        prompt: 'Nunca usar pnpm, usar npm.'
      },
      options(repo),
      new Set()
    )
    expect((await readProjectMemory(repo)).recuerdos).toHaveLength(0)
    rmSync(repo, { recursive: true, force: true })
  })

  it('retries after a concurrent memory change instead of overwriting it', async () => {
    const repo = repoWithMemory({ recuerdos: [] })
    const path = join(repo, '.dolphin', 'memoria.json')
    let firstAttempt = true
    await writeJsonWithMtimeRetry<Record<string, unknown>>(
      path,
      (current) => {
        if (firstAttempt) {
          firstAttempt = false
          writeFileSync(
            path,
            JSON.stringify({ recuerdos: [{ id: 'core', dicho: 'Regla del núcleo' }] })
          )
        }
        const recuerdos = Array.isArray(current.recuerdos) ? current.recuerdos : []
        return { ...current, recuerdos: [...recuerdos, { id: 'candidate', dicho: 'Candidato' }] }
      },
      { recuerdos: [] }
    )
    expect((await readProjectMemory(repo)).recuerdos.map((item) => item.dicho)).toEqual([
      'Regla del núcleo',
      'Candidato'
    ])
    rmSync(repo, { recursive: true, force: true })
  })

  it('returns empty context when memory resolution fails', async () => {
    const sent = new Set<string>()
    await expect(
      buildProjectMemoryHookResponse(
        'claude',
        { hook_event_name: 'SessionStart', session_id: 's1' },
        {
          getSettings: () => settings,
          resolveRepoPath: () => {
            throw new Error('boom')
          }
        },
        sent
      )
    ).resolves.toBe('')
  })

  it('returns Claude JSON context and records training usage by hash', async () => {
    const repo = repoWithMemory(
      { recuerdos: [{ id: 'r1', dicho: 'Usá pnpm', tipo: 'regla' }] },
      { aprendido: [{ texto: 'Los tests viven en src', fuente: 'trainer' }] }
    )
    const response = await buildProjectMemoryHookResponse(
      'claude',
      { hook_event_name: 'SessionStart', session_id: 's1' },
      options(repo),
      new Set<string>()
    )
    expect(response).toContain('hookSpecificOutput')
    expect(response).toContain('Usá pnpm')
    expect(response).toContain('Los tests viven en src')
    const usages = JSON.parse(
      readFileSync(join(repo, '.dolphin', 'memoria-usos.json'), 'utf8')
    ) as Record<string, unknown>
    expect(usages.r1).toMatchObject({ usos: 1 })
    expect(Object.keys(usages).some((key) => key.startsWith('entrenamiento:'))).toBe(true)
    rmSync(repo, { recursive: true, force: true })
  })
})
