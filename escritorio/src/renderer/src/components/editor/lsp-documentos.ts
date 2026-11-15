import { camposDe, mismaRuta, uriDeArchivo } from '../../../../shared/lsp/a-monaco'

/**
 * Los archivos que el editor tiene abiertos con el LSP, por el uri de su modelo de Monaco.
 *
 * Es lo que permite registrar los proveedores UNA vez por lenguaje: Monaco le pasa al proveedor el
 * modelo que se está mirando, y con el uri de ese modelo se encuentra acá qué archivo es. Hasta el
 * 11/11 cada editor montado registraba los suyos y cada uno preguntaba por el archivo donde se
 * había instalado, así que con dos archivos abiertos se mezclaban las respuestas.
 *
 * También cuenta editores: dos vistas del mismo archivo comparten modelo, y el servidor tiene que
 * ver un solo `didOpen` y un solo `didClose`, el del último que se cierra.
 */

/** Si hay un servidor contestando por el archivo. `esperando` es mientras arranca. */
export type EstadoDelServidor = 'esperando' | 'vivo' | 'sin'

export type DocumentoLsp = {
  readonly uriDelModelo: string
  readonly ruta: string
  readonly lenguaje: string
  /** El uri con el que se le habla al servidor. Siempre `uriDeArchivo(ruta)`. */
  readonly uri: string
  readonly estado: EstadoDelServidor
  readonly servidor?: { readonly id: string; readonly raiz: string }
  readonly editores: number
}

export class DocumentosLsp {
  private readonly porModelo = new Map<string, DocumentoLsp>()

  /** Un editor más mirando ese modelo. `esNuevo` dice si hay que abrirlo en el servidor. */
  sumar(
    uriDelModelo: string,
    ruta: string,
    lenguaje: string
  ): { documento: DocumentoLsp; esNuevo: boolean } {
    const yaEsta = this.porModelo.get(uriDelModelo)
    if (yaEsta) {
      const documento = { ...yaEsta, editores: yaEsta.editores + 1 }
      this.porModelo.set(uriDelModelo, documento)
      return { documento, esNuevo: false }
    }
    const documento: DocumentoLsp = {
      uriDelModelo,
      ruta,
      lenguaje,
      uri: uriDeArchivo(ruta),
      estado: 'esperando',
      editores: 1
    }
    this.porModelo.set(uriDelModelo, documento)
    return { documento, esNuevo: true }
  }

  /** Un editor menos. Devuelve el documento si era el último y hay que cerrarlo en el servidor. */
  restar(uriDelModelo: string): DocumentoLsp | null {
    const documento = this.porModelo.get(uriDelModelo)
    if (!documento) {
      return null
    }
    if (documento.editores > 1) {
      this.porModelo.set(uriDelModelo, { ...documento, editores: documento.editores - 1 })
      return null
    }
    this.porModelo.delete(uriDelModelo)
    return documento
  }

  delModelo(uriDelModelo: string): DocumentoLsp | undefined {
    return this.porModelo.get(uriDelModelo)
  }

  /** El documento abierto de esa ruta, venga la ruta en la forma en que la mande el servidor. */
  deLaRuta(ruta: string): DocumentoLsp | undefined {
    for (const documento of this.porModelo.values()) {
      if (mismaRuta(documento.ruta, ruta)) {
        return documento
      }
    }
    return undefined
  }

  /** Lo que contestó `lsp:abrir`: con servidor, o el motivo por el que no hay. */
  marcarApertura(uriDelModelo: string, respuesta: unknown): void {
    const documento = this.porModelo.get(uriDelModelo)
    if (!documento) {
      return
    }
    const pieza = camposDe(respuesta)
    const conServidor =
      pieza.sinServidor === false && typeof pieza.servidor === 'string'
        ? { id: pieza.servidor, raiz: typeof pieza.raiz === 'string' ? pieza.raiz : '' }
        : null
    this.porModelo.set(uriDelModelo, {
      ...documento,
      estado: conServidor ? 'vivo' : 'sin',
      ...(conServidor ? { servidor: conServidor } : {})
    })
  }

  /** Una pregunta volvió diciendo que no hay servidor: el que había ya no está. */
  marcarSinServidor(uriDelModelo: string): void {
    const documento = this.porModelo.get(uriDelModelo)
    if (documento && documento.estado !== 'sin') {
      this.porModelo.set(uriDelModelo, { ...documento, estado: 'sin' })
    }
  }

  /** Se cayó un servidor. Devuelve los lenguajes que se quedaron sin él. */
  marcarCaida(servidorId: string, raiz: string): string[] {
    const lenguajes = new Set<string>()
    for (const documento of this.porModelo.values()) {
      const suyo =
        documento.servidor?.id === servidorId &&
        (!documento.servidor.raiz || mismaRuta(documento.servidor.raiz, raiz))
      if (suyo && documento.estado === 'vivo') {
        this.porModelo.set(documento.uriDelModelo, { ...documento, estado: 'sin' })
        lenguajes.add(documento.lenguaje)
      }
    }
    return [...lenguajes]
  }

  /** Si algún archivo abierto de ese lenguaje tiene un servidor contestando. */
  hayServidorPara(lenguaje: string): boolean {
    for (const documento of this.porModelo.values()) {
      if (documento.lenguaje === lenguaje && documento.estado === 'vivo') {
        return true
      }
    }
    return false
  }

  cuantosDe(lenguaje: string): number {
    let cuantos = 0
    for (const documento of this.porModelo.values()) {
      if (documento.lenguaje === lenguaje) {
        cuantos += 1
      }
    }
    return cuantos
  }

  get vacio(): boolean {
    return this.porModelo.size === 0
  }
}
