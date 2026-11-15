import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  normalizeForStorage,
  projectMemoryDirectory,
  writeJsonWithMtimeRetry,
  type ProjectMemoryRecord
} from './project-agent-memory-storage'

type MemoryFile = { recuerdos?: ProjectMemoryRecord[] }

/** Más que esto ya no es una regla: es un pedazo de charla, y la memoria se lee como reglas. */
export const REMEMBER_MAX_CHARS = 500

export type RememberResult =
  | { ok: true; id: string; alreadyKnown: boolean }
  | { ok: false; reason: 'empty' | 'too-long' }

/**
 * «Recordar esto» desde el chat: lo marcó la persona, así que entra ACTIVO y como suyo (`owner`), sin
 * pasar por «Para aprobar». Si ya lo sabe (mismo texto normalizado), no lo duplica: lo devuelve. Un
 * descarte viejo no lo frena, porque ahora lo está pidiendo de frente.
 */
export async function rememberProjectMemory(
  repoPath: string,
  text: string,
  porQue: string,
  now = new Date()
): Promise<RememberResult> {
  const dicho = text.replace(/\s+/g, ' ').trim()
  if (!dicho) {
    return { ok: false, reason: 'empty' }
  }
  if (dicho.length > REMEMBER_MAX_CHARS) {
    return { ok: false, reason: 'too-long' }
  }
  const directory = projectMemoryDirectory(repoPath)
  await mkdir(directory, { recursive: true })
  const normalized = normalizeForStorage(dicho)
  const id = `chat-${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`
  let result: RememberResult = { ok: true, id, alreadyKnown: false }
  await writeJsonWithMtimeRetry<MemoryFile>(
    join(directory, 'memoria.json'),
    (current) => {
      const recuerdos = Array.isArray(current.recuerdos) ? current.recuerdos : []
      const known = recuerdos.find((record) => normalizeForStorage(record.dicho) === normalized)
      if (known && known.activo !== false && known.candidato !== true) {
        result = { ok: true, id: known.id, alreadyKnown: true }
        return current
      }
      // Era una candidata o estaba apagada: pedirla de frente la aprueba, en el mismo lugar.
      const record: ProjectMemoryRecord = {
        id: known?.id ?? id,
        dicho,
        tipo: known?.tipo ?? 'regla',
        activo: true,
        creado: known?.creado ?? now.toISOString(),
        origen: 'owner',
        porQue
      }
      result = { ok: true, id: record.id, alreadyKnown: false }
      return {
        ...current,
        recuerdos: known
          ? recuerdos.map((item) => (item === known ? record : item))
          : [...recuerdos, record]
      }
    },
    { recuerdos: [] }
  )
  return result
}

/** El «Deshacer» del aviso: borra solo lo que guardó «Recordar esto» y nada más. */
export async function forgetRememberedProjectMemory(
  repoPath: string,
  id: string
): Promise<boolean> {
  if (!id.startsWith('chat-')) {
    return false
  }
  let removed = false
  await writeJsonWithMtimeRetry<MemoryFile>(
    join(projectMemoryDirectory(repoPath), 'memoria.json'),
    (current) => {
      const recuerdos = Array.isArray(current.recuerdos) ? current.recuerdos : []
      const kept = recuerdos.filter((record) => record.id !== id)
      removed = kept.length !== recuerdos.length
      return removed ? { ...current, recuerdos: kept } : current
    },
    { recuerdos: [] }
  )
  return removed
}
