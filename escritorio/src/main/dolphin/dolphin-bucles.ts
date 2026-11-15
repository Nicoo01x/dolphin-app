import type { DolphinBucleAviso, DolphinBucleMotivo } from '../../shared/dolphin-bucles-types'
import { argumentosNormalizados, huellaDeHerramienta } from './dolphin-bucle-fingerprint'
import { salidaIndicaFallo } from './dolphin-bucle-failure'
export { huellaDeHerramienta } from './dolphin-bucle-fingerprint'

const MAX_LLAMADAS = 20
const UMBRAL_SIN_ARGUMENTOS = 6
const UMBRAL_REPETIDA = 3
const UMBRAL_EN_VENTANA = 4
const UMBRAL_TEST_FALLIDO = 4

const EVENTOS_DE_HERRAMIENTA = new Set(['pretooluse', 'posttooluse', 'posttoolusefailure'])

type Llamada = {
  huella: string
  herramienta: string
  tieneArgumentos: boolean
  fase: 'inicio' | 'fin'
  id?: string
  comandoDeTests?: string
  fallo?: boolean
}

type RachaDeTests = {
  comando: string
  repeticiones: number
  avisada: boolean
}

export type EntradaDeBucle = {
  paneKey: string
  hookEventName?: string
  toolName?: string
  toolInput?: unknown
  toolUseId?: string
  exitCode?: number | null
  code?: number | null
  output?: unknown
  changedFiles?: readonly string[]
  tabId?: string
  worktreeId?: string
  agentType?: string
  agentState?: string
  isReplay?: boolean
  programStatusOnly?: boolean
}

export type EstadoDeBucle = {
  llamadas: readonly Llamada[]
  pendiente?: Llamada
  huellaAvisada?: string
  rachaTests?: RachaDeTests
}

export type MemoriaDeBucles = ReadonlyMap<string, EstadoDeBucle>

export type DecisionDeBucle = {
  memoria: MemoriaDeBucles
  aviso: DolphinBucleAviso | null
  desarmar: boolean
}

function nombreDeHerramienta(nombre: string | undefined): string | undefined {
  const limpio = nombre?.trim()
  return limpio ? limpio : undefined
}

function nombreDeEvento(nombre: string | undefined): string {
  return nombre?.trim().replaceAll('_', '').replaceAll('-', '').toLowerCase() ?? ''
}

function esEventoDeHerramienta(evento: EntradaDeBucle): boolean {
  return EVENTOS_DE_HERRAMIENTA.has(nombreDeEvento(evento.hookEventName))
}

function esInicio(evento: EntradaDeBucle): boolean {
  return nombreDeEvento(evento.hookEventName) === 'pretooluse'
}

function esFallo(evento: EntradaDeBucle): boolean {
  return (
    nombreDeEvento(evento.hookEventName) === 'posttoolusefailure' ||
    (typeof evento.exitCode === 'number' && evento.exitCode !== 0) ||
    (typeof evento.code === 'number' && evento.code !== 0) ||
    salidaIndicaFallo(evento.output)
  )
}

function comandoDeTests(nombre: string, argumentos: unknown): string | undefined {
  if (!/^(bash|shell|execute|run_command|exec_command|run_terminal_cmd)$/i.test(nombre)) {
    return undefined
  }
  const comando =
    typeof argumentos === 'string'
      ? argumentos
      : argumentos && typeof argumentos === 'object'
        ? ((argumentos as Record<string, unknown>).command ??
          (argumentos as Record<string, unknown>).cmd)
        : undefined
  if (typeof comando !== 'string' || !comando.trim()) {
    return undefined
  }
  const normalizado = comando.trim()
  return /(?:^|[\s;&|()])(?:npm\s+(?:run\s+)?test(?:\s|$)|pnpm\s+(?:run\s+)?test(?:\s|$)|yarn\s+test(?:\s|$)|bun\s+test(?:\s|$)|(?:npx\s+)?vitest(?:\s|$)|pytest(?:\s|$)|jest(?:\s|$)|go\s+test(?:\s|$)|cargo\s+test(?:\s|$)|mix\s+test(?:\s|$)|mvn\s+test(?:\s|$)|gradle\s+test(?:\s|$)|test(?:\s|$))/i.test(
    normalizado
  )
    ? normalizado
    : undefined
}

