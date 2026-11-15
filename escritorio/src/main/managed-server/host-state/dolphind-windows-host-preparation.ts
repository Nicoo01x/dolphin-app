// Stage pinned Node and a content-addressed host script so Windows operations share verified bytes without replacing running clients' code.
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { ensureRemoteDolphindNodeRuntime } from '../install/dolphind-remote-node-runtime'
import {
  installDolphindWindowsHostScript,
  dolphindRemoteBaseDir
} from '../install/dolphind-remote-windows-node'
import { materializeNodeRuntimeArchive } from '../../node-runtime/pinned-runtime-materializer'
import type { DolphindHostTransport } from '../install/dolphind-host-transport'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

export async function prepareWindowsDolphindHost(options: {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  serverTarget: NodeRuntimeTarget
  signal?: AbortSignal
}): Promise<void> {
  const baseDir = dolphindRemoteBaseDir(options.host, options.remoteHome)
  await ensureRemoteDolphindNodeRuntime({
    conn: options.conn,
    host: options.host,
    // The runtime store is a sibling of slots; only this synthetic slot's parent is used.
    slotDir: joinRemotePath(options.host, baseDir, 'dolphind-host'),
    target: options.serverTarget,
    archivePath: () =>
      materializeNodeRuntimeArchive(
        options.serverTarget,
        join(getAppEnvironment().getPath('userData'), 'dolphind-artifacts'),
        { signal: options.signal }
      ),
    signal: options.signal
  })
  await installDolphindWindowsHostScript(options, baseDir)
}
