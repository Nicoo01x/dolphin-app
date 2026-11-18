// Lo que se le dice a alguien cuyo host SSH no quedó servido. El caso que importa: cuando la
// build no trae el servidor, el consejo no puede ser «instalá una versión vieja».

import { describe, expect, it } from 'vitest'
import { unservedHostServerMessage } from './host-server/ssh-host-unserved-status'

describe('el mensaje de un host que no quedó servido', () => {
  it('cuando la build no incluye el servidor, lo dice y no manda a instalar una version vieja', () => {
    for (const detail of ['artifacts_unavailable', 'unsupported_host']) {
      const texto = unservedHostServerMessage({
        route: 'unserved',
        reason: 'dolphind_unavailable',
        detail
      })
      expect(texto).toContain('ships without the server')
      expect(texto).not.toContain('install an older version')
    }
  })

  it('el home montado sin permiso de ejecutar sigue teniendo su propio mensaje', () => {
    expect(
      unservedHostServerMessage({
        route: 'unserved',
        reason: 'dolphind_unavailable',
        detail: 'runtime_noexec'
      })
    ).toContain('noexec')
  })

  it('un motivo que no sabemos leer cae al mensaje general, que manda a actualizar', () => {
    const texto = unservedHostServerMessage({
      route: 'unserved',
      reason: 'dolphind_unavailable',
      detail: 'algo_que_no_conocemos'
    })
    expect(texto).toContain('Update Dolphin')
    expect(texto).not.toContain('older version')
  })

  it.each([
    ['libc_unidentified', 'ldd --version'],
    ['native_preflight', 'glibc 2.28'],
    ['ssh_tunnel_unavailable', 'AllowTcpForwarding'],
    ['runtime_self_test', 'self-test'],
    ['security_software', 'Security software']
  ])('el motivo %s dice qué arreglar en el host', (detail, remedio) => {
    const texto = unservedHostServerMessage({
      route: 'unserved',
      reason: 'dolphind_unavailable',
      detail
    })
    expect(texto).toContain(remedio)
    expect(texto).not.toContain('older version')
  })

  it('una terminal viva de una version anterior se explica por si misma', () => {
    expect(
      unservedHostServerMessage({ route: 'unserved', reason: 'relay_terminals_live' })
    ).toContain('still running on this host')
  })
})
