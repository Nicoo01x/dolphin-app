import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  forgetRememberedProjectMemory,
  rememberProjectMemory
} from './project-agent-memory-remember'
import { readProjectMemory } from './project-agent-memory-storage'

let repo = ''

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'dolphin-remember-'))
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('Recordar esto desde el chat', () => {
  it('entra activo, como tuyo, aunque el repo todavía no tenga .dolphin', async () => {
    const result = await rememberProjectMemory(
      repo,
      '  Usá   pnpm, nunca npm ',
      'Lo marcaste en el chat'
    )
    expect(result).toMatchObject({ ok: true, alreadyKnown: false })
    expect((await readProjectMemory(repo)).recuerdos).toEqual([
      expect.objectContaining({
        dicho: 'Usá pnpm, nunca npm',
        tipo: 'regla',
        activo: true,
        origen: 'owner',
        porQue: 'Lo marcaste en el chat'
      })
    ])
  })

  it('no duplica lo que ya sabe, aunque cambien mayúsculas o tildes', async () => {
    const first = await rememberProjectMemory(repo, 'Usá pnpm', 'x')
    const second = await rememberProjectMemory(repo, 'usa PNPM', 'x')
    expect(second).toEqual({ ok: true, id: first.ok ? first.id : '', alreadyKnown: true })
    expect((await readProjectMemory(repo)).recuerdos).toHaveLength(1)
  })

  it('pedir de frente una candidata la aprueba en su lugar, sin perder su id', async () => {
    mkdirSync(join(repo, '.dolphin'))
    writeFileSync(
      join(repo, '.dolphin', 'memoria.json'),
      JSON.stringify({
        recuerdos: [
          { id: 'sesion-1', dicho: 'Usá pnpm', tipo: 'regla', activo: false, candidato: true },
          { id: 'otra', dicho: 'Otra regla', tipo: 'regla' }
        ]
      })
    )
    const result = await rememberProjectMemory(repo, 'Usá pnpm', 'x')
    expect(result).toMatchObject({ ok: true, id: 'sesion-1', alreadyKnown: false })
    const recuerdos = (await readProjectMemory(repo)).recuerdos
    expect(recuerdos.map((r) => r.id)).toEqual(['sesion-1', 'otra'])
    expect(recuerdos[0]).toMatchObject({ activo: true, origen: 'owner' })
    expect(recuerdos[0]).not.toHaveProperty('candidato')
  })

  it('rechaza lo vacío y lo que ya es un pedazo de charla', async () => {
    expect(await rememberProjectMemory(repo, '   ', 'x')).toEqual({ ok: false, reason: 'empty' })
    expect(await rememberProjectMemory(repo, 'a'.repeat(501), 'x')).toEqual({
      ok: false,
      reason: 'too-long'
    })
  })

  it('deshacer borra solo lo que guardó «Recordar esto»', async () => {
    mkdirSync(join(repo, '.dolphin'))
    writeFileSync(
      join(repo, '.dolphin', 'memoria.json'),
      JSON.stringify({ recuerdos: [{ id: 'del-nucleo', dicho: 'Regla vieja' }] })
    )
    const result = await rememberProjectMemory(repo, 'Regla nueva', 'x')
    expect(await forgetRememberedProjectMemory(repo, 'del-nucleo')).toBe(false)
    expect(await forgetRememberedProjectMemory(repo, result.ok ? result.id : '')).toBe(true)
    expect((await readProjectMemory(repo)).recuerdos.map((r) => r.dicho)).toEqual(['Regla vieja'])
  })
})
