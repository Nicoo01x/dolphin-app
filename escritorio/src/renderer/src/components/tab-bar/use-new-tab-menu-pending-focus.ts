import { useRef } from 'react'
import { focusTerminalTabSurface } from '@/components/terminal-pane/input/focus/focus-terminal-tab-surface'
import { useAppStore } from '../../store'

const NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS = 50
const NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS = 5000

export type NewTabMenuPendingFocus = {
  queueFocusAfterNewTabMenuClose: (focus: () => void, synchronous?: true) => void
  queueTerminalTabFocusAfterNewTabMenuClose: (tabId: string) => void
  queueNewActiveTerminalFocusAfterNewTabMenuClose: () => void
  runPendingNewTabMenuFocusAfterClose: () => void
  clearPendingNewTabMenuFocusOnUnmount: (node: HTMLDivElement | null) => void
}

/**
 * El foco que queda pendiente mientras el menú `+` se cierra.
 *
 * Why esperar a que cierre: Radix devuelve el foco al disparador del menú cuando se va, así que
 * enfocar la terminal recién creada en el mismo instante no sirve de nada —el menú lo pisa un
 * frame después—. Lo que se pide acá se ejecuta cuando el menú ya no está.
 *
 * Why aparte del controlador: no tiene nada que ver con qué ofrece el menú, que es de lo que
 * trata el controlador, y ese archivo pasó su techo de líneas cuando el menú aprendió a crear
 * los archivos de los plugins.
 */
export function useNewTabMenuPendingFocus(): NewTabMenuPendingFocus {
  const pendingFocusRef = useRef<{ focus: () => void; synchronous?: true } | null>(null)
  const pendingAnimationRef = useRef<number | null>(null)
  const pendingRetryRef = useRef<number | null>(null)
  const unmountRef = useRef<((node: HTMLDivElement | null) => void) | null>(null)

  const clearAnimation = (): void => {
    if (pendingAnimationRef.current !== null) {
      cancelAnimationFrame(pendingAnimationRef.current)
      pendingAnimationRef.current = null
    }
  }
  const clearRetry = (): void => {
    if (pendingRetryRef.current !== null) {
      window.clearTimeout(pendingRetryRef.current)
      pendingRetryRef.current = null
    }
  }
  const queueFocusAfterNewTabMenuClose = (focus: () => void, synchronous?: true): void => {
    clearAnimation()
    clearRetry()
    pendingFocusRef.current = { focus, synchronous }
  }
  const focusNewActiveTerminalWhenReady = (
    previousActiveTabId: string | null,
    expiresAt: number,
    now: number
  ): void => {
    const state = useAppStore.getState()
    if (
      (state.activeTabType === 'terminal' || state.activeTabType === 'simulator') &&
      state.activeTabId &&
      state.activeTabId !== previousActiveTabId
    ) {
      focusTerminalTabSurface(state.activeTabId)
      return
    }
    if (now >= expiresAt) {
      return
    }
    pendingRetryRef.current = window.setTimeout(() => {
      pendingRetryRef.current = null
      focusNewActiveTerminalWhenReady(previousActiveTabId, expiresAt, Date.now())
    }, NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS)
  }

  if (unmountRef.current === null) {
    unmountRef.current = (node: HTMLDivElement | null): void => {
      if (node !== null) {
        return
      }
      // Why: cancel the delayed focus handoff via this root ref cleanup, avoiding an otherwise cleanup-only React Effect.
      pendingFocusRef.current = null
      clearAnimation()
      clearRetry()
    }
  }

  return {
    queueFocusAfterNewTabMenuClose,
    queueTerminalTabFocusAfterNewTabMenuClose: (tabId) =>
      queueFocusAfterNewTabMenuClose(() => focusTerminalTabSurface(tabId)),
    queueNewActiveTerminalFocusAfterNewTabMenuClose: () => {
      const previousActiveTabId = useAppStore.getState().activeTabId
      queueFocusAfterNewTabMenuClose(() => {
        // Why: paired web/SSH tab creation is async; await the host snapshot's new terminal instead of the pre-existing active tab.
        focusNewActiveTerminalWhenReady(
          previousActiveTabId,
          Date.now() + NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS,
          Date.now()
        )
      })
    },
    runPendingNewTabMenuFocusAfterClose: () => {
      const pendingFocus = pendingFocusRef.current
      pendingFocusRef.current = null
      clearAnimation()
      clearRetry()
      if (pendingFocus?.synchronous) {
        pendingFocus.focus()
      } else if (pendingFocus) {
        pendingAnimationRef.current = requestAnimationFrame(() => {
          pendingAnimationRef.current = null
          pendingFocus.focus()
        })
      }
    },
    clearPendingNewTabMenuFocusOnUnmount: unmountRef.current
  }
}
