import {
  camposDe,
  esRangoLsp,
  hoverAMarkdown,
  rangoAMonaco,
  type RangoLsp,
  type RangoMonaco
} from '../../../../shared/lsp/a-monaco'

/**
 * Lo que un servidor manda para CAMBIAR archivos —renombrar, un arreglo rápido— traducido a lo
 * que Monaco sabe aplicar, y la ayuda de firmas. Puro: se prueba sin editor.
 *
 * La regla que manda acá: **Monaco suelto sólo edita modelos que están abiertos.** Una edición de
 * un archivo sin pestaña hace fallar la operación entera ("model not found"). Aplicar sólo la parte
 * de los abiertos sería peor: un renombre a medias deja el proyecto sin compilar. Así que si algo
 * toca un archivo cerrado, no se aplica nada y se dice cuál falta abrir.
 */

export type EdicionParaMonaco = {
  readonly uriDelModelo: string
  readonly range: RangoMonaco
  readonly text: string
}

export type EdicionDeWorkspace =
  | { readonly tipo: 'lista'; readonly ediciones: readonly EdicionParaMonaco[] }
  /** Toca archivos sin pestaña abierta (o crea/borra/mueve archivos): no se aplica nada. */
  | { readonly tipo: 'no-se-puede'; readonly archivos: readonly string[] }

type EdicionLsp = { readonly range: RangoLsp; readonly newText: string }

/** Las `TextEdit` bien formadas de una lista; una rota no se aplica a ciegas. */
function edicionesDe(lista: unknown): EdicionLsp[] {
  return (Array.isArray(lista) ? lista : []).flatMap((una) => {
    const edicion = camposDe(una)
    return esRangoLsp(edicion.range) && typeof edicion.newText === 'string'
      ? [{ range: edicion.range, newText: edicion.newText }]
      : []
  })
}

/**
 * Un `WorkspaceEdit` de LSP, en cualquiera de sus dos formas (`changes` o `documentChanges`).
 * `modeloDe` dice el uri del modelo abierto para un uri del servidor, o null si no hay pestaña.
 */
export function edicionDeWorkspace(
  crudo: unknown,
  modeloDe: (uriLsp: string) => string | null
): EdicionDeWorkspace {
  const pieza = camposDe(crudo)
  const porArchivo: [string, readonly EdicionLsp[]][] = []
  const archivosQueNo: string[] = []
  if (Array.isArray(pieza.documentChanges)) {
    for (const uno of pieza.documentChanges) {
      const cambio = camposDe(uno)
      const uri = camposDe(cambio.textDocument).uri
      if (cambio.kind !== undefined || typeof uri !== 'string' || !Array.isArray(cambio.edits)) {
        // Crear, mover o borrar archivos: Monaco suelto no tiene cómo.
        archivosQueNo.push(typeof cambio.uri === 'string' ? cambio.uri : String(uri ?? ''))
        continue
      }
      porArchivo.push([uri, edicionesDe(cambio.edits)])
    }
  } else {
    for (const [uri, deEse] of Object.entries(camposDe(pieza.changes))) {
      porArchivo.push([uri, edicionesDe(deEse)])
    }
  }
  const ediciones: EdicionParaMonaco[] = []
  for (const [uri, deEse] of porArchivo) {
    const uriDelModelo = modeloDe(uri)
    if (!uriDelModelo) {
      archivosQueNo.push(uri)
      continue
    }
    for (const edicion of deEse) {
      ediciones.push({ uriDelModelo, range: rangoAMonaco(edicion.range), text: edicion.newText })
    }
  }
  return archivosQueNo.length > 0
    ? { tipo: 'no-se-puede', archivos: archivosQueNo }
    : { tipo: 'lista', ediciones }
}

export type AccionDeCodigo = {
  readonly titulo: string
  readonly clase?: string
  readonly preferida: boolean
  readonly ediciones: readonly EdicionParaMonaco[]
}

/**
 * Los arreglos rápidos que se pueden aplicar. Quedan afuera los que son sólo un comando (necesitan
 * `workspace/executeCommand`, que este cliente no implementa), los desactivados y los que tocan
 * archivos sin pestaña: mostrar un arreglo que después no hace nada es peor que no mostrarlo.
 */
export function accionesAplicables(
  crudo: unknown,
  modeloDe: (uriLsp: string) => string | null
): AccionDeCodigo[] {
  if (!Array.isArray(crudo)) {
    return []
  }
  return crudo.flatMap((una): AccionDeCodigo[] => {
    const accion = camposDe(una)
    if (typeof accion.title !== 'string' || !accion.edit || accion.disabled) {
      return []
    }
    const edicion = edicionDeWorkspace(accion.edit, modeloDe)
    if (edicion.tipo !== 'lista' || edicion.ediciones.length === 0) {
      return []
    }
    return [
      {
        titulo: accion.title,
        ...(typeof accion.kind === 'string' ? { clase: accion.kind } : {}),
        preferida: accion.isPreferred === true,
        ediciones: edicion.ediciones
      }
    ]
  })
}

export type AyudaDeFirmas = {
  readonly signatures: {
    readonly label: string
    readonly documentation?: { readonly value: string }
    readonly parameters: {
      readonly label: string | [number, number]
      readonly documentation?: { readonly value: string }
    }[]
    readonly activeParameter?: number
  }[]
  readonly activeSignature: number
  readonly activeParameter: number
}

/** `textDocument/signatureHelp` a lo que dibuja Monaco; null si no hay ninguna firma. */
export function ayudaDeFirmas(crudo: unknown): AyudaDeFirmas | null {
  const pieza = camposDe(crudo)
  if (!Array.isArray(pieza.signatures) || pieza.signatures.length === 0) {
    return null
  }
  const documentacion = (valor: unknown) => {
    const texto = hoverAMarkdown(valor)
    return texto ? { documentation: { value: texto } } : {}
  }
  const signatures = pieza.signatures.map((una: unknown) => {
    const firma = camposDe(una)
    const parametros: unknown[] = Array.isArray(firma.parameters) ? firma.parameters : []
    return {
      label: String(firma.label ?? ''),
      ...documentacion(firma.documentation),
      parameters: parametros.map((uno) => {
        const parametro = camposDe(uno)
        const etiqueta: string | [number, number] = Array.isArray(parametro.label)
          ? [Number(parametro.label[0]), Number(parametro.label[1])]
          : String(parametro.label ?? '')
        return { label: etiqueta, ...documentacion(parametro.documentation) }
      }),
      ...(typeof firma.activeParameter === 'number'
        ? { activeParameter: firma.activeParameter }
        : {})
    }
  })
  return {
    signatures,
    activeSignature: typeof pieza.activeSignature === 'number' ? pieza.activeSignature : 0,
    activeParameter: typeof pieza.activeParameter === 'number' ? pieza.activeParameter : 0
  }
}
