import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getShortcutPlatform } from '@/lib/keyboard/shortcut-platform'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { keybindingMatchesAction, type KeybindingOverrides } from '../../../../shared/keybindings'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'

/**
 * Servicio de fondo: está montado siempre, también cuando el dictado no lo está.
 *
 * Tiene que vivir afuera de `DictationController` justamente porque el caso que cubre es que ese
 * controlador NO exista. Y va con los servicios de fondo y no con las superficies: no dibuja
 * nada, solo escucha.
 */
export function DictationOffHint(): null {
  const voiceEnabled = useAppStore((s) => s.settings?.voice?.enabled === true)
  const sinModelo = useAppStore((s) => !s.settings?.voice?.sttModel)
  const dictando = useAppStore((s) => s.dictationState !== 'idle')
  const keybindings = useAppStore((s) => s.keybindings)
  // La misma condición con la que AppRootSurfaces monta el controlador: mientras sea falsa, no
  // hay nadie escuchando la tecla. Con modelo faltante el controlador existe pero se corre igual.
  const alguienEscucha = voiceEnabled || dictando
  useDictationOffHint({
    active: !alguienEscucha || sinModelo,
    keybindings,
    faltaModelo: voiceEnabled && sinModelo
  })
  return null
}

/**
 * Cuando el dictado está apagado, la tecla de dictar no hace NADA y tampoco lo dice.
 *
 * `DictationController` —que es quien escucha la tecla— solo se monta si `voice.enabled` está
 * prendido, y el proceso principal también se corre al costado cuando falta el modelo. O sea que
 * con el dictado sin configurar, mantener la tecla y hablar no produce ni dictado ni error: la
 * app se queda muda y parece rota (Nico, 07/11: «lo que mantener espacio y hablar en la versión
 * de chat mejorada no anda»; en esa instalación no había ni un `voice` guardado).
 *
 * Esto no prende nada: solo convierte el silencio en una respuesta, una vez por sesión para que
 * mantener la tecla apretada no dispare una fila de avisos.
 */
export function useDictationOffHint(args: {
  active: boolean
  keybindings: KeybindingOverrides
  faltaModelo: boolean
}): void {
  const { active, keybindings, faltaModelo } = args
  const avisadoRef = useRef(false)

  useEffect(() => {
    if (!active) {
      return
    }
    const alApretar = (e: KeyboardEvent): void => {
      if (e.repeat || avisadoRef.current) {
        return
      }
      if (!keybindingMatchesAction('voice.dictation', e, getShortcutPlatform(), keybindings)) {
        return
      }
      avisadoRef.current = true
      // No se hace preventDefault: con el dictado apagado la tecla sigue siendo lo que era —una
      // barra espaciadora escribe un espacio— y robársela dejaría la app peor que muda.
      toast.message(
        faltaModelo
          ? translate(
              'components.dictation.offHint.sinModelo',
              'Dictation has no model picked. Settings › Voice.'
            )
          : translate(
              'components.dictation.offHint.apagado',
              'Dictation is off. Turn it on in Settings › Voice.'
            )
      )
    }
    addAppKeyListener('keydown', alApretar)
    return () => removeAppKeyListener('keydown', alApretar)
  }, [active, faltaModelo, keybindings])
}
