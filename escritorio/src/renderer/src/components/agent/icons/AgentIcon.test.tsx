import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentIcon } from './AgentIcon'
import { AGENT_FAVICON_ASSETS } from './agent-favicon-assets'

describe('AgentIcon', () => {
  it('draws Codex with its own app icon, not the OpenAI knot', () => {
    const markup = renderToStaticMarkup(<AgentIcon agent="codex" size={16} />)

    expect(AGENT_FAVICON_ASSETS.codex).toMatch(/codex/)
    expect(markup).toContain(`src="${AGENT_FAVICON_ASSETS.codex}"`)
    expect(markup).toContain('width="16"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('<svg')
  })

  it('keeps Claude on its own glyph', () => {
    const markup = renderToStaticMarkup(<AgentIcon agent="claude" />)

    expect(markup).toContain('<svg')
    expect(markup).not.toContain(String(AGENT_FAVICON_ASSETS.codex))
  })
})
