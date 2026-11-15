import type { NativeChatComposerInput } from './native-chat-composer-input'
import { useCallback, useState, type RefObject } from 'react'
import { useAppStore } from '../../../../store/index'
import { dispatchDictationControl } from '../../../dictation/dictation-control-events'
import { prepararVozDeDolphin } from '../../../dolphin/voz/preparar-voz'

export function useNativeChatDictation(
  textareaRef: RefObject<NativeChatComposerInput | null>,
  disabled: boolean
): {
  dictationDisabled: boolean
  isDictating: boolean
  isDictationHoldMode: boolean
  toggleDictation: () => void
  startHoldDictation: () => void
  stopHoldDictation: () => void
} {
  const [dictationPressed, setDictationPressed] = useState(false)
  const dictationState = useAppStore((store) => store.dictationState)
  const voiceSettings = useAppStore((store) => store.settings?.voice)
  const isDictating =
    dictationPressed ||
    dictationState === 'starting' ||
    dictationState === 'listening' ||
    dictationState === 'stopping'
  // Dolphin: sin la voz preparada el micrófono no queda apagado sin explicar nada; tocarlo la
  // prepara (prende el modelo si ya está bajado, o lo ofrece bajar).
  const needsVoiceSetup = voiceSettings?.enabled !== true || !voiceSettings.sttModel
  const dictationDisabled = !isDictating && disabled
  const focusForDictation = useCallback(() => textareaRef.current?.focus(), [textareaRef])
  const toggleDictation = useCallback(() => {
    if (isDictating) {
      dispatchDictationControl('stop')
    } else if (needsVoiceSetup) {
      void prepararVozDeDolphin()
    } else if (!dictationDisabled) {
      focusForDictation()
      dispatchDictationControl('toggle')
    }
  }, [dictationDisabled, focusForDictation, isDictating, needsVoiceSetup])
  const startHoldDictation = useCallback(() => {
    if (disabled || dictationDisabled || isDictating) {
      return
    }
    if (needsVoiceSetup) {
      void prepararVozDeDolphin()
      return
    }
    setDictationPressed(true)
    focusForDictation()
    dispatchDictationControl('start')
  }, [disabled, dictationDisabled, focusForDictation, isDictating, needsVoiceSetup])
  const stopHoldDictation = useCallback(() => {
    setDictationPressed(false)
    dispatchDictationControl('stop')
  }, [])
  return {
    dictationDisabled,
    isDictating,
    isDictationHoldMode: voiceSettings?.dictationMode === 'hold',
    toggleDictation,
    startHoldDictation,
    stopHoldDictation
  }
}
