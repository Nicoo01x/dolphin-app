import { describe, expect, it } from 'vitest'
import { formatSshFailureWithNextStep } from './ssh-user-facing-error'
import { SSH_CONNECT_FAILURE_NEXT_STEPS } from '../../../../../../shared/ssh-connect-failure-kind'

describe('formatSshFailureWithNextStep', () => {
  it('leads a raw SSH error with what to do about it', () => {
    const text = formatSshFailureWithNextStep('All configured authentication methods failed')
    expect(text.startsWith(SSH_CONNECT_FAILURE_NEXT_STEPS.auth)).toBe(true)
    expect(text).toContain('(All configured authentication methods failed)')
  })

  it('does not repeat the next step main already put in front', () => {
    const published = `${SSH_CONNECT_FAILURE_NEXT_STEPS.timeout} (connect ETIMEDOUT 203.0.113.10:22)`
    const text = formatSshFailureWithNextStep(
      `Error invoking remote method 'ssh:testConnection': Error: ${published}`
    )
    expect(text.split(SSH_CONNECT_FAILURE_NEXT_STEPS.timeout)).toHaveLength(2)
    expect(text).toContain('(Connection timed out)')
  })

  it('keeps an error it can’t classify as it was', () => {
    expect(formatSshFailureWithNextStep('Something odd')).toBe('Something odd')
  })
})
