// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ComposerCardProps } from '@/hooks/useComposerState'
import { StartProjectPill, StartRunTargetPill } from './StartPills'

afterEach(cleanup)

/** The app wraps its chrome in one provider; the pills carry tooltips like the chat's do. */
function draw(ui: React.ReactNode): ReturnType<typeof render> {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

type ProjectOption = ComposerCardProps['projectOptions'][number]
type HostOptions = NonNullable<ComposerCardProps['projectHostSetupOptions']>

function project(id: string, displayName: string): ProjectOption {
  return { id, displayName, kind: 'repo' } as unknown as ProjectOption
}

it('names the chosen project on the pill and commits another from its menu', async () => {
  const onChange = vi.fn()
  draw(
    <StartProjectPill
      options={[project('a', 'dolphin-app'), project('b', 'tienda-web')]}
      value="a"
      onChange={onChange}
      onAddProject={vi.fn()}
    />
  )
  expect(screen.getByRole('button', { name: /dolphin-app/ })).toBeTruthy()

  await userEvent.click(screen.getByRole('button', { name: /dolphin-app/ }))
  await userEvent.click(await screen.findByText('tienda-web'))
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('b'))
})

it('runs the setup step for a machine that is not connected yet instead of selecting it', async () => {
  // A host that still needs a connection is listed — hiding it makes a machine the user already
  // added look like it was never there — but picking it has to connect, not commit a target that
  // cannot run anything.
  const onChange = vi.fn()
  const onConnect = vi.fn()
  const options = [
    {
      kind: 'ready',
      hostId: 'local',
      label: 'Local Windows',
      detail: 'D:/proyectos',
      path: 'D:/proyectos'
    },
    {
      kind: 'needs-setup',
      hostId: 'ssh:servidor',
      label: 'servidor',
      detail: 'Not connected',
      canSetLocation: false,
      connectAction: { kind: 'ssh', targetId: 'servidor' }
    }
  ] as unknown as HostOptions

  draw(
    <StartRunTargetPill
      options={options}
      value="local"
      onChange={onChange}
      onConnect={onConnect}
      onAddMachine={vi.fn()}
    />
  )
  // Opened by role: the committed key comes from the picker's own selection helper, and this
  // test is about what picking a disconnected host does, not about how that key is spelled.
  await userEvent.click(screen.getByRole('button'))
  await userEvent.click(await screen.findByText('servidor'))
  await waitFor(() => expect(onConnect).toHaveBeenCalled())
  expect(onChange).not.toHaveBeenCalled()
})
