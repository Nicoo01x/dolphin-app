import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/** El modelo de voz de Dolphin: corre en la compu y entiende castellano (detecta 25 idiomas). */
export const DOLPHIN_MODELO_DE_VOZ = 'parakeet-tdt-0.6b-v3-int8'

let preparando = false

/** Prende el dictado con ese modelo. El idioma no se toca: Parakeet v3 lo detecta solo. */
async function prenderVoz(modelId: string): Promise<void> {
  const { settings, updateSettings } = useAppStore.getState()
  const voz = settings?.voice
  if (!voz) {
    return
  }
  await updateSettings({ voice: { ...voz, enabled: true, sttModel: modelId } })
}

async function bajarYPrender(modelId: string): Promise<void> {
  const avance = (porcentaje: number): string =>
    translate(
      'auto.components.dolphin.voice.downloading',
      'Downloading the voice model… {{value0}}%',
      {
        value0: String(porcentaje)
      }
    )
  const id = toast.loading(avance(0))
  const soltar = window.api.speech.onDownloadProgress(({ modelId: cual, progress }) => {
    // El avance llega de 0 a 1 (0,95 mientras descomprime) y -1 cuando no se sabe: ese no se muestra.
    if (cual === modelId && progress >= 0) {
      toast.loading(avance(Math.round(progress * 100)), { id })
    }
  })
  try {
    await window.api.speech.downloadModel(modelId)
    await prenderVoz(modelId)
    toast.success(
      translate('auto.components.dolphin.voice.ready', 'Ready: tap the microphone to dictate.'),
      { id }
    )
  } catch (error) {
    toast.error(
      translate(
        'auto.components.dolphin.voice.failed',
        "Couldn't download the voice model: {{value0}}",
        {
          value0: error instanceof Error ? error.message : String(error)
        }
      ),
      { id }
    )
  } finally {
    soltar()
  }
}

/**
 * El micrófono sin la voz preparada: en vez de quedar apagado sin decir nada, la prepara. Si el
 * modelo ya está bajado, prende el dictado; si no, ofrece bajarlo —corre en la compu y después
 * se dicta sin internet— y muestra el avance hasta dejarlo listo.
 */
export async function prepararVozDeDolphin(): Promise<void> {
  if (preparando) {
    return
  }
  preparando = true
  try {
    const voz = useAppStore.getState().settings?.voice
    const [catalogo, estados] = await Promise.all([
      window.api.speech.getCatalog(),
      window.api.speech.getModelStates()
    ])
    const locales = new Map(
      catalogo.filter((modelo) => modelo.provider === 'local').map((modelo) => [modelo.id, modelo])
    )
    // Lo que eligió la persona, si ya está listo, aunque sea de OpenAI: es su decisión. De respaldo,
    // solo uno de la compu: uno de OpenAI está «listo» con la clave guardada y mandaría el audio
    // afuera sin que nadie lo haya pedido.
    const listo =
      estados.find(
        (modelo) =>
          modelo.id === (voz?.sttModel || DOLPHIN_MODELO_DE_VOZ) && modelo.status === 'ready'
      ) ?? estados.find((modelo) => locales.has(modelo.id) && modelo.status === 'ready')
    // Para bajar, el elegido si es de la compu (uno de OpenAI no se baja); si no, Parakeet v3.
    const elegido =
      voz?.sttModel && locales.has(voz.sttModel) ? voz.sttModel : DOLPHIN_MODELO_DE_VOZ
    if (listo) {
      await prenderVoz(listo.id)
      toast.success(
        translate('auto.components.dolphin.voice.ready', 'Ready: tap the microphone to dictate.')
      )
      return
    }
    if (estados.some((modelo) => modelo.id === elegido && modelo.status === 'downloading')) {
      return
    }
    toast(
      translate(
        'auto.components.dolphin.voice.offerTitle',
        'To dictate, Dolphin needs a voice model'
      ),
      {
        description: translate(
          'auto.components.dolphin.voice.offerBodyModel',
          "{{value0}} runs on your computer: it's about {{value1}} MB to download, and then you dictate offline.",
          {
            value0: locales.get(elegido)?.label ?? elegido,
            value1: String(Math.round((locales.get(elegido)?.sizeBytes ?? 0) / 1_000_000))
          }
        ),
        duration: 20_000,
        action: {
          label: translate('auto.components.dolphin.voice.download', 'Download'),
          onClick: () => void bajarYPrender(elegido)
        }
      }
    )
  } catch (error) {
    toast.error(
      translate(
        'auto.components.dolphin.voice.failed',
        "Couldn't download the voice model: {{value0}}",
        {
          value0: error instanceof Error ? error.message : String(error)
        }
      )
    )
  } finally {
    preparando = false
  }
}
