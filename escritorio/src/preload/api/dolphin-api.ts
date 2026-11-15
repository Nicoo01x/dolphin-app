import type { FondoPropioElegido } from '../../shared/fondo-del-chat-ipc'
import type { DolphinForgetResult, DolphinRememberResult } from '../../shared/dolphin-memoria-types'
import type {
  DolphinConsoleResult,
  DolphinLiveRequest,
  DolphinLiveResult,
  DolphinPortonRevision,
  DolphinPortonResult
} from '../../shared/dolphin-console-types'
import type {
  AsuntoDeIsla,
  EstudioDeIsla,
  EscrituraDesdeIsla,
  PedidoDeEstudio,
  PedidoDeEscritura,
  PreferenciasDeIsla,
  RespuestaDeEscritura,
  RespuestaDeEstudio,
  ResultadoDeEscritura
} from '../../shared/dolphin-isla-types'
import type {
  OrchestrationDashboard,
  OrchestrationDashboardGate
} from '../../shared/orchestration-dashboard'
import type { DolphinChoquesResult } from '../../shared/dolphin-choques'
import type { DolphinBucleEvento } from '../../shared/dolphin-bucles-types'
import type {
  PedidoDeMoverTarjeta,
  TableroLeido,
  TarjetaMovida
} from '../../shared/dolphin-tablero-types'
import type {
  DolphinBugAvance,
  DolphinBugFailureCode,
  DolphinBugRequest,
  DolphinBugTerminado
} from '../../shared/dolphin-bug-types'

export type DolphinApi = {
  orquestacionTablero: () => Promise<OrchestrationDashboard>
  orquestacionChoques?: () => Promise<DolphinChoquesResult>
  orquestacionResolverGate: (request: {
    gateId: string
    decision: string
  }) => Promise<OrchestrationDashboardGate>
  orquestacionAbrir: () => Promise<void>
  /** «Recordar esto» desde un mensaje del chat: entra activo a la memoria del proyecto. */
  recordarEnMemoria: (request: {
    worktreeId: string
    text: string
    porQue: string
  }) => Promise<DolphinRememberResult>
  olvidarDeMemoria: (request: { worktreeId: string; id: string }) => Promise<DolphinForgetResult>
  /** El tablero (tarjetas por columna) del repo de ese worktree, sólo lectura: es el vacío del área principal. */
  leerTablero?: (worktreeId: string) => Promise<TableroLeido>
  /** Le pide al núcleo que pase esa tarjeta a otra columna (arrastrarla en el tablero del inicio). */
  moverTarjeta?: (pedido: PedidoDeMoverTarjeta) => Promise<TarjetaMovida>
  /** «Elegir una imagen…» del fondo del chat: la copia al perfil y devuelve su nombre. */
  elegirFondoDelChat?: () => Promise<FondoPropioElegido>
  /** Los bytes de un fondo propio ya copiado al perfil, o null si no está. */
  leerFondoDelChat?: (nombre: string) => Promise<ArrayBuffer | null>
  /** La carpeta personal (os.homedir() del proceso principal), o null si no se puede saber. */
  carpetaPersonal?: () => Promise<string | null>
  onAbrirOrquestacion: (callback: () => void) => () => void
  /** X-ray: prende o apaga la capa para señalar un control de cualquier app (Ctrl+Alt+X). */
  alternarXray: () => Promise<void>
  /** Main pide mandarle al agente activo lo que se señaló con X-ray. */
  onXrayEnviar: (callback: (pedido: { id: string; prompt: string }) => void) => () => void
  confirmarXray: (respuesta: { id: string; ok: boolean }) => Promise<void>
  reportarBug: (request: DolphinBugRequest) => Promise<{
    ok: boolean
    id?: string
    code?: DolphinBugFailureCode
    detail?: string
  }>
  onXrayBug: (
    callback: (pedido: Pick<DolphinBugRequest, 'id' | 'que' | 'elemento'>) => void
  ) => () => void
  onXrayBugAvance: (callback: (avance: DolphinBugAvance) => void) => () => void
  onXrayBugTerminado: (callback: (terminado: DolphinBugTerminado) => void) => () => void
  /** Levanta (o reusa) la consola de Dolphin del repo y devuelve su URL local. */
  openConsole: (repoPath: string) => Promise<DolphinConsoleResult>
  /** El modo live: le pasa a Dolphin el elemento que se tocó y lo que se pidió cambiarle. */
  live: (request: DolphinLiveRequest) => Promise<DolphinLiveResult>
  /** El portón a mano: arranca una pasada por las fases del repo sobre esa carpeta (o contesta la que corre). */
  porton: (repoPath: string, revision?: DolphinPortonRevision) => Promise<DolphinPortonResult>
  /** Cómo va el portón a mano de esa carpeta. */
  portonState: (repoPath: string) => Promise<DolphinPortonResult>
  /** La carpeta con las skills propias de Dolphin; null donde main no la pasó (el cliente web). */
  skillsDir: string | null
  /** Abre la isla, o la cierra si está abierta (también con Ctrl+Alt+D desde cualquier app). */
  alternarIsla: () => Promise<void>
  /** Desde la isla: el tamaño que necesita su forma (compacta, aviso o abierta), en sus píxeles. */
  tamanoDeIsla: (ancho: number, alto: number) => Promise<void>
  /** Desde la isla: mueve la ventana con el delta del puntero y guarda al soltar. */
  moverIsla: (deltaX: number, deltaY: number, soltar: boolean) => Promise<void>
  /** Devuelve la isla arriba y al centro de la pantalla principal. */
  volverArribaIsla: () => Promise<void>
  /** Desde la isla: el puntero entró o salió de la forma (fuera de ella, el mouse pasa de largo). */
  ratonEnIsla: (encima: boolean) => Promise<void>
  /** Desde la isla: le escribe a ese agente y dice si la terminal lo aceptó, o por qué no. */
  escribirDesdeIsla: (escritura: EscrituraDesdeIsla) => Promise<ResultadoDeEscritura>
  /** Desde la isla: lo abierto en la bandeja de Dolphin de cada repo. */
  bandejaDeIsla: () => Promise<AsuntoDeIsla[]>
  /** Desde la isla: archivos tocados por los agentes del último tablero. */
  estudioDeIsla: () => Promise<EstudioDeIsla>
  /** Desde la isla: cómo la armó cada uno y su nota, guardadas por main. */
  preferenciasDeIsla: () => Promise<PreferenciasDeIsla | null>
  guardarPreferenciasDeIsla: (parcial: PreferenciasDeIsla) => Promise<void>
  /** En la ventana principal: lo que se escribió en la isla, para tipearlo en su terminal. */
  onEscribirDesdeIsla: (callback: (pedido: PedidoDeEscritura) => void) => () => void
  onPedirEstudio: (callback: (pedido: PedidoDeEstudio) => void) => () => void
  onBucle?: (callback: (evento: DolphinBucleEvento) => void) => () => void
  /** En la ventana principal: cómo le fue a esa escritura. */
  confirmarEscrituraDesdeIsla: (respuesta: RespuestaDeEscritura) => Promise<void>
  confirmarEstudioDesdeIsla: (respuesta: RespuestaDeEstudio) => Promise<void>
}
