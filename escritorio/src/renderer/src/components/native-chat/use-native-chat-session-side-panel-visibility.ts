import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'dolphin.native-chat-session-side-panel'

function readVisibility(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeVisibility(visible: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, visible ? '1' : '0')
  } catch {
    // El panel sigue funcionando aunque esta ventana no tenga almacenamiento.
  }
}

export function useNativeChatSessionSidePanelVisibility(): {
  visible: boolean
  toggle: () => void
} {
  const [visible, setVisible] = useState(readVisibility)
  const toggle = useCallback(() => {
    setVisible((current) => {
      const next = !current
      writeVisibility(next)
      return next
    })
  }, [])
  useEffect(() => {
    writeVisibility(visible)
  }, [visible])
  return { visible, toggle }
}
