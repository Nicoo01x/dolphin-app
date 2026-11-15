let listener: (environmentId: string) => void | Promise<void> = () => {}

export function setManagedDolphindPairingRepairedListener(
  next: (environmentId: string) => void | Promise<void>
): void {
  listener = next
}

export function notifyManagedDolphindPairingRepaired(environmentId: string): void | Promise<void> {
  return listener(environmentId)
}
