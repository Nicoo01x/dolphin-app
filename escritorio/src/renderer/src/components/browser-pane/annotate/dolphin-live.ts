import type { BrowserPageAnnotation } from '../../../../../shared/browser/element-grab/browser-grab-types'
import type {
  DolphinLiveRequest,
  DolphinLiveResult
} from '../../../../../shared/dolphin-console-types'

/**
 * Una anotación del navegador como un toque del modo live de Dolphin: el comentario es lo que
 * se pide, y el elemento va como lo vio el navegador —dónde, selector, texto, HTML, archivo y
 * estilos—. La captura no viaja: la anotación ya la descartó (ver browser-annotation-geometry).
 */
export function annotationToDolphinLive(
  annotation: BrowserPageAnnotation,
  repoPath: string
): DolphinLiveRequest {
  const { page, target } = annotation.payload
  const texto = target.selectedText?.trim() || target.textSnippet.trim()
  const estilos = Object.fromEntries(
    Object.entries(target.computedStyles).filter(
      ([, valor]) => typeof valor === 'string' && valor !== ''
    )
  )
  return {
    repoPath,
    pedido: annotation.comment.trim(),
    elemento: {
      url: page.sanitizedUrl,
      selector: target.selector,
      ...(texto ? { texto } : {}),
      ...(target.htmlSnippet ? { html: target.htmlSnippet } : {}),
      ...(target.sourceFile ? { fuente: target.sourceFile } : {}),
      ...(Object.keys(estilos).length > 0 ? { estilos } : {})
    }
  }
}

export type DolphinLiveSendResult = {
  /** Las que llegaron, en orden: se sacan de la bandeja; las demás quedan para mandarlas de nuevo. */
  sent: BrowserPageAnnotation[]
  url?: string
  failure?: Extract<DolphinLiveResult, { ok: false }>
}

/**
 * Manda cada anotación como un toque, en orden, y corta en la primera que falla diciendo por
 * qué. Una anotación sin comentario no tiene nada que pedir: se saltea.
 */
export async function sendAnnotationsToDolphin(
  annotations: readonly BrowserPageAnnotation[],
  repoPath: string,
  live: (request: DolphinLiveRequest) => Promise<DolphinLiveResult>
): Promise<DolphinLiveSendResult> {
  const sent: BrowserPageAnnotation[] = []
  let url: string | undefined
  for (const annotation of annotations) {
    if (!annotation.comment.trim()) {
      continue
    }
    const result = await live(annotationToDolphinLive(annotation, repoPath))
    if (!result.ok) {
      return { sent, ...(url ? { url } : {}), failure: result }
    }
    sent.push(annotation)
    url = result.url
  }
  if (sent.length === 0) {
    return { sent, failure: { ok: false, code: 'nothing-to-send' } }
  }
  return { sent, ...(url ? { url } : {}) }
}
