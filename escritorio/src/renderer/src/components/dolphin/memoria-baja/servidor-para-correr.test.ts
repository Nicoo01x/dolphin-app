import { describe, expect, it } from 'vitest'
import type { ExecutionHostId } from '../../../../../shared/execution-host'
import type { ExecutionHostRegistryEntry } from '../../../../../shared/execution-host/execution-host-registry-entry'
import type { LoQueMasPesa } from '../../../../../shared/modo-poca-ram'
import type { ProjectHostSetup } from '../../../../../shared/project-types'
import type { Repo } from '../../../../../shared/repo-types'
import { getRepoWorkspaceCreationTargetHint } from '@/lib/workspace/creation/project-host-workspace-target'
import { decidirAccionDelCartel, servidoresDondeCorrer } from './servidor-para-correr'

function host(
  id: ExecutionHostId,
  extra: Partial<ExecutionHostRegistryEntry> = {}
): ExecutionHostRegistryEntry {
  return {
    id,
    kind: id === 'local' ? 'local' : id.startsWith('ssh:') ? 'ssh' : 'runtime',
    label: id,
    detail: '',
    health: id === 'local' ? 'local' : 'available',
    ...extra
  }
}

const nadaEsWsl = (): boolean => false
const repo = { id: 'repo-1', path: 'C:/code/app', displayName: 'app', connectionId: null } as Repo
const pesado: LoQueMasPesa = {
  tipo: 'espacio',
  worktreeId: 'wt-1',
  nombre: 'arreglar-login',
  repoId: 'repo-1',
  repoNombre: 'app',
  bytes: 2 * 1024 ** 3
}

function setupEn(hostId: ExecutionHostId): ProjectHostSetup {
  const { projectId } = getRepoWorkspaceCreationTargetHint(repo, [])
  return { id: `setup-${hostId}`, projectId, hostId, repoId: 'remoto' } as ProjectHostSetup
}

describe('servidoresDondeCorrer', () => {
  it('deja afuera esta computadora, lo desconectado, WSL y lo fusionado', () => {
    const hosts = [
      host('local'),
      host('ssh:vps-ana', { label: 'vps-ana' }),
      host('ssh:caido', { health: 'disconnected' }),
      host('runtime:wsl-ubuntu'),
      host('ssh:vps-viejo', { mergedIntoHostId: 'runtime:vps-viejo' }),
      host('runtime:vps-viejo', { label: 'vps-viejo' })
    ]
    const servidores = servidoresDondeCorrer(hosts, (id) => id === 'runtime:wsl-ubuntu')
    expect(servidores).toEqual([
      { id: 'ssh:vps-ana', nombre: 'vps-ana' },
      { id: 'runtime:vps-viejo', nombre: 'vps-viejo' }
    ])
  })
})

describe('decidirAccionDelCartel', () => {
  const base = { repos: [repo], projectHostSetups: [], repoActivoId: null }

  it('sin ningún servidor, lleva a conectar uno', () => {
    expect(decidirAccionDelCartel({ ...base, masPesado: pesado, servidores: [] })).toEqual({
      tipo: 'conectar'
    })
  })

  it('con un servidor, corre el espacio más pesado ahí, apuntado a su proyecto', () => {
    const accion = decidirAccionDelCartel({
      ...base,
      masPesado: pesado,
      servidores: servidoresDondeCorrer([host('ssh:vps-ana')], nadaEsWsl)
    })
    expect(accion).toMatchObject({
      tipo: 'correr',
      servidor: { id: 'ssh:vps-ana' },
      worktreeId: 'wt-1',
      nombre: 'arreglar-login',
      repoId: 'repo-1',
      objetivo: { hostId: 'ssh:vps-ana' }
    })
    expect(accion.tipo === 'correr' && accion.objetivo?.projectHostSetupId).toBeFalsy()
  })

  it('prefiere el servidor donde el proyecto ya está instalado', () => {
    const accion = decidirAccionDelCartel({
      ...base,
      projectHostSetups: [setupEn('ssh:vps-dos')],
      masPesado: pesado,
      servidores: [
        { id: 'ssh:vps-uno', nombre: 'vps-uno' },
        { id: 'ssh:vps-dos', nombre: 'vps-dos' }
      ]
    })
    expect(accion).toMatchObject({
      tipo: 'correr',
      servidor: { id: 'ssh:vps-dos' },
      objetivo: { hostId: 'ssh:vps-dos', projectHostSetupId: 'setup-ssh:vps-dos' }
    })
  })

  it('sin un espacio para nombrar, parte del proyecto abierto', () => {
    const accion = decidirAccionDelCartel({
      ...base,
      repoActivoId: 'repo-1',
      masPesado: { tipo: 'dolphin', bytes: 1024 ** 3 },
      servidores: [{ id: 'ssh:vps-ana', nombre: 'vps-ana' }]
    })
    expect(accion).toMatchObject({ tipo: 'correr', worktreeId: null, repoId: 'repo-1' })
  })

  it('sin espacio ni proyecto abierto, igual ofrece el servidor, sin objetivo', () => {
    const accion = decidirAccionDelCartel({
      ...base,
      masPesado: { tipo: 'dolphin', bytes: 1024 ** 3 },
      servidores: [{ id: 'ssh:vps-ana', nombre: 'vps-ana' }]
    })
    expect(accion).toEqual({
      tipo: 'correr',
      servidor: { id: 'ssh:vps-ana', nombre: 'vps-ana' },
      worktreeId: null,
      nombre: null,
      repoId: null,
      objetivo: null
    })
  })
})
