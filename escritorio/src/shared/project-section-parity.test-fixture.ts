// Host answers both the desktop sidebar's and the phone's Project grouping tests run on.
import type { MobileProjectSectionCatalog } from './mobile-project-sections-contract'
import type { ExecutionHostId } from './execution-host'
import {
  projectHostSetupProjectionFromRepos,
  type ProjectHostSetupProjection
} from './project-host-setup-projection'
import type { Repo } from './repo-types'
import type { RuntimeClientTarget } from './runtime-client-target'

const dolphinRemote = {
  canonicalKey: 'github.com/stablyai/dolphin',
  remoteName: 'origin',
  remoteUrl: 'git@github.com:stablyai/dolphin.git'
}

function hostRepo(id: string, path: string, displayName = 'dolphin'): Repo {
  return {
    id,
    path,
    displayName,
    badgeColor: '#737373',
    addedAt: 1,
    ...(displayName === 'dolphin' ? { gitRemoteIdentity: dolphinRemote } : {})
  }
}

export type ParityHostAnswer = {
  target: RuntimeClientTarget
  hostId: ExecutionHostId
  /** In the host's own repo.list order. */
  repos: Repo[]
  /** The host's project.list/projectHostSetup.list rows; null for a host that predates them. */
  lists: ProjectHostSetupProjection | null
}

const localRepos = [
  hostRepo('local-stably', '/Users/jinwoo/stably/dolphin'),
  hostRepo('local-assets', '/Users/jinwoo/design-assets', 'design-assets'),
  hostRepo('local-workspace', '/Users/jinwoo/dolphin/workspaces/dolphin/dolphin')
]
const windowsRepo = hostRepo('win-dolphin', 'C:/Users/jinwo/dolphin/dolphin')

// Several local checkouts plus copies of the same project on two servers.
export const PROJECT_SECTION_PARITY_HOSTS: readonly ParityHostAnswer[] = [
  {
    target: { kind: 'local' },
    hostId: 'local',
    repos: localRepos,
    lists: projectHostSetupProjectionFromRepos(localRepos)
  },
  {
    target: { kind: 'environment', environmentId: 'windows2' },
    hostId: 'runtime:windows2',
    repos: [windowsRepo],
    // A server's own catalog rows: its project name and an imported setup on its local host.
    lists: {
      projects: [
        {
          id: 'github:stablyai/dolphin',
          displayName: 'Dolphin',
          badgeColor: '#737373',
          providerIdentity: { provider: 'github', owner: 'stablyai', repo: 'dolphin' },
          sourceRepoIds: [windowsRepo.id],
          createdAt: 5,
          updatedAt: 5
        }
      ],
      setups: [
        {
          id: 'win-setup',
          projectId: 'github:stablyai/dolphin',
          hostId: 'local',
          repoId: windowsRepo.id,
          path: windowsRepo.path,
          displayName: 'dolphin',
          setupState: 'ready',
          setupMethod: 'imported-existing-folder',
          createdAt: 5,
          updatedAt: 5
        }
      ]
    }
  },
  {
    target: { kind: 'environment', environmentId: 'm4air' },
    hostId: 'runtime:m4air',
    repos: [
      hostRepo('m4-dolphin', '/Users/m4air/dolphin/dolphin'),
      hostRepo('m4-dolphin-two', '/Users/m4air/dolphin-two/dolphin')
    ],
    lists: null
  }
]

/** Workspace rows; activity order differs from catalog order, so Recent and Manual disagree. */
export const PROJECT_SECTION_PARITY_ROWS: readonly {
  id: string
  repoId: string
  lastActivityAt: number
}[] = [
  { id: 'wt-m4-two', repoId: 'm4-dolphin-two', lastActivityAt: 90 },
  { id: 'wt-win', repoId: 'win-dolphin', lastActivityAt: 70 },
  { id: 'wt-workspace', repoId: 'local-workspace', lastActivityAt: 50 },
  { id: 'wt-stably', repoId: 'local-stably', lastActivityAt: 30 },
  { id: 'wt-m4', repoId: 'm4-dolphin', lastActivityAt: 10 }
]

