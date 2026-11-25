import { describe, expect, it } from 'vitest'
import {
  describeRuntimeHostDiagnosis,
  diagnoseAnsweredRuntimeHost,
  diagnoseFailedRuntimeHost,
  localTailnetStateFromInterfaces,
  runtimeServerProduct
} from './runtime-host-diagnosis'
import { runtimeHostStatusFailure } from './runtime-host-status'

const TAILNET_ENDPOINT = 'ws://100.104.98.122:6768'
const LAN_ENDPOINT = 'ws://192.168.1.20:6768'

describe('qué programa contestó', () => {
  it('reconoce Dolphin por sus capacidades dolphind.*', () => {
    expect(runtimeServerProduct(['skills.x.v1', 'dolphind.terminal-census.v1'])).toBe('dolphin')
  })

  it('reconoce el servidor de la base por su prefijo, sin ninguna dolphind.*', () => {
    expect(runtimeServerProduct(['pairing.device-key.v1', 'orcad.terminal-census.v1'])).toBe('base')
  })

  it('no acusa a nadie sin capacidades que lo delaten', () => {
    expect(runtimeServerProduct(undefined)).toBe('unknown')
    expect(runtimeServerProduct([])).toBe('unknown')
    expect(runtimeServerProduct(['pairing.device-key.v1'])).toBe('unknown')
  })

  it('un servidor que contestó es Dolphin salvo que se delate como el de la base', () => {
    expect(
      diagnoseAnsweredRuntimeHost({
        capabilities: ['orcad.migration-blob.v1'],
        appVersion: '1.4.229'
      })
    ).toEqual({ reason: 'not-dolphin', product: 'base', serverVersion: '1.4.229' })
    expect(
      diagnoseAnsweredRuntimeHost({
        capabilities: ['dolphind.peer-desktops.v1'],
        appVersion: '1.7.0'
      })
    ).toEqual({ reason: 'connected', product: 'dolphin', serverVersion: '1.7.0' })
    expect(diagnoseAnsweredRuntimeHost({})).toEqual({
      reason: 'connected',
      product: 'unknown',
      serverVersion: null
    })
  })
})

describe('por qué falló', () => {
  const fail = (code: string) => runtimeHostStatusFailure(code, 'x')

  it.each(['unauthorized', 'forbidden', 'device_revoked', 'bad_proof', 'bad_auth'])(
    '%s es un emparejamiento vencido',
    (code) => {
      expect(diagnoseFailedRuntimeHost(fail(code), TAILNET_ENDPOINT, 'up')).toEqual({
        reason: 'pairing-expired'
      })
    }
  )

  it.each([
    'invalid_runtime_response',
    'protocol_version_mismatch',
    'method_not_found',
    'unsupported_method'
  ])('%s es incompatible', (code) => {
    expect(diagnoseFailedRuntimeHost(fail(code), TAILNET_ENDPOINT, 'down')).toEqual({
      reason: 'incompatible'
    })
  })

  it.each(['remote_runtime_unavailable', 'runtime_unavailable', 'runtime_timeout', 'timeout'])(
    '%s con dirección de tailnet y Tailscale local apagado es tailscale-off',
    (code) => {
      expect(diagnoseFailedRuntimeHost(fail(code), TAILNET_ENDPOINT, 'down')).toEqual({
        reason: 'tailscale-off'
      })
    }
  )

  it('con Tailscale prendido o sin saberlo, es el servidor el que no contesta', () => {
    const failure = fail('remote_runtime_unavailable')
    expect(diagnoseFailedRuntimeHost(failure, TAILNET_ENDPOINT, 'up')?.reason).toBe(
      'host-unreachable'
    )
    expect(diagnoseFailedRuntimeHost(failure, TAILNET_ENDPOINT, 'unknown')?.reason).toBe(
      'host-unreachable'
    )
  })

  it('una dirección que no es de la tailnet nunca culpa a Tailscale', () => {
    expect(
      diagnoseFailedRuntimeHost(fail('remote_runtime_unavailable'), LAN_ENDPOINT, 'down')
    ).toEqual({ reason: 'host-unreachable' })
  })

  it('un fallo que no dice nada no tiene diagnóstico', () => {
    expect(
      diagnoseFailedRuntimeHost(fail('runtime_manually_disconnected'), TAILNET_ENDPOINT, 'down')
    ).toBeNull()
  })
})

describe('si esta máquina está en la tailnet', () => {
  it('ve la IPv4 100.x de Tailscale', () => {
    expect(
      localTailnetStateFromInterfaces({
        Ethernet: [{ address: '192.168.1.5' }],
        Tailscale: [{ address: '100.88.1.2' }, { address: 'fe80::1' }]
      })
    ).toBe('up')
  })

  it('ve la IPv6 fd7a:115c:a1e0 de Tailscale', () => {
    expect(localTailnetStateFromInterfaces({ Tailscale: [{ address: 'fd7a:115c:a1e0::5' }] })).toBe(
      'up'
    )
  })

  it('el adaptador sin 100.x (Tailscale apagado o sin sesión) cuenta como apagado', () => {
    // Lo que da os.networkInterfaces() en la PC de Nico con Tailscale en NoState.
    expect(
      localTailnetStateFromInterfaces({
        Ethernet: [{ address: '192.168.0.10' }, { address: 'fe80::aa' }],
        Tailscale: [{ address: 'fe80::84bf:20fe:4d3:21ca' }],
        'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1' }, { address: '::1' }]
      })
    ).toBe('down')
  })

  it('100.x fuera de 100.64.0.0/10 no es de la tailnet', () => {
    expect(localTailnetStateFromInterfaces({ eth0: [{ address: '100.200.1.1' }] })).toBe('down')
  })

  it('sin interfaces no se sabe', () => {
    expect(localTailnetStateFromInterfaces({})).toBe('unknown')
    expect(localTailnetStateFromInterfaces({ eth0: undefined })).toBe('unknown')
  })
})

describe('el texto', () => {
  it('dice otro programa y su versión cuando es el de la base', () => {
    const copy = describeRuntimeHostDiagnosis(
      { reason: 'not-dolphin', product: 'base', serverVersion: '1.4.229' },
      { endpoint: TAILNET_ENDPOINT }
    )
    expect(copy.title).toBe('Ese servidor no es Dolphin')
    expect(copy.detail).toContain('otro programa 1.4.229')
    expect(copy.detail).toContain(TAILNET_ENDPOINT)
  })

  it('dice qué hacer con Tailscale apagado', () => {
    const copy = describeRuntimeHostDiagnosis({ reason: 'tailscale-off' })
    expect(copy.title).toBe('Tailscale está apagado en esta máquina')
    expect(copy.detail).toMatch(/Abrí Tailscale/)
  })
})
