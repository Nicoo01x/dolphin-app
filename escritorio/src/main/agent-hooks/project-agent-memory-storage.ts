import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ProjectMemoryRecord = {
  id: string
  dicho: string
  patron?: string
  tipo?: 'regla' | 'error' | 'decision' | 'nota'
  creado?: string
  activo?: boolean
  origen?: string
  porQue?: string
  candidato?: boolean
}

export type ProjectTrainingRecord = { texto: string; fuente?: string }

type MemoryFile = { recuerdos?: ProjectMemoryRecord[] }
type TrainingFile = { aprendido?: ProjectTrainingRecord[] }
export type MemoryUsage = { usos: number; ultimoUso: string }
export type MemoryUsageFile = Record<string, MemoryUsage>

type FileStamp = { mtimeMs: number; size: number } | null

const MEMORY_FILE = 'memoria.json'
const TRAINING_FILE = 'entrenamiento.json'
const USAGE_FILE = 'memoria-usos.json'
const WRITE_RETRIES = 3

async function stamp(path: string): Promise<FileStamp> {
  try {
    const info = await stat(path)
    return { mtimeMs: info.mtimeMs, size: info.size }
  } catch {
    return null
  }
}

function sameStamp(left: FileStamp, right: FileStamp): boolean {
  return left?.mtimeMs === right?.mtimeMs && left?.size === right?.size
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

export function projectMemoryDirectory(repoPath: string): string {
  return join(repoPath, '.dolphin')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function readProjectMemory(repoPath: string): Promise<{
  recuerdos: ProjectMemoryRecord[]
  aprendido: ProjectTrainingRecord[]
}> {
  const directory = projectMemoryDirectory(repoPath)
  const [memory, training] = await Promise.all([
    readJson<MemoryFile>(join(directory, MEMORY_FILE), {}),
    readJson<TrainingFile>(join(directory, TRAINING_FILE), {})
  ])
  return {
    recuerdos: Array.isArray(memory.recuerdos) ? memory.recuerdos : [],
    aprendido: Array.isArray(training.aprendido) ? training.aprendido : []
  }
}

// Why una cola por archivo: con E/S asíncrona dos escrituras del mismo proceso (dos hooks a la vez)
// se intercalarían entre el chequeo del mtime y el rename, y una pisaría a la otra. El reintento
// por mtime queda para los otros procesos que escriben el mismo archivo.
const escriturasPorArchivo = new Map<string, Promise<void>>()

export function writeJsonWithMtimeRetry<T>(
  path: string,
  next: (value: T) => T,
  fallback: T
): Promise<void> {
  const previa = escriturasPorArchivo.get(path) ?? Promise.resolve()
  const escritura = previa.then(() => writeJsonOnce(path, next, fallback))
  const cola = escritura.catch(() => undefined)
  escriturasPorArchivo.set(path, cola)
  void cola.then(() => {
    if (escriturasPorArchivo.get(path) === cola) {
      escriturasPorArchivo.delete(path)
    }
  })
  return escritura
}

async function writeJsonOnce<T>(path: string, next: (value: T) => T, fallback: T): Promise<void> {
  const directory = join(path, '..')
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
    const before = await stamp(path)
    const current = await readJson(path, fallback)
    const updated = next(current)
    if (!sameStamp(before, await stamp(path))) {
      continue
    }
    const temporary = join(
      directory,
      `.${path.split(/[\\/]/).at(-1) ?? 'memoria'}.${process.pid}.${Date.now()}.${attempt}.tmp`
    )
    try {
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
      if (!sameStamp(before, await stamp(path))) {
        continue
      }
      await rename(temporary, path)
      return
    } finally {
      // Limpieza a mejor esfuerzo: tras un rename exitoso el temporal ya no existe.
      await unlink(temporary).catch(() => undefined)
    }
  }
  throw new Error(`Concurrent update prevented writing ${path}`)
}

const palabrasDe = (texto: string): Set<string> =>
  new Set(
    normalizeForStorage(texto)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((palabra) => palabra.length > 2)
  )

/** ¿Ya lo descartaste en la vista Memoria? El núcleo guarda el texto normalizado de cada descarte. */
export async function fueDescartado(repoPath: string, dicho: string): Promise<boolean> {
  let descartes: unknown
  try {
    descartes = JSON.parse(
      await readFile(join(projectMemoryDirectory(repoPath), 'memoria-descartes.json'), 'utf8')
    )
  } catch {
    return false
  }
  if (!Array.isArray(descartes)) {
    return false
  }
  const nuevas = palabrasDe(dicho)
  return descartes.some((descarte) => {
    if (typeof descarte !== 'string') {
      return false
    }
    const viejas = palabrasDe(descarte)
    const comunes = [...nuevas].filter((palabra) => viejas.has(palabra)).length
    const union = new Set([...nuevas, ...viejas]).size
    return union > 0 && comunes / union >= 0.8
  })
}

export async function addProjectMemoryCandidate(
  repoPath: string,
  candidate: ProjectMemoryRecord
): Promise<boolean> {
  const directory = projectMemoryDirectory(repoPath)
  const path = join(directory, MEMORY_FILE)
  const before = (await readProjectMemory(repoPath)).recuerdos
  if (!(await exists(directory)) || (await fueDescartado(repoPath, candidate.dicho))) {
    return false
  }
  let added = false
  await writeJsonWithMtimeRetry<MemoryFile>(
    path,
    (current) => {
      const recuerdos = Array.isArray(current.recuerdos) ? current.recuerdos : []
      const normalized = normalizeForStorage(candidate.dicho)
      if (
        recuerdos.some(
          (record) =>
            normalizeForStorage(record.dicho) === normalized ||
            (normalized.length > 20 && normalizeForStorage(record.dicho).includes(normalized)) ||
            (normalizeForStorage(record.dicho).length > 20 &&
              normalized.includes(normalizeForStorage(record.dicho)))
        )
      ) {
        return current
      }
      added = true
      return { ...current, recuerdos: [...recuerdos, candidate] }
    },
    { recuerdos: before }
  )
  return added
}

export async function recordProjectMemoryUsage(
  repoPath: string,
  usages: readonly string[],
  now = new Date().toISOString()
): Promise<void> {
  if (usages.length === 0) {
    return
  }
  const path = join(projectMemoryDirectory(repoPath), USAGE_FILE)
  await writeJsonWithMtimeRetry<MemoryUsageFile>(
    path,
    (current) => {
      const updated = { ...current }
      for (const id of usages) {
        const previous = updated[id]
        updated[id] = { usos: (previous?.usos ?? 0) + 1, ultimoUso: now }
      }
      return updated
    },
    {}
  )
}

export function normalizeForStorage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim()
}