// Same-host checkouts still need path prefixes; other machines do not.
const STABLY = {
  key: 'project:github:stablyai/dolphin::setup:local-stably',
  label: 'stably/dolphin'
}
const WORKSPACE = {
  key: 'project:github:stablyai/dolphin::setup:local-workspace',
  label: 'dolphin/dolphin'
}
// Why 'dolphin', not the server's 'Dolphin': the later host's derived project name wins the merge.
const WINDOWS = { key: 'project:github:stablyai/dolphin', label: 'dolphin' }
const M4 = { key: 'project:github:stablyai/dolphin::setup:m4-dolphin', label: 'dolphin/dolphin' }
const M4_TWO = {
  key: 'project:github:stablyai/dolphin::setup:m4-dolphin-two',
  label: 'dolphin-two/dolphin'
}
const ASSETS = { key: 'project:repo:local-assets', label: 'design-assets' }

export const PROJECT_SECTION_PARITY_HEADERS = {
  recent: [M4_TWO, WINDOWS, WORKSPACE, STABLY, M4, ASSETS],
  manual: [STABLY, ASSETS, WORKSPACE, WINDOWS, M4, M4_TWO]
} as const

/** What main serves the phone for these answers (the renderer's published catalog). */
export const PROJECT_SECTION_PARITY_SERVED: MobileProjectSectionCatalog = {
  repos: [
    {
      id: 'local-stably',
      displayName: 'dolphin',
      path: '/Users/jinwoo/stably/dolphin',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'local-assets',
      displayName: 'design-assets',
      path: '/Users/jinwoo/design-assets',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'local-workspace',
      displayName: 'dolphin',
      path: '/Users/jinwoo/dolphin/workspaces/dolphin/dolphin',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'win-dolphin',
      displayName: 'dolphin',
      path: 'C:/Users/jinwo/dolphin/dolphin',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:windows2'
    },
    {
      id: 'm4-dolphin',
      displayName: 'dolphin',
      path: '/Users/m4air/dolphin/dolphin',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:m4air'
    },
    {
      id: 'm4-dolphin-two',
      displayName: 'dolphin',
      path: '/Users/m4air/dolphin-two/dolphin',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:m4air'
    }
  ],
  projects: [
    { id: 'repo:local-assets', displayName: 'design-assets' },
    { id: 'github:stablyai/dolphin', displayName: 'dolphin' }
  ],
  setups: [
    {
      id: 'local-stably',
      projectId: 'github:stablyai/dolphin',
      hostId: 'local',
      repoId: 'local-stably',
      path: '/Users/jinwoo/stably/dolphin',
      displayName: 'dolphin',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'local-assets',
      projectId: 'repo:local-assets',
      hostId: 'local',
      repoId: 'local-assets',
      path: '/Users/jinwoo/design-assets',
      displayName: 'design-assets',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'local-workspace',
      projectId: 'github:stablyai/dolphin',
      hostId: 'local',
      repoId: 'local-workspace',
      path: '/Users/jinwoo/dolphin/workspaces/dolphin/dolphin',
      displayName: 'dolphin',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'win-setup',
      projectId: 'github:stablyai/dolphin',
      hostId: 'runtime:windows2',
      repoId: 'win-dolphin',
      path: 'C:/Users/jinwo/dolphin/dolphin',
      displayName: 'dolphin',
      setupMethod: 'imported-existing-folder',
      connectionId: null,
      executionHostId: 'runtime:windows2'
    },
    {
      id: 'm4-dolphin',
      projectId: 'github:stablyai/dolphin',
      hostId: 'runtime:m4air',
      repoId: 'm4-dolphin',
      path: '/Users/m4air/dolphin/dolphin',
      displayName: 'dolphin',
      setupMethod: 'legacy-repo',
      executionHostId: 'runtime:m4air'
    },
    {
      id: 'm4-dolphin-two',
      projectId: 'github:stablyai/dolphin',
      hostId: 'runtime:m4air',
      repoId: 'm4-dolphin-two',
      path: '/Users/m4air/dolphin-two/dolphin',
      displayName: 'dolphin',
      setupMethod: 'legacy-repo',
      executionHostId: 'runtime:m4air'
    }
  ],
  projectOrderBy: 'manual'
}
