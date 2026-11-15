// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOLPHIN_MODELO_DE_VOZ, prepararVozDeDolphin } from './preparar-voz'

type Voz = { enabled: boolean; sttModel: string; language: string }

const estado = vi.hoisted(() => {
  const state = {
    settings: { voice: { enabled: false, sttModel: '', language: 'en' } as Voz },
    updateSettings: vi.fn(async (patch: { voice: Voz }) => {
      state.settings = { ...state.settings, ...patch }
    })
  }
  return state
})

const toastSpy = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'aviso-1') })
)

const speech = vi.hoisted(() => ({
  getCatalog: vi.fn(async () => [
    {
      id: 'parakeet-tdt-0.6b-v3-int8',
      label: 'Parakeet TDT v3',
      provider: 'local',
      sizeBytes: 670_478_772
    },
    { id: 'whisper-tiny', label: 'Whisper Tiny', provider: 'local', sizeBytes: 75_000_000 },
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', provider: 'openai' }
  ]),
  getModelStates: vi.fn(),
  downloadModel: vi.fn(async () => {}),
  onDownloadProgress: vi.fn(() => () => {})
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => estado } }))
vi.mock('sonner', () => ({ toast: toastSpy }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_clave: string, texto: string, valores?: Record<string, string>) =>
    texto.replace(/\{\{(\w+)\}\}/g, (_todo, clave: string) => valores?.[clave] ?? '')
}))

const oferta = (): string =>
  (toastSpy.mock.calls[0][1] as { description: string } | undefined)?.description ?? ''

const sinBajar = [
  { id: DOLPHIN_MODELO_DE_VOZ, status: 'not-downloaded' },
  { id: 'whisper-tiny', status: 'not-downloaded' }
]

beforeEach(() => {
  vi.clearAllMocks()
  estado.settings = { voice: { enabled: false, sttModel: '', language: 'en' } }
  Object.assign(window, { api: { speech } })
})

describe('prepararVozDeDolphin', () => {
  it('con un modelo ya bajado prende la voz sin ofrecer nada', async () => {
    speech.getModelStates.mockResolvedValue([{ id: DOLPHIN_MODELO_DE_VOZ, status: 'ready' }])

    await prepararVozDeDolphin()

    expect(estado.updateSettings).toHaveBeenCalledWith({
      voice: { enabled: true, sttModel: DOLPHIN_MODELO_DE_VOZ, language: 'en' }
    })
    expect(toastSpy).not.toHaveBeenCalled()
    expect(toastSpy.success).toHaveBeenCalledTimes(1)
  })

  it('no le toca el idioma a nadie: el modelo lo detecta solo', async () => {
    estado.settings.voice.language = 'fr'
    speech.getModelStates.mockResolvedValue([{ id: 'whisper-tiny', status: 'ready' }])

    await prepararVozDeDolphin()

    expect(estado.updateSettings).toHaveBeenCalledWith({
      voice: { enabled: true, sttModel: 'whisper-tiny', language: 'fr' }
    })
  })

  it('sin modelo ofrece bajarlo y, al aceptar, lo baja y prende la voz', async () => {
    speech.getModelStates.mockResolvedValue(sinBajar)

    await prepararVozDeDolphin()

    expect(estado.updateSettings).not.toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalledTimes(1)
    const opciones = toastSpy.mock.calls[0][1] as { action: { onClick: () => void } }
    opciones.action.onClick()

    await vi.waitFor(() => expect(toastSpy.success).toHaveBeenCalled())
    expect(speech.downloadModel).toHaveBeenCalledWith(DOLPHIN_MODELO_DE_VOZ)
    expect(estado.updateSettings).toHaveBeenCalledWith({
      voice: { enabled: true, sttModel: DOLPHIN_MODELO_DE_VOZ, language: 'en' }
    })
    expect(toastSpy.success).toHaveBeenCalledWith(expect.any(String), { id: 'aviso-1' })
  })

  it('si la descarga falla lo dice y no prende la voz', async () => {
    speech.getModelStates.mockResolvedValue(sinBajar)
    speech.downloadModel.mockRejectedValueOnce(new Error('sin conexión'))

    await prepararVozDeDolphin()
    const opciones = toastSpy.mock.calls[0][1] as { action: { onClick: () => void } }
    opciones.action.onClick()

    await vi.waitFor(() => expect(toastSpy.error).toHaveBeenCalled())
    expect(estado.updateSettings).not.toHaveBeenCalled()
  })

  it('de respaldo nunca toma uno de OpenAI: está «listo» con la clave y mandaría el audio afuera', async () => {
    speech.getModelStates.mockResolvedValue([
      ...sinBajar,
      { id: 'gpt-4o-transcribe', status: 'ready' }
    ])

    await prepararVozDeDolphin()

    expect(estado.updateSettings).not.toHaveBeenCalled()
    expect(oferta()).toContain('Parakeet TDT v3')
  })

  it('si la persona eligió uno de OpenAI y está listo, es su decisión: lo usa', async () => {
    estado.settings.voice.sttModel = 'gpt-4o-transcribe'
    speech.getModelStates.mockResolvedValue([{ id: 'gpt-4o-transcribe', status: 'ready' }])

    await prepararVozDeDolphin()

    expect(estado.updateSettings).toHaveBeenCalledWith({
      voice: { enabled: true, sttModel: 'gpt-4o-transcribe', language: 'en' }
    })
  })

  it('la oferta nombra el modelo que va a bajar, con su peso', async () => {
    estado.settings.voice.sttModel = 'whisper-tiny'
    speech.getModelStates.mockResolvedValue(sinBajar)

    await prepararVozDeDolphin()
    expect(oferta()).toBe(
      "Whisper Tiny runs on your computer: it's about 75 MB to download, and then you dictate offline."
    )
    ;(toastSpy.mock.calls[0][1] as { action: { onClick: () => void } }).action.onClick()
    await vi.waitFor(() => expect(speech.downloadModel).toHaveBeenCalledWith('whisper-tiny'))
  })

  it('con uno de OpenAI elegido pero sin clave ofrece Parakeet: uno de OpenAI no se baja', async () => {
    estado.settings.voice.sttModel = 'gpt-4o-transcribe'
    speech.getModelStates.mockResolvedValue([
      ...sinBajar,
      { id: 'gpt-4o-transcribe', status: 'not-downloaded' }
    ])

    await prepararVozDeDolphin()

    expect(oferta()).toContain('Parakeet TDT v3')
    expect(oferta()).toContain('670 MB')
  })

  it('mientras el modelo ya se está bajando no lo vuelve a ofrecer', async () => {
    speech.getModelStates.mockResolvedValue([
      { id: DOLPHIN_MODELO_DE_VOZ, status: 'downloading', progress: 0.4 }
    ])

    await prepararVozDeDolphin()

    expect(toastSpy).not.toHaveBeenCalled()
    expect(estado.updateSettings).not.toHaveBeenCalled()
  })
})
