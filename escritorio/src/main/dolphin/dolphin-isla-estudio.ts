import { randomUUID } from 'node:crypto'
import type { EstudioDeIsla, PedidoDeEstudio, RespuestaDeEstudio } from '../../shared/dolphin-isla-types'

const ESPERA_MAXIMA_MS = 5_000
const SIN_DATOS: EstudioDeIsla = { disponible: false, agentes: [] }
const pendientes = new Map<string, (estudio: EstudioDeIsla) => void>()

export function pedirEstudio(
  enviar: (pedido: PedidoDeEstudio) => boolean,
  paneKeys: readonly string[] = [],
  esperaMs = ESPERA_MAXIMA_MS
): Promise<EstudioDeIsla> {
  const id = randomUUID()
  return new Promise((resolver) => {
    const vencido = setTimeout(() => {
      if (pendientes.delete(id)) {
        resolver(SIN_DATOS)
      }
    }, esperaMs)
    vencido.unref?.()
    pendientes.set(id, (estudio) => {
      clearTimeout(vencido)
      resolver(estudio)
    })
    if (!enviar({ id, paneKeys: [...paneKeys] })) {
      recibirRespuestaDeEstudio({ id, estudio: SIN_DATOS })
    }
  })
}

export function recibirRespuestaDeEstudio(respuesta: RespuestaDeEstudio): void {
  const resolver = pendientes.get(respuesta.id)
  if (resolver) {
    pendientes.delete(respuesta.id)
    resolver(respuesta.estudio)
  }
}

