import { describe, expect, it } from 'vitest'
import { remoteRuntimeAuthReplyError } from './remote-runtime-request-frames'

function rejected(errorCode: string | null) {
  return { kind: 'rejected' as const, type: 'e2ee_error', errorCode }
}

describe('el rechazo de la autenticación del servidor', () => {
  it('acepta lo autenticado', () => {
    expect(remoteRuntimeAuthReplyError({ kind: 'authenticated' } as never)).toBeNull()
  })

  it.each(['unauthorized', 'device_revoked'])('%s es un emparejamiento que ya no vale', (code) => {
    expect(remoteRuntimeAuthReplyError(rejected(code))?.code).toBe('unauthorized')
  })

  it('registry_unavailable es pasajero: se reintenta, no se bloquea', () => {
    expect(remoteRuntimeAuthReplyError(rejected('registry_unavailable'))?.code).toBe(
      'remote_runtime_busy'
    )
  })

  it.each(['bad_auth', 'bad_proof', null])('%s sigue siendo una respuesta inválida', (code) => {
    expect(remoteRuntimeAuthReplyError(rejected(code))?.code).toBe('invalid_runtime_response')
  })
})
