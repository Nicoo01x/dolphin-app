// SSH forwarding needs only loopback; network exposure must be an explicit operator choice.
import { isIP } from 'node:net'

export const DOLPHIND_LOOPBACK_BIND_HOST = '127.0.0.1'
const ALL_INTERFACES_V4 = '0.0.0.0'
const ALL_INTERFACES_V6 = '::'

export class DolphindBindAddressError extends Error {
  readonly code = 'dolphind_invalid_bind_address'
}

/**
 * Resolve `--bind`. Literal IPs only.
 *
 * Why not hostnames: `listen()` resolves a name through DNS, so the interface actually
 * bound is decided by resolver configuration this process cannot see. An operator who
 * writes `--bind internal.example` would have no way to know whether the service came up
 * on a private interface or a public one.
 */
export function resolveDolphindBindHost(
  raw?: string,
  options: { allowPublicNetwork?: boolean } = {}
): string {
  if (raw === undefined) {
    return DOLPHIND_LOOPBACK_BIND_HOST
  }
  const value = raw.trim()
  if (value === '') {
    throw new DolphindBindAddressError('--bind expects an address')
  }
  if (value === 'localhost') {
    return DOLPHIND_LOOPBACK_BIND_HOST
  }
  if (value.includes('%')) {
    throw new DolphindBindAddressError(
      `--bind does not support scoped IPv6 addresses (got '${value}'). Use an unscoped literal IPv6 address.`
    )
  }
  if (isIP(value) === 0) {
    throw new DolphindBindAddressError(
      `--bind expects a literal IP address (got '${value}'). Hostnames are refused because ` +
        'DNS decides which interface would be bound. Use 127.0.0.1 for loopback, or ' +
        '0.0.0.0 to expose every interface.'
    )
  }
  if (bindHostIsPublic(value) && options.allowPublicNetwork !== true) {
    throw new DolphindBindAddressError(
      `--bind ${value} reaches the public internet, and this runtime runs commands and reads ` +
        'files on this machine: anything that can reach the port can attempt pairing. Bind the ' +
        `private address of the interface you meant (for example ${EXAMPLE_PRIVATE_HOST}), reach ` +
        'it over an SSH local port-forward, or pass --expose-to-public-network to say you meant ' +
        'the open internet.'
    )
  }
  return value
}

const EXAMPLE_PRIVATE_HOST = '192.168.1.10'

/**
 * Si esta direccion llega a la internet abierta.
 *
 * Why separar publica de privada y no quedarse en «expuesta»: el caso de uso real de exponer el
 * runtime es el celular en la misma red, y eso es una IP privada. Pedir una bandera para eso seria
 * friccion sin riesgo nuevo. Lo que cambia de naturaleza es la internet abierta, donde el que
 * toca la puerta no es alguien que ya esta en tu casa.
 *
 * Las dos direcciones de «todas las interfaces» cuentan como publicas porque incluyen cualquier
 * interfaz publica que la maquina tenga ahora o llegue a tener, que es justo el caso de un VPS.
 */
export function bindHostIsPublic(host: string): boolean {
  if (host === ALL_INTERFACES_V4 || host === ALL_INTERFACES_V6) {
    return true
  }
  if (isIP(host) === 4) {
    return !esPrivadaV4(host)
  }
  return isIP(host) === 6 ? !esPrivadaV6(host) : false
}

function esPrivadaV4(host: string): boolean {
  const [a = 0, b = 0] = host.split('.').map(Number)
  return (
    a === 127 || // loopback
    a === 10 || // 10/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 169 && b === 254) || // link-local
    (a === 100 && b >= 64 && b <= 127) // CGNAT, 100.64/10
  )
}

function esPrivadaV6(host: string): boolean {
  // Why normalizar en minuscula y sin la zona: `FE80::1%eth0` es la misma direccion que `fe80::1`,
  // y la zona no cambia el prefijo.
  const normal = host.toLowerCase().split('%')[0] ?? ''
  if (normal === '::1') {
    return true
  }
  // El primer grupo de 16 bits decide el prefijo. Una direccion que arranca con `::` tiene ese
  // grupo en cero, que no es ninguno de los rangos privados.
  const primerGrupo = normal.startsWith('::') ? 0 : Number.parseInt(normal.split(':')[0] ?? '', 16)
  if (Number.isNaN(primerGrupo)) {
    return false
  }
  // fc00::/7 son los unique local; fe80::/10 los link-local, que llegan hasta febf y NO hasta
  // feff: fec0::/10 fue site-local, esta deprecado y no es privado por esta regla.
  return (
    (primerGrupo >= 0xfc00 && primerGrupo <= 0xfdff) ||
    (primerGrupo >= 0xfe80 && primerGrupo <= 0xfebf)
  )
}

/** True when this address reaches beyond the local machine. */
export function bindHostIsNetworkExposed(host: string): boolean {
  if (host === ALL_INTERFACES_V4 || host === ALL_INTERFACES_V6) {
    return true
  }
  if (isIP(host) === 4) {
    return !host.startsWith('127.')
  }
  return host !== '::1'
}

export function describeDolphindBindExposure(host: string): string {
  return bindHostIsNetworkExposed(host)
    ? `dolphind is bound to ${host} and is reachable from the network. Anything that can reach ` +
        'this port can attempt pairing.'
    : `dolphind is bound to ${host} (local only). Reach it from another machine with an SSH ` +
        'local port-forward, or re-launch with --bind to expose it.'
}
