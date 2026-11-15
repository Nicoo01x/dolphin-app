/**
 * Lo que el LSP le suma al editor: subrayado de errores, hover, ir a la definición (también a otro
 * archivo), referencias, renombrar, completado, ayuda de firmas, arreglos rápidos y formatear.
 *
 * Todo pasa por el puente del proceso principal (`main/ipc/lsp.ts`): acá no se abre ningún proceso
 * ni se habla JSON-RPC, sólo se traduce lo que Monaco pide a lo que LSP pregunta, y de vuelta.
 *
 * Una decisión que se nota al usarlo: **el servidor se arranca al abrir el primer archivo de su
 * lenguaje, no al abrir la app**. Arrancarlos todos de entrada haría que abrir Dolphin levante
 * cuatro procesos pesados que capaz no se usan; así, el costo lo paga quien abre ese archivo.
 *
 * Y si no hay servidor —no está instalado, el archivo no cuelga de un proyecto, el lenguaje no
 * tiene— el editor sigue andando exactamente como antes. Es una mejora, no un requisito. Cuando
 * falta uno que se podría tener (no instalado, o instalado y no arrancó) se avisa una vez, con el
 * motivo (`lsp-aviso-sin-servidor.ts`).
 *
 * Lo que es de todos los editores (los proveedores, uno por lenguaje; los diagnósticos; el que abre
 * otro archivo) vive en una sola sesión que nace con el primer editor y se va con el último.
 */

import type * as monacoEditor from 'monaco-editor'
import type { IDisposable, editor } from 'monaco-editor'
import { camposDe, diagnosticoAMarca, rutaDeUri } from '../../../../shared/lsp/a-monaco'
import { DocumentosLsp, type DocumentoLsp } from './lsp-documentos'
import { registrarProveedores } from './lsp-proveedores-monaco'
import { ajustarWorkerDeTs, defaultsDelWorker } from './lsp-worker-de-ts'
import { instalarAbridorDeDestinos, type AbrirUbicacion } from './lsp-abrir-destino'
import { avisarSinServidor } from './lsp-aviso-sin-servidor'

type MonacoApi = typeof monacoEditor

/** El puente, tal como lo expone el preload. */
export type PuenteLsp = {
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
  alCaerseServidor?: (escuchar: (datos: { servidor: string; raiz: string }) => void) => () => void
}

export type ArchivoDelEditor = {
  readonly ruta: string
  readonly lenguaje: string
}

const DUENO_DE_LAS_MARCAS = 'dolphin-lsp'

type Sesion = {
  readonly documentos: DocumentosLsp
  readonly proveedores: Map<string, IDisposable>
  readonly escuchasDeCambio: Map<string, IDisposable>
  readonly abridores: Map<string, AbrirUbicacion>
  readonly globales: IDisposable[]
  editores: number
}

let sesion: Sesion | null = null

function crearSesion(monaco: MonacoApi, puente: PuenteLsp): Sesion {
  const documentos = new DocumentosLsp()
  const abridores = new Map<string, AbrirUbicacion>()
  const refrescarWorker = (lenguaje: string): void =>
    ajustarWorkerDeTs(defaultsDelWorker(monaco, lenguaje), documentos.hayServidorPara(lenguaje))
  // Los subrayados: el servidor los manda cuando quiere, no cuando se le pregunta.
  const dejarDeDiagnosticar = puente.alDiagnosticar((datos) => {
    const documento = documentos.deLaRuta(datos.ruta)
    const modelo = documento && monaco.editor.getModel(monaco.Uri.parse(documento.uriDelModelo))
    if (!modelo) {
      return
    }
    monaco.editor.setModelMarkers(
      modelo,
      DUENO_DE_LAS_MARCAS,
      datos.diagnosticos.map((d) => diagnosticoAMarca(d as Parameters<typeof diagnosticoAMarca>[0]))
    )
  })
  const dejarDeEscucharCaidas = puente.alCaerseServidor?.((datos) => {
    for (const lenguaje of documentos.marcarCaida(datos.servidor, datos.raiz)) {
      refrescarWorker(lenguaje)
    }
  })
  const abridor = instalarAbridorDeDestinos({
    monaco,
    rutaDelModelo: (uriDelModelo) => documentos.delModelo(uriDelModelo)?.ruta,
    abridorDe: (idDelEditor) => abridores.get(idDelEditor)
  })
  return {
    documentos,
    proveedores: new Map(),
    escuchasDeCambio: new Map(),
    abridores,
    globales: [
      { dispose: dejarDeDiagnosticar },
      { dispose: () => dejarDeEscucharCaidas?.() },
      abridor
    ],
    editores: 0
  }
}

/** Una respuesta del puente que dice que no hay servidor andando para ese archivo. */
function diceSinServidor(respuesta: unknown): boolean {
  return camposDe(respuesta).sinServidor === true
}

