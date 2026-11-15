import { RuntimeClientError } from '../../runtime-client'

export function resolveCompatibilityCliCommand(): 'dolphin' | 'dolphin-ide' | 'dolphin-dev' {
  const configured = process.env.DOLPHIN_CLI_COMMAND
  if (configured === 'dolphin' || configured === 'dolphin-ide' || configured === 'dolphin-dev') {
    return configured
  }
  // Why `dolphin` también en Linux: el lanzador de Dolphin en Linux es `dolphin`, no `dolphin-ide`
  // (ver `getDolphinCliCommandNameForPlatform`).
  return 'dolphin'
}

export function resolvePackagedWindowsCompatibilityCommand(): 'dolphin' | 'dolphin-ide' | undefined {
  if (process.env.DOLPHIN_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.DOLPHIN_CLI_COMMAND
  if (command === 'dolphin' || command === 'dolphin-ide') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged Dolphin launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.DOLPHIN_DEV_CLI_INVOCATION === '1' ||
    (process.env.DOLPHIN_USER_DATA_PATH?.includes('dolphin-dev') ?? false)
  )
}
