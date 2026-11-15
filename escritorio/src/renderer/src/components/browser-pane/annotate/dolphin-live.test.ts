import { describe, expect, it, vi } from 'vitest'
import type { BrowserPageAnnotation } from '../../../../../shared/browser/element-grab/browser-grab-types'
import { annotationToDolphinLive, sendAnnotationsToDolphin } from './dolphin-live'

function annotation(
  comment: string,
  overrides: Partial<BrowserPageAnnotation['payload']['target']> = {}
): BrowserPageAnnotation {
  return {
    id: `a-${comment}`,
    browserPageId: 'page-1',
    comment,
    intent: 'change',
    priority: 'suggestion',
    createdAt: '2026-10-22T00:00:00.000Z',
    payload: {
      page: {
        sanitizedUrl: 'http://127.0.0.1:5173/ofertas',
        title: 'Ofertas',
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        capturedAt: '2026-10-22T00:00:00.000Z'
      },
      target: {
        tagName: 'button',
        selector: 'form#ofertas > button',
        textSnippet: 'Quiero recibir ofertas',
        htmlSnippet: '<button type="submit">Quiero recibir ofertas</button>',
        attributes: {},
        accessibility: {
          role: 'button',
          accessibleName: 'Quiero recibir ofertas',
          ariaLabel: null,
          ariaLabelledBy: null
        },
        rectViewport: { x: 0, y: 0, width: 200, height: 44 },
        rectPage: { x: 0, y: 0, width: 200, height: 44 },
        computedStyles: {
          display: 'block',
          position: 'static',
          width: '200px',
          height: '44px',
          margin: '0px',
          padding: '10px 16px',
          color: 'rgb(255, 255, 255)',
          backgroundColor: 'rgb(29, 29, 31)',
          border: '0px none',
          borderRadius: '999px',
          fontFamily: 'system-ui',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '24px',
          textAlign: 'center',
          zIndex: ''
        },
        ...overrides
      },
      nearbyText: [],
      ancestorPath: [],
      screenshot: null
    }
  } as BrowserPageAnnotation
}

describe('annotations as Dolphin live touches', () => {
  it('the comment is the request and the element goes as the browser saw it', () => {
    const request = annotationToDolphinLive(
      annotation('  hacelo amarillo  ', { sourceFile: 'src/Ofertas.tsx:42' }),
      'C:/repo'
    )
    expect(request).toMatchObject({
      repoPath: 'C:/repo',
      pedido: 'hacelo amarillo',
      elemento: {
        url: 'http://127.0.0.1:5173/ofertas',
        selector: 'form#ofertas > button',
        texto: 'Quiero recibir ofertas',
        html: '<button type="submit">Quiero recibir ofertas</button>',
        fuente: 'src/Ofertas.tsx:42'
      }
    })
    // Empty computed styles do not travel.
    expect(request.elemento.estilos).toMatchObject({
      backgroundColor: 'rgb(29, 29, 31)',
      borderRadius: '999px'
    })
    expect(request.elemento.estilos).not.toHaveProperty('zIndex')
    // Selected text wins over the snippet: it is what the person pointed at.
    expect(
      annotationToDolphinLive(annotation('x', { selectedText: 'ofertas' }), 'C:/repo').elemento
        .texto
    ).toBe('ofertas')
  })

  it('sends one touch per annotation, skips the ones without a request, and stops at the first failure', async () => {
    const live = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, url: 'http://127.0.0.1:4000' })
      .mockResolvedValueOnce({ ok: false, code: 'rejected', detail: 'la consola no levantó' })
    const uno = annotation('uno')
    const result = await sendAnnotationsToDolphin(
      [uno, annotation('   '), annotation('dos'), annotation('tres')],
      'C:/repo',
      live
    )
    expect(live).toHaveBeenCalledTimes(2)
    // Only the one that arrived is reported as sent: «dos» and «tres» stay in the tray.
    expect(result).toEqual({
      sent: [uno],
      url: 'http://127.0.0.1:4000',
      failure: { ok: false, code: 'rejected', detail: 'la consola no levantó' }
    })
  })

  it('with no annotation saying what to change, says so instead of sending nothing in silence', async () => {
    const live = vi.fn()
    const result = await sendAnnotationsToDolphin([annotation('')], 'C:/repo', live)
    expect(live).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: [], failure: { ok: false, code: 'nothing-to-send' } })
  })
})
