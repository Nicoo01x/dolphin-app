import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store'
import { useSystemPrefersDark } from '../hooks/theme/use-system-prefers-dark'
import { useSettingsDarkTheme } from '../hooks/use-document-dark-theme'
import { usePluginThemes } from '../store/plugins/appearance/plugin-themes'
import { MATCH_TERMINAL_APP_THEME } from '../../../shared/plugin-theme-settings'
import {
  applyInterfaceAppearanceStyle,
  interfaceAppearanceStyle,
  selectInterfaceAppearanceSettings
} from '../lib/interface-appearance-style'

/** Si la base está pintando un tema de app de plugin (o «Match Terminal») en el modo pedido. */
function useHayTemaDePlugin(): boolean {
  const requestedDark = useSettingsDarkTheme()
  const selected = useAppStore((s) =>
    requestedDark ? s.settings?.pluginAppThemeDark : s.settings?.pluginAppThemeLight
  )
  const pluginThemes = usePluginThemes()
  return (
    selected === MATCH_TERMINAL_APP_THEME ||
    (Boolean(selected) && pluginThemes.some((entry) => entry.id === selected))
  )
}

export function useInterfaceAppearanceStyle(): void {
  const settings = useAppStore(
    useShallow((state) => selectInterfaceAppearanceSettings(state.settings))
  )
  const systemPrefersDark = useSystemPrefersDark()
  const hayTemaDePlugin = useHayTemaDePlugin()
  const tokens = useMemo(
    () => interfaceAppearanceStyle(settings, systemPrefersDark, hayTemaDePlugin),
    [settings, systemPrefersDark, hayTemaDePlugin]
  )
  useEffect(() => applyInterfaceAppearanceStyle(document.documentElement.style, tokens), [tokens])
}
