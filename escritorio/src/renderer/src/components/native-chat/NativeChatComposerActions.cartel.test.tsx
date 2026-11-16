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

import { NativeChatComposerActions } from './composer/controls/NativeChatComposerActions'

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

// Nico sacó «Delegar» del compositor el 15/11/2026: el cartel no se ofrece en ningún chat.
describe('el compositor sin «Delegar»', () => {
  it('no ofrece el cartel de delegar en el chat de Claude ni en el de otro motor', () => {
    const { rerender } = render(<NativeChatComposerActions {...BASE} agent="claude" />)
    expect(screen.queryByTestId('cartel-delegacion')).toBeNull()
    rerender(<NativeChatComposerActions {...BASE} agent="codex" />)
    expect(screen.queryByTestId('cartel-permisos')).toBeNull()
    expect(screen.queryByText('Delegate')).toBeNull()
  })
})

// Nico lo quiso en el compositor (antes vivía en la barra de arriba del chat), y es lo único que
// quedó de Dolphin ahí después de sacar «Delegar».
describe('Orquestación inteligente en el compositor', () => {
  const NOMBRE = /Intelligent Orchestration/

  it('aparece en el chat de un agente de terminal, apagado', () => {
    render(<NativeChatComposerActions {...BASE} agent="claude" />)
    const interruptor = screen.getByRole('button', { name: NOMBRE })
    expect(interruptor.closest('[data-composer-control]')).not.toBeNull()
    expect(interruptor.getAttribute('aria-pressed')).toBe('false')
  })

  it('también aparece en el chat de otro agente de terminal', () => {
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
