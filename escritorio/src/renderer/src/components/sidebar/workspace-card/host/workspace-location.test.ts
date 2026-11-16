import { describe, expect, it } from 'vitest'
import {
  UNRESOLVED_OWNER_HOST_ID,
  toRuntimeExecutionHostId,
  toSshExecutionHostId
} from '../../../../../../shared/execution-host'
import { resolveWorkspaceLocation } from './workspace-location'

const noLabel = { wslDistro: null, hostLabel: null }

describe('resolveWorkspaceLocation', () => {
  it('puts a workspace on this computer when its host is local', () => {
    expect(resolveWorkspaceLocation({ executionHostId: 'local', ...noLabel })).toEqual({
      kind: 'local'
    })
  })

  it('treats a missing host id as this computer, like the rest of the sidebar', () => {
    expect(resolveWorkspaceLocation({ executionHostId: undefined, ...noLabel })).toEqual({
      kind: 'local'
    })
  })

  it('keeps a WSL host on this computer: the distro runs on the same machine', () => {
    expect(
      resolveWorkspaceLocation({
        executionHostId: toRuntimeExecutionHostId('wsl-ubuntu'),
        wslDistro: 'Ubuntu',
        hostLabel: 'Ubuntu'
      })
    ).toEqual({ kind: 'local' })
  })

  it('puts an SSH workspace on a server, named after its target', () => {
    expect(
      resolveWorkspaceLocation({
        executionHostId: toSshExecutionHostId('vps-ana'),
        wslDistro: null,
        hostLabel: 'vps-ana'
      })
    ).toEqual({ kind: 'server', hostLabel: 'vps-ana' })
  })

  it('falls back to the SSH target id when the target has no label yet', () => {
    expect(
      resolveWorkspaceLocation({ executionHostId: toSshExecutionHostId('vps-ana'), ...noLabel })
    ).toEqual({ kind: 'server', hostLabel: 'vps-ana' })
  })

  it('does not show a generated id as the name of an owned SSH target', () => {
    expect(
      resolveWorkspaceLocation({
        executionHostId: toSshExecutionHostId('machine-7f3a'),
        ...noLabel
      })
    ).toEqual({ kind: 'server', hostLabel: null })
  })

  it('puts a dolphind server or cloud VM on a server', () => {
    expect(
      resolveWorkspaceLocation({
        executionHostId: toRuntimeExecutionHostId('env-1'),
        wslDistro: null,
        hostLabel: '  la nube  '
      })
    ).toEqual({ kind: 'server', hostLabel: 'la nube' })
  })

  it('leaves an unnamed runtime server without a name', () => {
    expect(
      resolveWorkspaceLocation({ executionHostId: toRuntimeExecutionHostId('env-1'), ...noLabel })
    ).toEqual({ kind: 'server', hostLabel: null })
  })

  it('claims no place while the owning host is unresolved', () => {
    expect(
      resolveWorkspaceLocation({ executionHostId: UNRESOLVED_OWNER_HOST_ID, ...noLabel })
    ).toBeNull()
  })
})
