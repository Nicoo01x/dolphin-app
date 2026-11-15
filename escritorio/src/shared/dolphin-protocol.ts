export const DOLPHIN_PROTOCOL = 'dolphin:'
export const LEGACY_DOLPHIN_PROTOCOL = 'orca:'

export function isDolphinProtocol(protocol: string): boolean {
  return protocol === DOLPHIN_PROTOCOL || protocol === LEGACY_DOLPHIN_PROTOCOL
}