function cambioDeArchivo(evento: EntradaDeBucle, nombre: string): boolean {
  return (
    (evento.changedFiles?.length ?? 0) > 0 ||
    /^(edit|write|create|apply_patch|applypatch|multiedit|multi_edit|notebookedit)$/i.test(nombre)
  )
}

function entradaDeLlamada(evento: EntradaDeBucle, nombre: string): Llamada {
  const argumentos = argumentosNormalizados(evento.toolInput)
  return {
    huella: huellaDeHerramienta(nombre, evento.toolInput),
    herramienta: nombre,
    tieneArgumentos: argumentos.presentes,
    fase: esInicio(evento) ? 'inicio' : 'fin',
    ...(evento.toolUseId ? { id: evento.toolUseId } : {}),
    ...(comandoDeTests(nombre, evento.toolInput)
      ? { comandoDeTests: comandoDeTests(nombre, evento.toolInput) }
      : {}),
    ...(esFallo(evento) ? { fallo: true } : {})
  }
}

function mismoEvento(
  pendiente: Llamada | undefined,
  evento: EntradaDeBucle,
  nombre: string | undefined
): boolean {
  if (!pendiente || pendiente.fase !== 'inicio') {
    return false
  }
  if (pendiente.id && evento.toolUseId) {
    return pendiente.id === evento.toolUseId
  }
  return nombre === undefined || pendiente.herramienta === nombre
}

function avisoDe(
  evento: EntradaDeBucle,
  llamada: Llamada,
  repeticiones: number,
  motivo: DolphinBucleMotivo
): DolphinBucleAviso {
  return {
    id: `${evento.paneKey}:${motivo}:${llamada.huella}:${repeticiones}`,
    paneKey: evento.paneKey,
    ...(evento.tabId ? { tabId: evento.tabId } : {}),
    ...(evento.worktreeId ? { worktreeId: evento.worktreeId } : {}),
    ...(evento.agentType ? { agentType: evento.agentType } : {}),
    toolName: llamada.herramienta,
    repeticiones,
    motivo
  }
}

function actualizarRachaDeTests(
  estado: EstadoDeBucle,
  llamada: Llamada,
  cambioArchivo: boolean
): RachaDeTests | undefined {
  if (cambioArchivo || !llamada.fallo || !llamada.comandoDeTests) {
    return cambioArchivo ? undefined : estado.rachaTests
  }
  const anterior = estado.rachaTests
  return anterior?.comando === llamada.comandoDeTests
    ? { ...anterior, repeticiones: anterior.repeticiones + 1 }
    : { comando: llamada.comandoDeTests, repeticiones: 1, avisada: false }
}

function incorporarLlamada(estado: EstadoDeBucle, llamada: Llamada): EstadoDeBucle {
  return {
    ...estado,
    llamadas: [...estado.llamadas, llamada].slice(-MAX_LLAMADAS),
    pendiente: llamada
  }
}

