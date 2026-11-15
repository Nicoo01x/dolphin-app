import type { GlobalSettings } from '../../../shared/global-settings-types'
import { tokensDelTemaElegido } from '../../../shared/tema-de-la-interfaz-settings'

/**
 * Los colores elegidos, convertidos en algo que la cáscara realmente obedezca.
 *
 * El motor nombra sus tokens `--color-*`, que es como los nombra el `@theme` de Tailwind. Pero en
 * esta app esos nombres son ALIAS: `main.css` declara `--color-background: var(--background)`, así
 * que pisar `--color-background` no cambia nada —el alias sigue apuntando al valor de siempre—.
 * Lo que hay que pisar es la variable real, y de ahí el recorte del prefijo. Sin eso la función
 * entera no falla: simplemente no se ve, que es peor.
 */

export function selectInterfaceAppearanceSettings(
  settings: Partial<GlobalSettings> | null | undefined
) {
  return {
    theme: settings?.theme,
    temaPropio: settings?.temaPropio
  }
}

export function interfaceAppearanceStyle(
  settings: ReturnType<typeof selectInterfaceAppearanceSettings>,
  systemPrefersDark: boolean,
  hayTemaDePlugin = false
): Record<string, string> | null {
  // Un tema de plugin gana sobre las perillas: las perillas son el tema que la persona se
  // armo a mano y el de plugin es uno que eligio entero, asi que mezclarlos daria una paleta
  // que no es ninguna de las dos. Desde el merge de la base del 11/11 el tema de plugin lo pinta
  // La base (ajustes pluginAppThemeDark/Light, use-document-appearance.ts): aca solo se aparta.
  if (hayTemaDePlugin) {
    return null
  }
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && systemPrefersDark)
  const tokens = tokensDelTemaElegido(settings.temaPropio, dark)
  return (
    tokens &&
    Object.fromEntries(
      Object.entries(tokens).map(([name, value]) => [name.replace(/^--color-/, '--'), value])
    )
  )
}

type TokenStyle = Pick<
  CSSStyleDeclaration,
  'getPropertyValue' | 'getPropertyPriority' | 'setProperty' | 'removeProperty'
>

export function applyInterfaceAppearanceStyle(
  style: TokenStyle,
  tokens: Record<string, string> | null
): () => void {
  const previous = Object.entries(tokens ?? {}).map(([name, value]) => {
    const saved = [name, style.getPropertyValue(name), style.getPropertyPriority(name)] as const
    style.setProperty(name, value)
    return saved
  })
  return () => {
    for (const [name, value, priority] of previous) {
      if (value) {
        style.setProperty(name, value, priority)
      } else {
        style.removeProperty(name)
      }
    }
  }
}
