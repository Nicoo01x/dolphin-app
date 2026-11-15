/**
 * El puente del LSP: el editor pregunta desde el renderer y el servidor de lenguaje contesta desde
 * acá, donde se puede abrir un proceso.
 *
 * Son tres verbos y nada más —abrir un archivo, avisar que cambió, preguntar algo— porque todo lo
 * que un proveedor de Monaco necesita es exactamente eso. Los métodos de LSP viajan por su nombre
 * en vez de tener un canal por cada uno: la lista de lo que un servidor sabe hacer la decide el
 * servidor, no nosotros, y un canal por método quedaría viejo con cada versión del protocolo.
 *
 * Lo que NO viaja: el `initialize`. Lo hace el administrador al arrancar cada servidor, con las
 * capacidades que este cliente realmente implementa; dejar que el renderer las declare sería
 * prometer lo que no cumple.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { ServidoresVivos, type SinServidor } from '../lsp/servidores-vivos'
import { rutaDeUri, uriDeArchivo } from '../../shared/lsp/a-monaco'

/** Lo que se le contesta al renderer cuando no hay servidor: el motivo, ya en palabras. */
export type RespuestaSinServidor = {
  readonly sinServidor: true
  readonly motivo: SinServidor['motivo']
  /** El programa que se buscó: es lo que la persona reconoce («typescript-language-server»). */
  readonly comando?: string
  /** Cómo se instala, cuando falta: es lo único accionable que se puede decir. */
  readonly comoSeInstala?: string
  /** Lo que dijo el servidor al fallar el arranque, tal cual. */
  readonly detalle?: string
}

function enPalabras(sin: SinServidor): RespuestaSinServidor {
  return {
    sinServidor: true,
    motivo: sin.motivo,
    ...('servidor' in sin
      ? { comando: sin.servidor.comando, comoSeInstala: sin.servidor.comoSeInstala }
      : {}),
    ...('detalle' in sin ? { detalle: sin.detalle } : {})
  }
}

export function registrarLsp(ventana: () => BrowserWindow | null): { apagar: () => Promise<void> } {
  const vivos = new ServidoresVivos(
    (_raiz, datos) => {
      // Los diagnósticos los empuja el servidor cuando quiere, así que no pueden ser una respuesta:
      // se mandan al renderer, que los pinta sobre el archivo que nombran.
      ventana()?.webContents.send('lsp:diagnosticos', {
        ruta: rutaDeUri(datos.uri),
        diagnosticos: datos.diagnosticos
      })
    },
    {
      alCaerse: (servidor, raiz) =>
        ventana()?.webContents.send('lsp:servidorCaido', { servidor, raiz })
    }
  )

  ipcMain.handle(
    'lsp:abrir',
    async (_evento, pedido: { ruta: string; lenguaje: string; texto: string }) => {
      const listo = await vivos.para(pedido.ruta, pedido.lenguaje)
      if (!('cliente' in listo)) {
        return enPalabras(listo)
      }
      listo.cliente.abrirArchivo(uriDeArchivo(pedido.ruta), pedido.lenguaje, pedido.texto)
      // La raíz viaja para que el editor sepa qué archivos se quedan sin servidor si este se cae.
      return { sinServidor: false as const, servidor: listo.servidor.id, raiz: listo.raiz }
    }
  )

  ipcMain.on('lsp:cambio', (_evento, pedido: { ruta: string; lenguaje: string; texto: string }) => {
    // Un cambio no arranca un servidor: si no hay uno andando, es que este archivo no tiene.
    vivos
      .yaAndando(pedido.ruta, pedido.lenguaje)
      ?.cliente.cambioArchivo(uriDeArchivo(pedido.ruta), pedido.texto)
  })

  ipcMain.on('lsp:cerrar', (_evento, pedido: { ruta: string; lenguaje: string }) => {
    vivos.yaAndando(pedido.ruta, pedido.lenguaje)?.cliente.cerrarArchivo(uriDeArchivo(pedido.ruta))
  })

  ipcMain.handle(
    'lsp:preguntar',
    async (
      _evento,
      pedido: { ruta: string; lenguaje: string; metodo: string; params: unknown }
    ) => {
      const listo = vivos.yaAndando(pedido.ruta, pedido.lenguaje)
      if (!listo) {
        return { sinServidor: true as const, motivo: 'no-arranco' as const }
      }
      try {
        return {
          sinServidor: false as const,
          resultado: await listo.cliente.preguntar(pedido.metodo, pedido.params)
        }
      } catch (error) {
        // Una pregunta que falla no puede tirar al editor: se contesta nada y el proveedor de
        // Monaco se queda sin resultado, que es lo mismo que si el servidor no supiera.
        return {
          sinServidor: false as const,
          resultado: null,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  return { apagar: () => vivos.apagarTodos() }
}
