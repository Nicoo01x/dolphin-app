import type {
  AvanceDeLlevar,
  CharlaConDelfin,
  InstantaneaDeDelfin,
  ManadaLeida,
  PedidoDeCrearDelfin,
  PedidoDeHablar,
  PedidoDeLlevar,
  RespuestaDelDelfin,
  Resultado,
  ResultadoDeLlevar,
  RevisionDelServidor
} from '../../shared/delfines-types'

/** Dolphin, sólo escritorio: los bots (`dolphin bots`), acá o en tu servidor. */
export type DelfinesApi = {
  listar: () => Promise<ManadaLeida>
  crear: (pedido: PedidoDeCrearDelfin) => Promise<Resultado<{ bot: InstantaneaDeDelfin }>>
  hablar: (pedido: PedidoDeHablar) => Promise<Resultado<{ respuesta: RespuestaDelDelfin }>>
  charla: (pedido: {
    id: string
    hostId?: `ssh:${string}`
  }) => Promise<Resultado<{ charla: CharlaConDelfin[] }>>
  revisar: (pedido: {
    id: string
    hostId: `ssh:${string}`
  }) => Promise<Resultado<{ revision: RevisionDelServidor }>>
  llevar: (pedido: PedidoDeLlevar) => Promise<ResultadoDeLlevar>
  alAvanzar: (callback: (avance: AvanceDeLlevar) => void) => () => void
}
