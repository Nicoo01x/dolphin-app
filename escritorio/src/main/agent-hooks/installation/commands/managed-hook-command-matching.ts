import {
  getWindowsNativeHookAgent,
  WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME
} from './windows-native-hook-executable'
import { getDolphinManagedScriptFileName } from '../scripts/managed-hook-script-path'

import type { HookCommandConfig, HookDefinition } from '../configuration/hook-config-schema'

// Match script names so reinstalls sweep entries from old and parallel installations.
export function createManagedCommandMatcher(scriptFileName: string): (command: unknown) => boolean {
  const dolphinScriptFileName = getDolphinManagedScriptFileName(scriptFileName)
  // Why: a hook written before the dolphin- prefix keeps its bare name; match both stems so it is still swept.
  const stems = [dolphinScriptFileName, dolphinScriptFileName.replace(/^dolphin-/, '')]
  // Sweep every platform suffix after a platform switch.
  const needles = stems.flatMap((name) => {
    const stem = name.replace(/\.(?:cmd|ps1|sh)$/, '').toLowerCase()
    return ['cmd', 'ps1', 'sh'].map((extension) => `agent-hooks/${stem}.${extension}`)
  })
  // The native executable selects its provider through argv[1].
  const nativeHook = `agent-hooks/${WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME.toLowerCase()} ${getWindowsNativeHookAgent(scriptFileName).toLowerCase()} `
  // hooks.json is user-editable, so a command may not be a string.
  return (command) => {
    if (typeof command !== 'string' || !command) {
      return false
    }
    const decodedCommand = decodePowerShellEncodedCommand(command)
    const searchText = decodedCommand ? `${command}\n${decodedCommand}` : command
    const normalizedCommand = searchText.replaceAll('\\', '/').toLowerCase()
    const dolphinPath = /(?:^|[/'" ])\.dolphin\/agent-hooks\//i.test(normalizedCommand)
    const legacyDolphinPath = /(?:^|[/'" ])dolphin dev[^\n]*\/agent-hooks\//i.test(
      normalizedCommand
    )
    const matchesScript = needles.some((needle) => normalizedCommand.includes(needle))
    const matchesNativeHook = normalizedCommand
      .split('\n')
      .some((line) => `${line} `.includes(nativeHook))
    return (dolphinPath || legacyDolphinPath) && (matchesScript || matchesNativeHook)
  }
}

function decodePowerShellEncodedCommand(command: string): string | null {
  const match = command.match(/\s-EncodedCommand\s+(\S+)/i)
  if (!match) {
    return null
  }
  try {
    return Buffer.from(match[1], 'base64').toString('utf16le')
  } catch {
    return null
  }
}

export function removeManagedCommands(
  definitions: HookDefinition[],
  isManagedCommand: (command: string | undefined) => boolean
): HookDefinition[] {
  return definitions.flatMap((definition) => {
    const directCommandKeys = ['command', 'bash', 'powershell'] as const
    const directManagedKeys = directCommandKeys.filter((key) => isManagedCommand(definition[key]))
    const hasNestedHooks = Array.isArray(definition.hooks)
    const hasManagedNestedHook =
      hasNestedHooks &&
      definition.hooks!.some((hook) => hookHasManagedCommand(hook, isManagedCommand))

    if (directManagedKeys.length === 0 && !hasManagedNestedHook) {
      return [definition]
    }

    const nextDefinition: HookDefinition = { ...definition }
    for (const key of directManagedKeys) {
      delete nextDefinition[key]
    }

    if (hasManagedNestedHook) {
      const filteredHooks = definition.hooks!.filter(
        (hook) => !hookHasManagedCommand(hook, isManagedCommand)
      )
      if (filteredHooks.length > 0) {
        nextDefinition.hooks = filteredHooks
      } else {
        delete nextDefinition.hooks
      }
    }

    const hasCommandAfterCleanup =
      directCommandKeys.some((key) => typeof nextDefinition[key] === 'string') ||
      (Array.isArray(nextDefinition.hooks) && nextDefinition.hooks.length > 0)
    if (!hasCommandAfterCleanup) {
      return []
    }

    return [nextDefinition]
  })
}

function hookHasManagedCommand(hook: HookCommandConfig, matches: (value?: string) => boolean) {
  const args = Array.isArray(hook.args) ? hook.args : []
  return matches(hook.command) || args.some((arg) => typeof arg === 'string' && matches(arg))
}

// Users may opt a managed hook into async; keep that choice when the hook is rewritten.
export function withPreviousManagedAsync(
  hook: HookCommandConfig,
  definitions: HookDefinition[],
  matches: (command: string | undefined) => boolean
): HookCommandConfig {
  const async = definitions
    .flatMap((definition) => (Array.isArray(definition.hooks) ? definition.hooks : []))
    .find((prev) => typeof prev.async === 'boolean' && hookHasManagedCommand(prev, matches))?.async
  return async === undefined ? hook : { ...hook, async }
}

export function hookDefinitionHasManagedCommand(
  definition: HookDefinition,
  isManagedCommand: (command: string | undefined) => boolean
): boolean {
  return (
    isManagedCommand(definition.command) ||
    isManagedCommand(definition.bash) ||
    isManagedCommand(definition.powershell) ||
    (Array.isArray(definition.hooks) &&
      definition.hooks.some((hook) => hookHasManagedCommand(hook, isManagedCommand)))
  )
}
