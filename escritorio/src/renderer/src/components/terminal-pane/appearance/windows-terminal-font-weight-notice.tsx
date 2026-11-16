import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { buildFontFamily } from '../../../../../shared/monospace-font-family'
import { isWindowsDesktopClient } from '@/lib/files/os-open/windows-path-access'
import { encolarAviso, retirarAviso } from '@/components/dolphin/avisos/avisos-store'
import {
  avisoDelTextoDelTerminal,
  ID_TEXTO_DEL_TERMINAL
} from '@/components/dolphin/avisos/aviso-texto-del-terminal'
import { DEFAULT_TERMINAL_FONT_WEIGHT } from '../../../../../shared/terminal/appearance/terminal-fonts'
import { WINDOWS_TERMINAL_FONT_WEIGHT } from '../../../../../shared/terminal/appearance/terminal-platform-defaults'

const PROBE_TEXT = 'git status 0Oo1lI WMQ@#{}'
const CHOICE_WEIGHTS: readonly number[] = [
  WINDOWS_TERMINAL_FONT_WEIGHT,
  DEFAULT_TERMINAL_FONT_WEIGHT
]

/** Canvas rasterizes like the terminal glyph atlas, so equal pixels mean both weights pick one face. */
function weightsRenderAlike(fontFamily: string, first: number, second: number): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 48
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return false
  }
  const rasterize = (weight: number): Uint8ClampedArray | null => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = '1px serif'
    const rejected = context.font
    context.font = `${weight} 32px ${fontFamily}`
    // An unparsable family leaves the sentinel font, which would compare equal and hide the notice.
    if (context.font === rejected) {
      return null
    }
    context.fillText(PROBE_TEXT, 0, 36)
    return context.getImageData(0, 0, canvas.width, canvas.height).data
  }
  const firstPixels = rasterize(first)
  const secondPixels = rasterize(second)
  if (!firstPixels || !secondPixels) {
    return false
  }
  return firstPixels.every((value, index) => value === secondPixels[index])
}

function finishNotice(): void {
  const store = useAppStore.getState()
  if (store.settings?.terminalFontWeightWindowsRegular !== 'notice-pending') {
    return
  }
  void store.updateSettings({ terminalFontWeightWindowsRegular: 'done' }).catch(console.error)
}

/** One persistent choice for Windows profiles moved off the old 500 default; it returns until Okay or close. */
export function useWindowsTerminalFontWeightNotice(persistedUIReady: boolean): void {
  // The probe measures this client's fonts, so only the Windows desktop may settle the notice.
  const noticePending = useAppStore(
    (s) =>
      persistedUIReady &&
      isWindowsDesktopClient() &&
      s.settings?.terminalFontWeightWindowsRegular === 'notice-pending'
  )
  const weightChosenElsewhere = useAppStore(
    (s) => noticePending && !CHOICE_WEIGHTS.includes(s.settings?.terminalFontWeight ?? Number.NaN)
  )

  // A weight set in Settings supersedes the choice offered here.
  useEffect(() => {
    if (weightChosenElsewhere) {
      finishNotice()
    }
  }, [weightChosenElsewhere])

  const shownRef = useRef(false)

  useEffect(() => {
    if (!noticePending) {
      // Only retract what this hook queued; the queue drops it whether or not it reached the screen.
      if (shownRef.current) {
        shownRef.current = false
        retirarAviso(ID_TEXTO_DEL_TERMINAL)
      }
      return
    }
    const fontFamily = buildFontFamily(useAppStore.getState().settings?.terminalFontFamily ?? '')
    // Fonts without a Medium face render both weights identically, so there is nothing to choose.
    if (
      weightsRenderAlike(fontFamily, WINDOWS_TERMINAL_FONT_WEIGHT, DEFAULT_TERMINAL_FONT_WEIGHT)
    ) {
      finishNotice()
      return
    }
    shownRef.current = true
    // Dolphin: centered and one at a time, behind anything more important (components/dolphin/avisos).
    encolarAviso(avisoDelTextoDelTerminal({ alTerminar: finishNotice }))
  }, [noticePending])
}
