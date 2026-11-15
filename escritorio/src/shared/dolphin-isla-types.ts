/**
 * Lo que viaja entre la isla, main y la ventana principal (ver main/dolphin/dolphin-isla.ts).
 * La isla es el pop-out del dashboard en otro modo: no toca terminales ni lee archivos, le pide a main.
 */

/** Un asunto abierto de la bandeja de Dolphin de algún repo, recortado a lo que muestra la isla. */
export type AsuntoDeIsla = {
  id: string
  repo: string
  tipo: 'idea' | 'error'
  titulo: string
  creado: string
}

/** Lo que se le escribe a un agente desde la isla: a su terminal, como si se tipeara en el chat. */
export type EscrituraDesdeIsla = { paneKey: string; ptyId: string; texto: string }

/** Lo que main le pasa a la ventana principal: la escritura y el id con el que contesta. */
export type PedidoDeEscritura = EscrituraDesdeIsla & { id: string }

/**
 * Cómo terminó: llegó a la terminal, o por qué no. «aprobacion»: el agente espera que apruebes o
 * elijas algo, y el Enter lo contestaría; «no-esta»: ya no está en el tablero o se quedó sin
 * terminal; «no-llego»: la terminal lo rechazó o no hay ventana principal; «sin-confirmar»: pudo
 * haber llegado pero nadie lo confirmó a tiempo (mandarlo otra vez podría duplicarlo).
 */
export type ResultadoDeEscritura =
  | { ok: true }
  | { ok: false; motivo: 'aprobacion' | 'no-esta' | 'no-llego' | 'sin-confirmar' }

export type RespuestaDeEscritura = { id: string; resultado: ResultadoDeEscritura }

export type AccionDeArchivoDeEstudio = 'creado' | 'editado'
export type ArchivoDeEstudio = { ruta: string; accion: AccionDeArchivoDeEstudio }
export type AgenteDeEstudio = {
  paneKey: string
  archivos: ArchivoDeEstudio[]
}
export type EstudioDeIsla = { disponible: boolean; agentes: AgenteDeEstudio[] }
export type PedidoDeEstudio = { id: string; paneKeys: string[] }
export type RespuestaDeEstudio = { id: string; estudio: EstudioDeIsla }

/** Más largo que esto no es una respuesta rápida: para eso está el chat. */
export const LARGO_MAXIMO_DESDE_ISLA = 4_000
// Un ptyId local lleva la ruta entera del worktree: se acota como el resto del sistema.
const LARGO_MAXIMO_ID = 4_096

const esId = (valor: unknown): valor is string =>
  typeof valor === 'string' && valor.length > 0 && valor.length <= LARGO_MAXIMO_ID

export function esEscrituraDesdeIsla(valor: unknown): valor is EscrituraDesdeIsla {
  if (!valor || typeof valor !== 'object') {
    return false
  }
  const { paneKey, ptyId, texto } = valor as Record<string, unknown>
  return (
    esId(paneKey) &&
    esId(ptyId) &&
    typeof texto === 'string' &&
    texto.trim().length > 0 &&
    texto.length <= LARGO_MAXIMO_DESDE_ISLA
  )
}

const MOTIVOS = new Set(['aprobacion', 'no-esta', 'no-llego', 'sin-confirmar'])

const ACCIONES_DE_ARCHIVO = new Set(['creado', 'editado'])

function esArchivoDeEstudio(valor: unknown): valor is ArchivoDeEstudio {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }
  const { ruta, accion } = valor as Record<string, unknown>
  return esId(ruta) && typeof accion === 'string' && ACCIONES_DE_ARCHIVO.has(accion)
}

function esEstudioDeIsla(valor: unknown): valor is EstudioDeIsla {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }
  const { disponible, agentes } = valor as Record<string, unknown>
  return (
    typeof disponible === 'boolean' &&
    Array.isArray(agentes) &&
    agentes.length <= 500 &&
    agentes.every((agente) => {
      if (!agente || typeof agente !== 'object' || Array.isArray(agente)) {
        return false
      }
      const { paneKey, archivos } = agente as Record<string, unknown>
      return (
        esId(paneKey) &&
        Array.isArray(archivos) &&
        archivos.length <= 8 &&
        archivos.every(esArchivoDeEstudio)
      )
    })
  )
}

export function esRespuestaDeEstudio(valor: unknown): valor is RespuestaDeEstudio {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }
  const { id, estudio } = valor as Record<string, unknown>
  return esId(id) && esEstudioDeIsla(estudio)
}

export function esRespuestaDeEscritura(valor: unknown): valor is RespuestaDeEscritura {
  if (!valor || typeof valor !== 'object') {
    return false
  }
  const { id, resultado } = valor as Record<string, unknown>
  if (!esId(id) || !resultado || typeof resultado !== 'object') {
    return false
  }
  const { ok, motivo } = resultado as Record<string, unknown>
  return ok === true || (ok === false && typeof motivo === 'string' && MOTIVOS.has(motivo))
}

/**
 * Cómo armó cada uno su isla y su nota. Lo guarda main en un archivo: la ventana de la isla usa una
 * sesión en memoria y su localStorage se borra con cada reinicio.
 */
export type PosicionDeIsla = { centro: number; arriba: number; displayId: number }
export const UMBRAL_ARRASTRE_ISLA = 4
export const superaUmbralDeArrastre = (deltaX: number, deltaY: number): boolean =>
  Math.hypot(deltaX, deltaY) >= UMBRAL_ARRASTRE_ISLA
function esPosicionDeIsla(valor: unknown): valor is PosicionDeIsla {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }
  const posicion = valor as Record<string, unknown>
  return (
    typeof posicion.centro === 'number' &&
    Number.isFinite(posicion.centro) &&
    typeof posicion.arriba === 'number' &&
    Number.isFinite(posicion.arriba) &&
    typeof posicion.displayId === 'number' &&
    Number.isInteger(posicion.displayId)
  )
}

export type PreferenciasDeIsla = {
  armado?: unknown
  notas?: string
  avisos?: boolean
  posicion?: PosicionDeIsla
}

export const LARGO_MAXIMO_NOTAS = 20_000

export function esPreferenciasDeIsla(valor: unknown): valor is PreferenciasDeIsla {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }
  const { armado, notas, avisos, posicion } = valor as Record<string, unknown>
  const armadoValido = armado === undefined || (typeof armado === 'object' && armado !== null)
  const notasValidas =
    notas === undefined || (typeof notas === 'string' && notas.length <= LARGO_MAXIMO_NOTAS)
  const avisosValidos = avisos === undefined || typeof avisos === 'boolean'
  const posicionValida = posicion === undefined || esPosicionDeIsla(posicion)
  return armadoValido && notasValidas && avisosValidos && posicionValida
}
