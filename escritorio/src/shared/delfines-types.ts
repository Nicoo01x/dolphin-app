/**
 * Los delfines: los bots de Dolphin (`dolphin bots`) vistos desde la app. Lo que viaja por IPC entre
 * main, que le habla al núcleo (acá o por SSH en tu servidor), y la página «Delfines».
 */

export const PLANTILLAS_DE_DELFIN = ['vigia', 'parte', 'investigador', 'escritor'] as const
export type PlantillaDeDelfin = (typeof PLANTILLAS_DE_DELFIN)[number]

export type MotorDeDelfin = 'claude' | 'codex' | 'mentira'
export type PermisoDeDelfin = 'preguntar' | 'leer' | 'carpeta' | 'libre'

/** Un bot tal como lo imprime `dolphin bots --json` (ver `src/bots/instantanea.ts` del núcleo). */
export type InstantaneaDeDelfin = {
  id: string
  nombre: string
  motor: MotorDeDelfin
  permiso: PermisoDeDelfin
  dir: string
  carpeta: string
  corriendo: boolean
  pausa?: string
  proxima?: { cuando: string; tarea: string; latido: boolean }
  gasto: { usd: number; corridas: number }
  tope?: { usd?: number; corridas?: number }
  ultimo?: { cuando: string; texto: string }
  pendiente?: string
  telegram: boolean
}

export type ManadaDelNucleo = {
  servicio: { vivo: boolean; desde?: string }
  carpeta: string
  bots: InstantaneaDeDelfin[]
  rotos: { id: string; error: string }[]
}

/** Dónde corre: en esta computadora, o en un servidor conectado por SSH. */
export type DondeCorre =
  | { tipo: 'aca' }
  | {
      tipo: 'servidor'
      hostId: `ssh:${string}`
      nombre: string
      /** El servidor no contestó ahora: el estado que se ve es el último conocido. */
      sinRespuesta?: boolean
    }

export type Delfin = InstantaneaDeDelfin & { donde: DondeCorre }

export type FalloDeDelfines =
  /** La app no encontró el núcleo de Dolphin (ni el clon ni el construido del instalador). */
  | 'sin-nucleo'
  /** El núcleo contestó con un error: el detalle es su mensaje. */
  | 'nucleo'
  | 'pedido-invalido'
  | 'sin-conexion'

export type ManadaLeida =
  | {
      ok: true
      /** El servicio de bots de esta computadora. */
      servicioVivo: boolean
      bots: Delfin[]
      rotos: { id: string; error: string }[]
    }
  | { ok: false; code: FalloDeDelfines; detail?: string }

export type PedidoDeCrearDelfin = {
  nombre: string
  plantilla: PlantillaDeDelfin
  /** Dónde va a trabajar; sin ella, la carpeta personal. */
  carpeta?: string
}

export type Resultado<T> =
  | ({ ok: true } & T)
  | { ok: false; code: FalloDeDelfines; detail?: string }

export type CharlaConDelfin = {
  cuando: string
  quien: 'vos' | 'bot' | 'rutina' | 'sistema'
  texto: string
}

export type PedidoDeHablar = { id: string; texto: string; hostId?: `ssh:${string}` }

export type RespuestaDelDelfin = {
  texto: string
  nada: boolean
  pidePermiso?: string
  pausado?: boolean
}

/** Cada cosa que tiene que estar en el servidor para que el bot corra ahí 24/7. */
export type PasoDelServidor = 'sistema' | 'node' | 'motor' | 'systemd' | 'linger'

export type EstadoDePaso =
  | { paso: PasoDelServidor; estado: 'ok'; detalle?: string }
  /** Falta y Dolphin no lo puede hacer solo: `comando` es lo que tiene que correr la persona. */
  | { paso: PasoDelServidor; estado: 'falta'; detalle?: string; comando?: string }
  /** No frena, pero el bot no queda como se pidió (sin linger, se apaga al cerrar la sesión). */
  | { paso: PasoDelServidor; estado: 'aviso'; detalle?: string; comando?: string }

export type RevisionDelServidor = {
  hostId: `ssh:${string}`
  nombre: string
  pasos: EstadoDePaso[]
  /** Todo lo que bloquea está bien: se puede llevar. */
  listo: boolean
  /** La carpeta donde va a trabajar el bot si nadie la cambia. */
  carpetaSugerida: string
}

export type PedidoDeLlevar = {
  id: string
  hostId: `ssh:${string}`
  /** Dónde trabaja en el servidor. */
  carpeta: string
}

/** Lo que se va haciendo mientras se lleva un bot, en orden. */
export const ETAPAS_DE_LLEVAR = [
  'revisar',
  'nucleo',
  'bot',
  'instalar',
  'verificar',
  'apartar'
] as const
export type EtapaDeLlevar = (typeof ETAPAS_DE_LLEVAR)[number]

export type AvanceDeLlevar = { id: string; etapa: EtapaDeLlevar }

export type ResultadoDeLlevar =
  | { ok: true; linger: boolean }
  | { ok: false; etapa: EtapaDeLlevar; detail: string; revision?: RevisionDelServidor }

export type ServidorParaDelfines = { hostId: `ssh:${string}`; nombre: string }
