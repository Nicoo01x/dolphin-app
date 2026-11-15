// Remember repeatable deployment refusals per app version; host-fixable settings must be reprobed.

export class DolphindHostUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DolphindHostUnsupportedError'
  }
}

export class DolphindArtifactsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DolphindArtifactsUnavailableError'
  }
}

export class DolphindStdioBridgeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DolphindStdioBridgeUnavailableError'
  }
}

export const DOLPHIND_TUNNEL_UNAVAILABLE_REASON = 'ssh_tunnel_unavailable'
export const DOLPHIND_WINDOWS_LAUNCH_REFUSED_CODE = 'dolphind_windows_launch_refused'
export const DOLPHIND_WINDOWS_COMMAND_LINE_UNSAFE_CODE = 'dolphind_windows_command_line_unsafe'

export type DolphindHostUnavailableReason =
  | 'unsupported_host'
  | 'artifacts_unavailable'
  | 'libc_unidentified'
  | 'runtime_self_test'
  | 'runtime_noexec'
  | 'windows_build_unsupported'
  | 'windows_no_extractor'
  | 'security_software'
  | 'native_preflight'
  | typeof DOLPHIND_TUNNEL_UNAVAILABLE_REASON

const UNAVAILABLE_BY_ERROR_NAME: Record<string, DolphindHostUnavailableReason> = {
  DolphindHostUnsupportedError: 'unsupported_host',
  DolphindArtifactsUnavailableError: 'artifacts_unavailable',
  DolphindRemoteLaunchUnsupportedError: 'unsupported_host',
  UnidentifiedHostLibcError: 'libc_unidentified',
  RemoteNodeRuntimeSelfTestError: 'runtime_self_test',
  RemoteNodeRuntimeNoexecError: 'runtime_noexec',
  RemoteWindowsBuildUnsupportedError: 'windows_build_unsupported',
  RemoteNodeRuntimeNoExtractorError: 'windows_no_extractor',
  RemoteNodeRuntimeSecurityModifiedError: 'security_software',
  DolphindStdioBridgeUnavailableError: DOLPHIND_TUNNEL_UNAVAILABLE_REASON,
  DolphindWindowsLaunchRefusedError: 'unsupported_host',
  DolphindWindowsCommandLineError: 'unsupported_host'
}

// Native preflight, PTY self-test and permanent Windows refusals repeat; transient races do not.
const UNAVAILABLE_BY_DEFERRAL_CODE: Record<string, DolphindHostUnavailableReason> = {
  dolphind_candidate_preflight_failed: 'native_preflight',
  dolphind_activation_pty_self_test_failed: 'native_preflight',
  [DOLPHIND_WINDOWS_LAUNCH_REFUSED_CODE]: 'unsupported_host',
  [DOLPHIND_WINDOWS_COMMAND_LINE_UNSAFE_CODE]: 'unsupported_host'
}

// Reprobed on every connect, so fixing or upgrading the host needs no new Dolphin version.
const FIXABLE_ON_HOST: ReadonlySet<string> = new Set<DolphindHostUnavailableReason>([
  'runtime_noexec',
  'windows_build_unsupported',
  'windows_no_extractor'
])

export function isDolphindHostUnavailableFixableOnHost(reason: string): boolean {
  return FIXABLE_ON_HOST.has(reason)
}

export function dolphindCandidateLaunchFailureCode(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === DOLPHIND_WINDOWS_LAUNCH_REFUSED_CODE ||
    code === DOLPHIND_WINDOWS_COMMAND_LINE_UNSAFE_CODE
    ? code
    : 'dolphind_candidate_launch_failed'
}

export function classifyDolphindHostUnavailable(
  failure: unknown
): DolphindHostUnavailableReason | null {
  if (failure instanceof Error) {
    return UNAVAILABLE_BY_ERROR_NAME[failure.name] ?? null
  }
  if (failure && typeof failure === 'object' && 'code' in failure) {
    const code = failure.code
    return typeof code === 'string' ? (UNAVAILABLE_BY_DEFERRAL_CODE[code] ?? null) : null
  }
  return null
}
