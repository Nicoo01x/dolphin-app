import { ipcRenderer } from 'electron'

/**
 * El puente del LSP hacia el editor.
 *
 * Son los mismos tres verbos del lado de main, más la escucha de diagnósticos, que es lo único
 * que el servidor empuja por su cuenta. `alDiagnosticar` devuelve con qué dejar de escuchar: sin
 * eso, cada editor que se abre y se cierra deja un escucha más y los diagnósticos se pintan tantas
 * veces como editores se hayan abierto en la sesión.
 */
export type LspApi = {
  abrir: (pedido: { ruta: string; lenguaje: string; texto: string }) => Promise<unknown>
  cambio: (pedido: { ruta: string; lenguaje: string; texto: string }) => void
  cerrar: (pedido: { ruta: string; lenguaje: string }) => void
  preguntar: (pedido: {
    ruta: string
    lenguaje: string
    metodo: string
    params: unknown
  }) => Promise<{ resultado?: unknown } | null>
  alDiagnosticar: (
    escuchar: (datos: { ruta: string; diagnosticos: unknown[] }) => void
  ) => () => void
  /** Un servidor que estaba andando se cerró; los archivos de esa raíz se quedan sin servidor. */
  alCaerseServidor?: (escuchar: (datos: { servidor: string; raiz: string }) => void) => () => void
}

export const lspApi: LspApi = {
  abrir: (pedido) => ipcRenderer.invoke('lsp:abrir', pedido),
  cambio: (pedido) => ipcRenderer.send('lsp:cambio', pedido),
  cerrar: (pedido) => ipcRenderer.send('lsp:cerrar', pedido),
  preguntar: (pedido) => ipcRenderer.invoke('lsp:preguntar', pedido),
  alDiagnosticar: (escuchar) => {
    const oyente = (_evento: unknown, datos: { ruta: string; diagnosticos: unknown[] }): void =>
      escuchar(datos)
    ipcRenderer.on('lsp:diagnosticos', oyente)
    return () => void ipcRenderer.removeListener('lsp:diagnosticos', oyente)
  },
  alCaerseServidor: (escuchar) => {
    const oyente = (_evento: unknown, datos: { servidor: string; raiz: string }): void =>
      escuchar(datos)
    ipcRenderer.on('lsp:servidorCaido', oyente)
    return () => void ipcRenderer.removeListener('lsp:servidorCaido', oyente)
  }
}
