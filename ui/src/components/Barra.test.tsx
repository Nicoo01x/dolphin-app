import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./Proyectos', () => ({
  SelectorDeProyecto: () => null
}))

describe('Barra embebida', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { location: { search: '?embebida=1' } })
  })

  // Las pestañas también van adentro de la app desde el 31/10: la barra lateral dejó de repetir
  // las siete vistas y quedó una sola entrada «Dolphin», así que elegir cuál se hace acá.
  it('muestra las vistas y conserva Sembrar, sin repetir la marca ni el proyecto', async () => {
    const { Barra } = await import('./Barra')
    const html = renderToStaticMarkup(
      <Barra repo="repo" alRefrescar={vi.fn()} vista="tablero" alCambiarVista={vi.fn()} alAbrirPrompt={vi.fn()} />
    )

    expect(html).toContain('aria-label="Vistas"')
    expect(html).toContain('Cosechas')
    // La marca y el selector de proyecto siguen siendo de la app: no se repiten acá.
    expect(html).not.toContain('dolphin.svg')
    expect(html).toContain('Sembrar')
    expect(html).toContain('Abrir en el navegador')
    // El Master Prompt también adentro de la app: flota sobre lo que muestre.
    expect(html).toContain('Master Prompt (P)')
  })
})
