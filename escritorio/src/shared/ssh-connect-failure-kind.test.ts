import { describe, expect, it } from 'vitest'
import {
  classifySshConnectFailureText,
  SSH_CONNECT_FAILURE_NEXT_STEPS
} from './ssh-connect-failure-kind'

describe('classifySshConnectFailureText', () => {
  it.each([
    ['All configured authentication methods failed', 'auth'],
    ['root@203.0.113.10: Permission denied (publickey,password).', 'auth'],
    ['Encrypted private OpenSSH key detected, but no passphrase given', 'passphrase'],
    ['Host key verification failed.', 'host-key'],
    ['connect ECONNREFUSED 203.0.113.10:22', 'refused'],
    ['getaddrinfo ENOTFOUND vps.example.invalid', 'host-name'],
    ['ssh: Could not resolve hostname vps: Name or service not known', 'host-name'],
    ['connect EHOSTUNREACH 203.0.113.10:22', 'unreachable'],
    ['Timed out while waiting for handshake', 'timeout']
  ])('reads %j as %s', (text, kind) => {
    expect(classifySshConnectFailureText(text)).toBe(kind)
  })

  it('recognises a failure main already published with its next step in front', () => {
    const published = `${SSH_CONNECT_FAILURE_NEXT_STEPS.timeout} (something unusual)`
    expect(classifySshConnectFailureText(published)).toBe('timeout')
  })

  it('leaves a cancelled sign-in and an unknown error unclassified', () => {
    expect(classifySshConnectFailureText('Connection to vps was cancelled')).toBeNull()
    expect(classifySshConnectFailureText('something odd happened')).toBeNull()
  })

  it('keeps every next step free of host-specific words', () => {
    for (const step of Object.values(SSH_CONNECT_FAILURE_NEXT_STEPS)) {
      expect(step).not.toMatch(/\d+\.\d+\.\d+\.\d+|@/)
    }
  })
})
