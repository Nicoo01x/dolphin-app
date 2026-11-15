// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const voice = vi.hoisted(() => ({
  dictationState: 'idle',
  settings: { voice: { enabled: true, sttModel: 'configured' }, autoDelegation: false },
  updateSettingsOrThrow: vi.fn(() => Promise.resolve())
}))
vi.mock('../../store', () => ({
  useAppStore: (selector: (state: typeof voice) => unknown) => selector(voice)
}))
vi.mock('../dictation/dictation-control-events', () => ({ dispatchDictationControl: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children: ReactNode
    variant?: string
    size?: string
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('./session/options/controls/NativeChatSessionOptionPickers', () => ({
  NativeChatSessionOptionPickers: () => <div data-testid="session-option-pickers" />
}))
vi.mock('./session/options/controls/NativeChatPermissionModePicker', () => ({
  NativeChatComposerPermissionPicker: () => <div data-testid="permission-picker" />
}))

// El cartel tiene su propio test; acá se mira el cableado: cuáles se ofrecen y qué hace elegir.
vi.mock('./CartelDeFuncion', () => ({
  CARTEL_MARCA: 'data-cartel-de-funcion',
  CartelDeFuncion: ({
    cartel,
    nombreDelMotor,
    onElegir
  }: {
    cartel: { id: string }
    nombreDelMotor: string
    onElegir: (valor: string) => void
  }) => (
    <button data-testid={`cartel-${cartel.id}`} onClick={() => onElegir('opus')}>
      {nombreDelMotor}
    </button>
  )
}))
vi.mock('@/lib/delegar-con-dolphin', () => ({ delegarConDolphin: vi.fn(() => true) }))

import { NativeChatComposerActions } from './composer/controls/NativeChatComposerActions'
import { delegarConDolphin } from '@/lib/delegar-con-dolphin'
import { toast } from 'sonner'

const BASE = {
  attachDisabled: false,
  dictationDisabled: false,
  sendDisabled: false,
  isWorking: false,
  isDictating: false,
  isDictationHoldMode: false,
  onAttach: vi.fn(),
  onDictationToggle: vi.fn(),
  onDictationHoldStart: vi.fn(),
  onDictationHoldEnd: vi.fn(),
  onSend: vi.fn(),
  sessionOptionsSurface: null,
  sessionOptionsSnapshot: []
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('los carteles en el compositor', () => {
  it('ofrece delegar en el chat de Claude, en nombre de Claude', () => {
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    expect(screen.getByTestId('cartel-delegacion').textContent).toBe('Claude')
  })

  // `/lider` toma modelos de Claude: ofrecerlo en otro chat sería ofrecer algo que no tiene.
  it('no lo ofrece en el chat de un motor que no lo tiene, ni sin motor', () => {
    const { rerender } = render(<NativeChatComposerActions {...BASE} agent="codex" />)
    expect(screen.queryByTestId('cartel-delegacion')).toBeNull()
    rerender(<NativeChatComposerActions {...BASE} />)
    expect(screen.queryByTestId('cartel-delegacion')).toBeNull()
  })

  it('elegir abre Dolphin delegando con ese modelo', async () => {
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    await userEvent.click(screen.getByTestId('cartel-delegacion'))
    expect(delegarConDolphin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'delegacion' }),
      'opus'
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  // Sin espacio de trabajo donde abrirla, la apertura no pasa: decirlo es mejor que no hacer nada.
  it('avisa cuando la apertura no se pudo hacer', async () => {
    vi.mocked(delegarConDolphin).mockReturnValueOnce(false)
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    await userEvent.click(screen.getByTestId('cartel-delegacion'))
    expect(toast.error).toHaveBeenCalled()
  })
})

// Nico lo quiso en el compositor, pegado a «Delegar» (antes vivía en la barra de arriba del chat).
describe('Orquestación inteligente en el compositor', () => {
  const NOMBRE = /Intelligent Orchestration/

  it('aparece justo después de «Delegar» en el chat de un agente de terminal', () => {
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    const delegar = screen.getByTestId('cartel-delegacion')
    const interruptor = screen.getByRole('button', { name: NOMBRE })
    // La barra de la base envuelve cada control en su `[data-composer-control]`: se comparan esos.
    const lugarDeDelegar = delegar.closest('[data-composer-control]')
    expect(lugarDeDelegar?.nextElementSibling?.contains(interruptor)).toBe(true)
    expect(interruptor.getAttribute('aria-pressed')).toBe('false')
  })

  it('también aparece en un agente de terminal sin cartel de delegación', () => {
    render(<NativeChatComposerActions {...BASE} agent="codex" />)
    expect(screen.getByRole('button', { name: NOMBRE })).toBeTruthy()
  })

  it('no aparece si el chat no es de un agente de terminal, ni sin agente', () => {
    const { rerender } = render(<NativeChatComposerActions {...BASE} agent="not-a-tui-agent" />)
    expect(screen.queryByRole('button', { name: NOMBRE })).toBeNull()
    rerender(<NativeChatComposerActions {...BASE} />)
    expect(screen.queryByRole('button', { name: NOMBRE })).toBeNull()
  })

  it('tocarlo guarda el ajuste global invertido', async () => {
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    await userEvent.click(screen.getByRole('button', { name: NOMBRE }))
    expect(voice.updateSettingsOrThrow).toHaveBeenCalledWith({ autoDelegation: true })
  })
})