/** Decide si una observación normalizada de hooks confirma un posible doom loop. */
export function decidirBucle(memoria: MemoriaDeBucles, evento: EntradaDeBucle): DecisionDeBucle {
  const estadoAnterior = memoria.get(evento.paneKey)
  if (evento.isReplay || evento.programStatusOnly) {
    return { memoria, aviso: null, desarmar: false }
  }
  if (evento.agentState !== undefined && evento.agentState !== 'working') {
    if (!estadoAnterior) {
      return { memoria, aviso: null, desarmar: false }
    }
    const siguienteMemoria = new Map(memoria)
    siguienteMemoria.delete(evento.paneKey)
    return {
      memoria: siguienteMemoria,
      aviso: null,
      desarmar:
        estadoAnterior.huellaAvisada !== undefined || estadoAnterior.rachaTests?.avisada === true
    }
  }
  if (!esEventoDeHerramienta(evento)) {
    return { memoria, aviso: null, desarmar: false }
  }
  const estado = estadoAnterior ?? { llamadas: [] }
  const falloNuevo = esFallo(evento)
  const nombreRecibido = nombreDeHerramienta(evento.toolName)
  const puedeCompletarPendiente =
    falloNuevo &&
    nombreDeEvento(evento.hookEventName).startsWith('post') &&
    estado.pendiente !== undefined
  const nombre =
    nombreRecibido ?? (puedeCompletarPendiente ? estado.pendiente?.herramienta : undefined)
  if (!nombre) {
    return { memoria, aviso: null, desarmar: false }
  }

  const esPost = nombreDeEvento(evento.hookEventName).startsWith('post')
  const esMismo =
    esPost &&
    (mismoEvento(estado.pendiente, evento, nombreRecibido) ||
      (puedeCompletarPendiente && nombreRecibido === undefined))
  const llamada =
    esMismo && estado.pendiente
      ? { ...estado.pendiente, fase: 'fin' as const, ...(falloNuevo ? { fallo: true } : {}) }
      : entradaDeLlamada(evento, nombre)
  const siguiente = esMismo || !esInicio(evento) ? estado : incorporarLlamada(estado, llamada)
  const cambioArchivo = cambioDeArchivo(evento, nombre)
  const llamadas =
    !esMismo && !esInicio(evento) && nombre
      ? [...estado.llamadas, llamada].slice(-MAX_LLAMADAS)
      : siguiente.llamadas
  const rachaActual = cambioArchivo
    ? undefined
    : falloNuevo
      ? actualizarRachaDeTests(estado, llamada, false)
      : esPost
        ? undefined
        : estado.rachaTests
  const conLlamada: EstadoDeBucle = {
    ...siguiente,
    llamadas,
    pendiente: llamada,
    rachaTests: rachaActual
  }
  const ventana = conLlamada.llamadas.slice(-10)
  const consecutivas = conLlamada.llamadas.reduceRight(
    (cantidad, actual) => (actual.huella === llamada.huella ? cantidad + 1 : cantidad),
    0
  )
  const repeticiones = ventana.filter((actual) => actual.huella === llamada.huella).length
  const umbral = llamada.tieneArgumentos ? UMBRAL_REPETIDA : UMBRAL_SIN_ARGUMENTOS
  const bucleDeHerramienta =
    !cambioArchivo &&
    !llamada.comandoDeTests &&
    ((consecutivas >= umbral && llamada.tieneArgumentos) ||
      (!llamada.tieneArgumentos && consecutivas >= UMBRAL_SIN_ARGUMENTOS) ||
      (llamada.tieneArgumentos && repeticiones >= UMBRAL_EN_VENTANA))
  const bucleDeTests =
    conLlamada.rachaTests !== undefined &&
    conLlamada.rachaTests.repeticiones >= UMBRAL_TEST_FALLIDO &&
    !conLlamada.rachaTests.avisada

  let aviso: DolphinBucleAviso | null = null
  let huellaAvisada = conLlamada.huellaAvisada
  let rachaTests = conLlamada.rachaTests
  if (bucleDeTests && conLlamada.rachaTests) {
    aviso = avisoDe(evento, llamada, conLlamada.rachaTests.repeticiones, 'tests-fallando')
    rachaTests = { ...conLlamada.rachaTests, avisada: true }
  } else if (bucleDeHerramienta && huellaAvisada !== llamada.huella) {
    aviso = avisoDe(evento, llamada, consecutivas, 'herramienta-repetida')
    huellaAvisada = llamada.huella
  } else if (huellaAvisada !== llamada.huella) {
    huellaAvisada = undefined
  }

  const siguienteMemoria = new Map(memoria)
  siguienteMemoria.set(evento.paneKey, {
    ...conLlamada,
    huellaAvisada,
    rachaTests
  })
  return {
    memoria: siguienteMemoria,
    aviso,
    desarmar:
      cambioArchivo || (huellaAvisada === undefined && estadoAnterior?.huellaAvisada !== undefined)
  }
}

export function crearDetectorDeBucles(): {
  observar: (evento: EntradaDeBucle) => DecisionDeBucle
} {
  let memoria: MemoriaDeBucles = new Map()
  return {
    observar(evento) {
      const decision = decidirBucle(memoria, evento)
      memoria = decision.memoria
      return decision
    }
  }
}
