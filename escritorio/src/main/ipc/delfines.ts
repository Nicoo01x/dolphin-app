import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { z } from 'zod'
import type { Store } from '../persistence/loading-store/store'
import { PLANTILLAS_DE_DELFIN, type ResultadoDeLlevar } from '../../shared/delfines-types'
import { nucleoLocal } from '../delfines/delfines-nucleo'
import { remotoPorSsh, type Remoto } from '../delfines/delfines-remoto'
import { registroEn } from '../delfines/delfines-registro'
import { huellaDelNucleo } from '../delfines/delfines-huella'
import { crearServicioDeDelfines } from '../delfines/delfines-servicio'
import { connectionManager } from './ssh/ssh-ipc-context'
import { isTrustedUIRenderer } from './ui'

/**
 * El IPC de la página «Delfines». Todo pasa por el núcleo (`dolphin bots … --json`), acá o en el
 * servidor por la conexión SSH que la app ya tiene: la app no lee ni escribe la carpeta de un bot.
 */

const HostId = z
  .string()
  .regex(/^ssh:.+$/)
  .max(300) as unknown as z.ZodType<`ssh:${string}`>
const Id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120)

const CrearSchema = z.object({
  // Un nombre que empieza con guion el CLI lo leería como una opción.
  nombre: z.string().trim().min(1).max(80).regex(/^[^-]/),
  plantilla: z.enum(PLANTILLAS_DE_DELFIN),
  carpeta: z.string().max(1000).optional()
})
const HablarSchema = z.object({
  id: Id,
  texto: z.string().trim().min(1).max(8000),
  hostId: HostId.optional()
})
const CharlaSchema = z.object({ id: Id, hostId: HostId.optional() })
const RevisarSchema = z.object({ id: Id, hostId: HostId })
const LlevarSchema = z.object({ id: Id, hostId: HostId, carpeta: z.string().max(1000) })

function servicioPara(store: Store) {
  const nucleo = nucleoLocal({ appPath: app.getAppPath() })
  const targetDe = (hostId: `ssh:${string}`): string => hostId.slice('ssh:'.length)
  // Uno por conexión: la página refresca cada 15 s, y averiguar el sistema del servidor es un viaje
  // por SSH más. Una reconexión es otra conexión, y se vuelve a averiguar.
  const remotos = new WeakMap<object, Promise<Remoto>>()
  return crearServicioDeDelfines({
    nucleo,
    registro: registroEn(join(app.getPath('userData'), 'delfines-en-servidor.json')),
    abrirRemoto: async (hostId): Promise<Remoto | null> => {
      const conexion = connectionManager?.getConnection(targetDe(hostId))
      if (!conexion || conexion.getState().status !== 'connected') {
        return null
      }
      const guardado = remotos.get(conexion)
      if (guardado) {
        return guardado
      }
      const nuevo = remotoPorSsh(conexion).then(({ remoto, plataforma }) => {
        // Sin saber el sistema no se puede subir nada: la próxima vez se pregunta de nuevo.
        if (!plataforma) {
          remotos.delete(conexion)
        }
        return remoto
      })
      remotos.set(conexion, nuevo)
      nuevo.catch(() => remotos.delete(conexion))
      return nuevo
    },
    nombreDelServidor: (hostId) => store.getSshTarget(targetDe(hostId))?.label ?? targetDe(hostId),
    huellaLocal: async () => huellaDelNucleo(await nucleo.carpeta()),
    carpetaPersonal: () => homedir()
  })
}

export function registerDelfinesHandlers(store: Store): void {
  const servicio = servicioPara(store)
  // Llevar un bot tarda minutos y no se pisa: un segundo pedido para el mismo bot espera al primero.
  const llevando = new Map<string, Promise<ResultadoDeLlevar>>()
  const invalido = { ok: false as const, code: 'pedido-invalido' as const }

  ipcMain.handle('delfines:listar', (event) =>
    isTrustedUIRenderer(event.sender) ? servicio.listar() : invalido
  )
  ipcMain.handle('delfines:crear', (event, pedido: unknown) => {
    const parsed = CrearSchema.safeParse(pedido)
    return isTrustedUIRenderer(event.sender) && parsed.success
      ? servicio.crear(parsed.data)
      : invalido
  })
  ipcMain.handle('delfines:hablar', (event, pedido: unknown) => {
    const parsed = HablarSchema.safeParse(pedido)
    return isTrustedUIRenderer(event.sender) && parsed.success
      ? servicio.hablar(parsed.data)
      : invalido
  })
  ipcMain.handle('delfines:charla', (event, pedido: unknown) => {
    const parsed = CharlaSchema.safeParse(pedido)
    return isTrustedUIRenderer(event.sender) && parsed.success
      ? servicio.charla(parsed.data.id, parsed.data.hostId)
      : invalido
  })
  ipcMain.handle('delfines:revisar', (event, pedido: unknown) => {
    const parsed = RevisarSchema.safeParse(pedido)
    if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
      return invalido
    }
    const { id, hostId } = parsed.data
    return servicio.revisar(id, {
      hostId,
      nombre: store.getSshTarget(hostId.slice(4))?.label ?? hostId
    })
  })
  ipcMain.handle(
    'delfines:llevar',
    (event, pedido: unknown): Promise<ResultadoDeLlevar> | ResultadoDeLlevar => {
      const parsed = LlevarSchema.safeParse(pedido)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return { ok: false, etapa: 'revisar', detail: 'pedido-invalido' }
      }
      const enCurso = llevando.get(parsed.data.id)
      if (enCurso) {
        return enCurso
      }
      const ventana = event.sender
      const tarea = servicio
        .llevar(parsed.data, (etapa) => {
          if (!ventana.isDestroyed()) {
            ventana.send('delfines:avance', { id: parsed.data.id, etapa })
          }
        })
        .finally(() => llevando.delete(parsed.data.id))
      llevando.set(parsed.data.id, tarea)
      return tarea
    }
  )
}
