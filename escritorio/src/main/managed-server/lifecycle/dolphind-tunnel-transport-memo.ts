export type DolphindTunnelTransport = 'tcp_forward' | 'stdio_bridge'

const transports = new Map<string, DolphindTunnelTransport>()

export function rememberDolphindTunnelTransport(
  targetId: string,
  transport: DolphindTunnelTransport
): void {
  transports.set(targetId, transport)
}

export function knownDolphindTunnelTransport(targetId: string): DolphindTunnelTransport | null {
  return transports.get(targetId) ?? null
}
