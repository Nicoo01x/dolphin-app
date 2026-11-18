// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const voice = vi.hoisted(() => ({
  dictationState: 'idle',
  settings: { voice: { enabled: true, sttModel: 'configured' } },
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

// Nico sacó también «Orquestación» el 17/11/2026: repartir el trabajo se pide en el chat
// («delegá las tareas») y la skill dolphin-delegar abre cada compañero como pestaña de Dolphin.
describe('el compositor sin «Orquestación»', () => {
  it('no ofrece el interruptor en ningún chat', () => {
    const { rerender } = render(<NativeChatComposerActions {...BASE} agent="claude" />)
    expect(screen.queryByRole('button', { name: /Intelligent Orchestration/ })).toBeNull()
    expect(screen.queryByText('Orchestration')).toBeNull()
    rerender(<NativeChatComposerActions {...BASE} agent="codex" />)
    expect(screen.queryByRole('button', { name: /Intelligent Orchestration/ })).toBeNull()
  })
})
