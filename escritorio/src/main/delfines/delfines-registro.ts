import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { InstantaneaDeDelfin } from '../../shared/delfines-types'

/**
 * Qué bots se llevó la app a qué servidor, y con qué se les habla allá. Vive en la carpeta de la
 * app, no en la del bot: el bot ya no está en esta computadora (se apartó), y la página tiene que
 * poder mostrarlo aunque el servidor no conteste.
 */

export type BotEnServidor = {
  hostId: `ssh:${string}`
  nombre: string
  /** El Node y el `bin/dolphin.mjs` del servidor: con eso se le habla. */
  node: string
  bin: string
  desde: string
  /** Lo último que se supo de él, para mostrarlo cuando el servidor no está conectado. */
  ultimo?: InstantaneaDeDelfin
}

export type RegistroDeServidor = {
  leer: () => Promise<Record<string, BotEnServidor>>
  anotar: (id: string, bot: BotEnServidor) => Promise<void>
  olvidar: (id: string) => Promise<void>
}

function esBotEnServidor(valor: unknown): valor is BotEnServidor {
  if (!valor || typeof valor !== 'object') {
    return false
  }
  const v = valor as Record<string, unknown>
  return (
    typeof v.hostId === 'string' &&
    v.hostId.startsWith('ssh:') &&
    typeof v.nombre === 'string' &&
    typeof v.node === 'string' &&
    typeof v.bin === 'string' &&
    typeof v.desde === 'string'
  )
}

export function registroEn(ruta: string): RegistroDeServidor {
  let cola: Promise<unknown> = Promise.resolve()
  const leer = async (): Promise<Record<string, BotEnServidor>> => {
    try {
      const datos = JSON.parse(await readFile(ruta, 'utf8')) as { bots?: Record<string, unknown> }
      return Object.fromEntries(
        Object.entries(datos.bots ?? {}).filter((par): par is [string, BotEnServidor] =>
          esBotEnServidor(par[1])
        )
      )
    } catch {
      return {}
    }
  }
  // En fila: la página puede refrescar el último estado mientras se termina de llevar otro bot.
  const cambiar = (
    cambio: (bots: Record<string, BotEnServidor>) => Record<string, BotEnServidor>
  ): Promise<void> => {
    const siguiente = cola.then(async () => {
      const bots = cambio(await leer())
      await mkdir(dirname(ruta), { recursive: true })
      const temporal = `${ruta}.${process.pid}.tmp`
      await writeFile(temporal, `${JSON.stringify({ bots }, null, 2)}\n`, 'utf8')
      await rename(temporal, ruta)
    })
    cola = siguiente.catch(() => undefined)
    return siguiente
  }
  return {
    leer,
    anotar: (id, bot) => cambiar((bots) => ({ ...bots, [id]: bot })),
    olvidar: (id) =>
      cambiar((bots) => Object.fromEntries(Object.entries(bots).filter(([otro]) => otro !== id)))
  }
}
