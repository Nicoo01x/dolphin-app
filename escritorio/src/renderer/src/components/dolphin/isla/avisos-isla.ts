import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { DolphinChoque } from '../../../../../shared/dolphin-choques'

/**
 * Los avisos de la isla, como los de Deska: «te necesita» cuando un agente pasa a esperar algo de
 * vos (una aprobación, una pregunta) y «terminó» cuando deja de trabajar. Solo de lo que todavía no
 * viste: si estás mirando ese agente, ya lo sabés. Y con enfriamiento (`pasarEnfriamiento`), para
 * que un agente que va y viene no te llene la pantalla.
 */
export type TipoDeAviso = 'te-necesita' | 'termino'
export type AvisoDeAgente = {
  id: string
  tipo: TipoDeAviso
  card: DashboardCard
  detectadoEn: number
}
export type AvisoDeBucle = {
  id: string
  tipo: 'bucle'
  card: DashboardCard
  detectadoEn: number
  bucle: { herramienta: string; repeticiones: number }
}
export type Aviso =
  | AvisoDeAgente
  | AvisoDeBucle
  | { id: string; tipo: 'choque'; choque: DolphinChoque; detectadoEn: number }

/** Cómo estaba cada agente la última vez. */
export type MemoriaDeAvisos = { buckets: ReadonlyMap<string, DashboardCard['bucket']> }
export type MemoriaDeChoques = { ids: ReadonlySet<string> }

export const ENFRIAMIENTO_MS = 30_000

function tipoDeCambio(
  antes: DashboardCard['bucket'] | undefined,
  ahora: DashboardCard['bucket']
): TipoDeAviso | null {
  if (ahora === 'attention' && antes !== 'attention') {
    return 'te-necesita'
  }
  return ahora === 'done' && antes === 'working' ? 'termino' : null
}

/**
 * Lo nuevo para avisar entre el tablero anterior y este. La primera mirada (sin memoria) solo
 * anota: lo que ya pasaba antes de abrir la isla no se avisa de golpe.
 */
export function detectarAvisos(
  memoria: MemoriaDeAvisos | null,
  cards: readonly DashboardCard[],
  ahora: number
): { avisos: AvisoDeAgente[]; memoria: MemoriaDeAvisos } {
  const buckets = new Map(cards.map((card) => [card.paneKey, card.bucket]))
  if (!memoria) {
    return { avisos: [], memoria: { buckets } }
  }
  const avisos: AvisoDeAgente[] = []
  for (const card of cards) {
    const tipo = tipoDeCambio(memoria.buckets.get(card.paneKey), card.bucket)
    if (tipo && card.unseen) {
      avisos.push({ id: `${card.paneKey}:${tipo}:${ahora}`, tipo, card, detectadoEn: ahora })
    }
  }
  return { avisos, memoria: { buckets } }
}

export function detectarAvisosDeChoques(
  memoria: MemoriaDeChoques | null,
  choques: readonly DolphinChoque[],
  ahora: number
): { avisos: Aviso[]; memoria: MemoriaDeChoques } {
  const ids = new Set(choques.map((choque) => `${choque.a}\0${choque.b}`))
  if (!memoria) {
    return { avisos: [], memoria: { ids } }
  }
  return {
    avisos: choques
      .filter((choque) => !memoria.ids.has(`${choque.a}\0${choque.b}`))
      .map((choque) => ({
        id: `choque:${choque.a}:${choque.b}`,
        tipo: 'choque' as const,
        choque,
        detectadoEn: ahora
      })),
    memoria: { ids }
  }
}

const claveDe = (aviso: Aviso): string =>
  aviso.tipo === 'choque' ? aviso.id : `${aviso.card.paneKey}:${aviso.tipo}`

/**
 * Los que pueden mostrarse ahora sin repetir lo mismo del mismo agente antes de ENFRIAMIENTO_MS, y
 * cuándo se mostró cada cosa. Cuenta lo que se mostró, no lo que se detectó: un aviso que nunca
 * salió (lo estabas mirando) no le quita el siguiente a cuando ya no lo mirás.
 */
export function pasarEnfriamiento(
  avisos: readonly Aviso[],
  mostrados: ReadonlyMap<string, number>,
  ahora: number
): { pasan: Aviso[]; mostrados: Map<string, number> } {
  const siguientes = new Map(mostrados)
  const pasan = avisos.filter((aviso) => {
    const anterior = siguientes.get(claveDe(aviso))
    if (anterior !== undefined && ahora - anterior < ENFRIAMIENTO_MS) {
      return false
    }
    siguientes.set(claveDe(aviso), ahora)
    return true
  })
  return { pasan, mostrados: siguientes }
}

const BUCKET_DE: Record<Exclude<Aviso['tipo'], 'choque'>, DashboardCard['bucket']> = {
  'te-necesita': 'attention',
  termino: 'done',
  bucle: 'working'
}

/**
 * Los avisos que todavía valen con este tablero, con su tarjeta al día. Se va el de un agente que
 * ya viste, que contestaste o que volvió a trabajar: avisar de algo que ya no es así confunde. Si no
 * se cae ninguno y las tarjetas son las mismas, devuelve la misma lista.
 */
export function avisosVigentes(
  avisos: readonly Aviso[],
  cards: readonly DashboardCard[],
  choques: readonly DolphinChoque[] = []
): readonly Aviso[] {
  const porPane = new Map(cards.map((card) => [card.paneKey, card]))
  const porChoque = new Map(choques.map((choque) => [`${choque.a}\0${choque.b}`, choque]))
  let cambio = false
  const vigentes: Aviso[] = []
  for (const aviso of avisos) {
    if (aviso.tipo === 'choque') {
      const choque = porChoque.get(`${aviso.choque.a}\0${aviso.choque.b}`)
      if (!choque) {
        cambio = true
        continue
      }
      if (choque === aviso.choque) {
        vigentes.push(aviso)
        continue
      }
      cambio = true
      vigentes.push({ ...aviso, choque })
      continue
    }
    const card = porPane.get(aviso.card.paneKey)
    if (
      !card ||
      card.bucket !== BUCKET_DE[aviso.tipo] ||
      (aviso.tipo !== 'bucle' && !card.unseen)
    ) {
      cambio = true
      continue
    }
    if (card === aviso.card) {
      vigentes.push(aviso)
      continue
    }
    cambio = true
    vigentes.push({ ...aviso, card })
  }
  return cambio ? vigentes : avisos
}

/**
 * Suma avisos a la cola sin pasarse de `maximo`. El primero es el que está a la vista: no se
 * descarta aunque haya muchos (un clic en «Abrir» iría a otro agente); se van los más viejos de
 * los que esperan.
 */
export function encolarAvisos(
  cola: readonly Aviso[],
  nuevos: readonly Aviso[],
  maximo: number
): Aviso[] {
  const todos = [...cola, ...nuevos]
  if (todos.length <= maximo) {
    return todos
  }
  return [todos[0], ...todos.slice(1).slice(-(maximo - 1))]
}