/**
 * Enchufa el LSP a un editor abierto. Devuelve con qué desenchufarlo.
 *
 * `abrirUbicacion` es cómo abrir otro archivo del mismo worktree en una pestaña, para «ir a la
 * definición» hacia afuera de este archivo; sin él, ese salto no hace nada.
 */
export function instalarLsp(args: {
  readonly monaco: MonacoApi
  readonly editor: editor.IStandaloneCodeEditor
  readonly archivo: ArchivoDelEditor
  readonly puente: PuenteLsp
  readonly abrirUbicacion?: AbrirUbicacion
}): IDisposable {
  const { monaco, archivo, puente } = args
  const modelo = args.editor.getModel()
  if (!modelo) {
    return { dispose: () => {} }
  }
  const s = sesion ?? crearSesion(monaco, puente)
  sesion = s
  s.editores += 1
  const { documentos } = s
  const uriDelModelo = modelo.uri.toString()
  const idDelEditor = args.editor.getId()
  const refrescarWorker = (lenguaje: string): void =>
    ajustarWorkerDeTs(defaultsDelWorker(monaco, lenguaje), documentos.hayServidorPara(lenguaje))

  const { esNuevo } = documentos.sumar(uriDelModelo, archivo.ruta, archivo.lenguaje)
  if (args.abrirUbicacion) {
    s.abridores.set(idDelEditor, args.abrirUbicacion)
  }
  if (!s.proveedores.has(archivo.lenguaje)) {
    s.proveedores.set(
      archivo.lenguaje,
      registrarProveedores(monaco, archivo.lenguaje, {
        // Sin servidor no se pregunta: el puente contestaría que no hay, pero por IPC y en cada tecla.
        documento: (m) => {
          const doc = documentos.delModelo(m.uri.toString())
          return doc && doc.estado !== 'sin' ? doc : undefined
        },
        preguntar: async (doc: DocumentoLsp, metodo, params) => {
          const respuesta = await puente.preguntar({
            ruta: doc.ruta,
            lenguaje: doc.lenguaje,
            metodo,
            params
          })
          if (diceSinServidor(respuesta)) {
            // El servidor que había ya no está: el worker vuelve a contestar.
            documentos.marcarSinServidor(doc.uriDelModelo)
            refrescarWorker(doc.lenguaje)
            return null
          }
          return respuesta && 'resultado' in respuesta ? (respuesta.resultado ?? null) : null
        },
        modeloDe: (uriLsp) => documentos.deLaRuta(rutaDeUri(uriLsp))?.uriDelModelo ?? null
      })
    )
  }
  if (esNuevo) {
    // Dos vistas del mismo archivo comparten modelo: un solo `didOpen` y una sola escucha.
    s.escuchasDeCambio.set(
      uriDelModelo,
      modelo.onDidChangeContent(() => {
        puente.cambio({ ruta: archivo.ruta, lenguaje: archivo.lenguaje, texto: modelo.getValue() })
      })
    )
    puente.abrir({ ruta: archivo.ruta, lenguaje: archivo.lenguaje, texto: modelo.getValue() }).then(
      (respuesta) => {
        documentos.marcarApertura(uriDelModelo, respuesta)
        refrescarWorker(archivo.lenguaje)
        // Hay un servidor conocido para este lenguaje y no está o no arrancó: se dice, una vez.
        avisarSinServidor(respuesta)
      },
      () => {
        documentos.marcarSinServidor(uriDelModelo)
        refrescarWorker(archivo.lenguaje)
      }
    )
  }

  let suelto = false
  return {
    dispose: () => {
      if (suelto) {
        return
      }
      suelto = true
      s.abridores.delete(idDelEditor)
      const cerrado = documentos.restar(uriDelModelo)
      if (cerrado) {
        s.escuchasDeCambio.get(uriDelModelo)?.dispose()
        s.escuchasDeCambio.delete(uriDelModelo)
        puente.cerrar({ ruta: cerrado.ruta, lenguaje: cerrado.lenguaje })
        // El modelo puede quedar vivo (la base lo guarda para el deshacer): sin servidor que los
        // actualice, sus subrayados quedarían viejos.
        if (!modelo.isDisposed()) {
          monaco.editor.setModelMarkers(modelo, DUENO_DE_LAS_MARCAS, [])
        }
        if (documentos.cuantosDe(cerrado.lenguaje) === 0) {
          s.proveedores.get(cerrado.lenguaje)?.dispose()
          s.proveedores.delete(cerrado.lenguaje)
        }
        refrescarWorker(cerrado.lenguaje)
      }
      s.editores -= 1
      if (s.editores === 0) {
        for (const global of s.globales) {
          global.dispose()
        }
        if (sesion === s) {
          sesion = null
        }
      }
    }
  }
}
