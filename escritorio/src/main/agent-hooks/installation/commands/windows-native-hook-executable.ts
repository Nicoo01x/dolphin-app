import { join, win32 } from 'node:path'

export const WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME = 'dolphin-agent-hook.exe'

export function getWindowsNativeHookAgent(scriptPath: string): string {
  // win32: these are Windows paths even when the code runs (or is tested) on another host.
  const agent = win32.basename(scriptPath).replace(/-hook(?:\.(?:cmd|ps1|sh))?$/, '')
  return agent.startsWith('dolphin-') ? agent.slice('dolphin-'.length) : agent
}

/** CLI hosts have no bundled binary; dev paths may resolve without a file, so installers check existence. */
export function resolveBundledWindowsNativeHookExecutable(): string | null {
  // CLI builds lack the Electron Process type.
  const resourcesPath = 'resourcesPath' in process ? process.resourcesPath : undefined
  return process.platform === 'win32' && typeof resourcesPath === 'string' && resourcesPath
    ? join(resourcesPath, 'bin', WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME)
    : null
}
