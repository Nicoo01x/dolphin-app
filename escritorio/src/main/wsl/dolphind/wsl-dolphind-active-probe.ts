/**
 * WSL reads an active slot's liveness, readiness and pid in one guest command; SSH keeps
 * `probeActiveDolphindReadiness`'s separate reads. The answers are judged exactly as those are.
 */
import type { DolphindHostTarget } from '../../managed-server/install/dolphind-host-transport'
import type { DolphindRemoteContext } from '../../managed-server/install/dolphind-remote-context'
import { dolphindLivenessProbeCommand } from '../../managed-server/install/dolphind-remote-launch'
import { readDolphindReadinessNowCommand } from '../../managed-server/install/dolphind-remote-readiness-wait'
import { execDolphindRemote } from '../../managed-server/install/dolphind-remote-runtime-control'
import { DOLPHIND_PID_FILENAME } from '../../managed-server/install/dolphind-remote-host-support'
import { managedDolphindInstallDir } from '../../managed-server/lifecycle/dolphind-managed-runtime-context'
import {
  activeDolphindReadinessFromOutput,
  assertActiveDolphindLive,
  DolphindActiveReadinessError
} from '../../managed-server/activation/dolphind-active-readiness'
import { computeLocalDolphindBuildHash } from '../../managed-server/install/dolphind-local-build-hash'
import type { ServeReadiness } from '../../server/serve-readiness'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'

const SECTION_END = '__DOLPHIN_WSL_ACTIVE_PROBE_END__'

type WslContext = DolphindRemoteContext<DolphindHostTarget>

function pidCommand(context: WslContext, fullVersion: string): string {
  const pidFile = joinRemotePath(
    context.host,
    managedDolphindInstallDir(context, fullVersion),
    DOLPHIND_PID_FILENAME
  )
  return `cat ${quotePosixShell(pidFile)} 2>/dev/null || true`
}

function parsePid(output: string): number | null {
  const pid = Number.parseInt(output, 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

export async function readWslDolphindPid(
  context: WslContext,
  fullVersion: string,
  signal?: AbortSignal
): Promise<number | null> {
  return parsePid(
    await execCommand(context.connection, pidCommand(context, fullVersion), { signal })
  )
}

/** Each section ends with a marker on its own line; the newline before it is the probe's own. */
export function wslDolphindActiveProbeCommand(context: WslContext, fullVersion: string): string {
  const installDir = managedDolphindInstallDir(context, fullVersion)
  const end = `printf '\\n%s\\n' ${SECTION_END}`
  return [
    dolphindLivenessProbeCommand(context.host, installDir),
    end,
    readDolphindReadinessNowCommand(context.host, installDir),
    end,
    pidCommand(context, fullVersion)
  ].join('\n')
}

export async function probeWslActiveDolphind(
  context: WslContext,
  localDolphindDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<{ readiness: ServeReadiness; pid: number | null }> {
  const output = await execDolphindRemote(
    { conn: context.connection, host: context.host, signal },
    wslDolphindActiveProbeCommand(context, fullVersion)
  )
  const sections = output.split(`\n${SECTION_END}\n`)
  if (sections.length !== 3) {
    throw new DolphindActiveReadinessError(
      'unverifiable',
      `dolphind ${fullVersion} process state is unverifiable.`
    )
  }
  const [liveness = '', readiness = '', pid = ''] = sections
  const expectation = { buildHash: computeLocalDolphindBuildHash(localDolphindDir), fullVersion }
  assertActiveDolphindLive(liveness, expectation)
  return {
    readiness: activeDolphindReadinessFromOutput(context.host, readiness, expectation),
    pid: parsePid(pid)
  }
}
