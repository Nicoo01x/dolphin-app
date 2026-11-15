import { ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import type { LocalFileAccess } from '../../../shared/file-access/local-file-access'
import { SshHostNotServedError } from '../../providers/ssh-host-not-served-error'
import { resolveLocalWriteRequestPath } from './access/local-file-access-resolution'
import {
  expresionDe,
  reemplazarEnTexto,
  type ArchivoReemplazado,
  type OpcionesDeReemplazo,
  type ResultadoDeReemplazo
} from '../../../shared/reemplazo-en-el-proyecto'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { assertLocalWriteTargetIsRegularFile } from './local-regular-file-read'
import { writeLocalTextFileWithDiskPrecondition } from './local-disk-write-precondition'

export type PedidoDeReemplazo = OpcionesDeReemplazo & {
  /** Los archivos EXACTOS que la pantalla mostró. Acá no se vuelve a buscar. */
  readonly archivos: readonly string[]
  readonly access?: LocalFileAccess
  readonly connectionId?: string
}

/**
 * Reemplazar en los archivos que la pantalla ya mostró.
 *
 * Tres decisiones, y las tres son sobre no romper un repo entero:
 *
 * 1. **La lista de archivos viene de afuera**, de los resultados que la persona vio y revisó. Si
 *    acá se volviera a buscar, lo que se escribe podría no ser lo que se aprobó: alcanza con que
 *    un agente haya guardado un archivo entre la búsqueda y el botón.
 * 2. **La consulta se valida UNA vez, antes del primer archivo.** Una regex rota descubierta en
 *    el archivo 200 deja 199 escritos y el resto no, que es el peor estado posible.
 * 3. **Un archivo que falla no corta la tanda**, pero sí se informa. Uno sin permiso de escritura
 *    en el medio de 300 no puede cancelar los otros 299, y tampoco puede desaparecer en silencio.
 *
 * Lo que decide qué texto queda está en `shared/reemplazo-en-el-proyecto.ts`, probado aparte.
 */
export function registrarReemplazoEnArchivos(context: FilesystemHandlerContext): void {
  const { store } = context

  ipcMain.handle(
    'fs:replaceInFiles',
    async (_evento, pedido: PedidoDeReemplazo): Promise<ResultadoDeReemplazo> => {
      if (pedido.connectionId) {
        throw new SshHostNotServedError(pedido.connectionId)
      }
      // Tira antes de abrir el primer archivo: con la consulta rota no se escribe nada.
      expresionDe(pedido)

      const archivos: ArchivoReemplazado[] = []
      let total = 0
      for (const pedida of pedido.archivos) {
        const hecho = await reemplazarUnArchivo(pedida, pedido, store)
        archivos.push(hecho)
        total += hecho.cuantos
      }
      return { archivos, total }
    }
  )
}

async function reemplazarUnArchivo(
  ruta: string,
  pedido: PedidoDeReemplazo,
  store: FilesystemHandlerContext['store']
): Promise<ArchivoReemplazado> {
  try {
    const resuelta = await resolveLocalWriteRequestPath(ruta, pedido.access, store)
    await assertLocalWriteTargetIsRegularFile(resuelta)
    const crudo = await readFile(resuelta)
    // Why: ripgrep no devuelve binarios, pero la lista llega del renderer y un archivo puede haber
    // cambiado desde la búsqueda. Escribir un binario como texto lo destruye sin aviso.
    if (crudo.includes(0)) {
      return { ruta, cuantos: 0, error: 'es un archivo binario' }
    }
    const { texto, cuantos } = reemplazarEnTexto(crudo.toString('utf8'), pedido)
    if (cuantos === 0) {
      return { ruta, cuantos: 0 }
    }
    await writeLocalTextFileWithDiskPrecondition(resuelta, texto, undefined)
    return { ruta, cuantos }
  } catch (error) {
    return { ruta, cuantos: 0, error: error instanceof Error ? error.message : String(error) }
  }
}
