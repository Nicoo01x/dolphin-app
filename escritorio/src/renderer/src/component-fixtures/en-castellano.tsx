import { useEffect, useState, type ReactNode } from 'react'
import { i18n, loadRendererUiLanguage } from '../i18n/i18n'
import { useAppStore } from '../store'
import type { ComponentFixture } from './component-fixture'

/**
 * Las fixtures montan sin catálogo y salen en inglés. Las de Dolphin se miran (y se capturan para
 * la web) en castellano: este envoltorio carga el catálogo, lo activa y recién ahí pinta.
 */

const ESPERA_MAXIMA_MS = 8_000
const RESPIRO_MS = 150

/** Monta los hijos recién cuando el catálogo en castellano está cargado y activo. */
function EnCastellano({ children }: { children: ReactNode }): React.JSX.Element | null {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    let vivo = true
    void (async () => {
      const locale = await loadRendererUiLanguage('es')
      await i18n.changeLanguage(locale)
      if (vivo) {
        setListo(true)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])
  return listo ? <div data-en-castellano="">{children}</div> : null
}

/** El I18nProvider de la fixture también tiene que pedir castellano, o vuelve al inglés. */
function pedirCastellano(): void {
  useAppStore.setState(({ settings }) => ({
    settings: settings && { ...settings, uiLanguage: 'es' }
  }))
}

async function esperarCastellano(cuadro: HTMLElement): Promise<void> {
  const hasta = Date.now() + ESPERA_MAXIMA_MS
  while (!cuadro.querySelector('[data-en-castellano]') && Date.now() < hasta) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  await new Promise((resolve) => setTimeout(resolve, RESPIRO_MS))
}

/** La misma fixture, en castellano: pide el idioma, espera el catálogo y después interactúa. */
export function enCastellano(fixture: ComponentFixture): ComponentFixture {
  return {
    ...fixture,
    setup: () => {
      pedirCastellano()
      fixture.setup?.()
    },
    interact: async (cuadro) => {
      await esperarCastellano(cuadro)
      await fixture.interact?.(cuadro)
    },
    render: () => <EnCastellano>{fixture.render()}</EnCastellano>
  }
}
