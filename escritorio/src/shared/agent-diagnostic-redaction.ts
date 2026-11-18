import { redactEphemeralVmRecipeDiagnosticText } from './ephemeral-vm-recipe-diagnostic-redaction'

// Unquoted secrets common in provisioning and SSH output; the shared redactor covers URLs and JSON fields.
const BEARER_TOKEN = /\b(authorization\s*:\s*(?:bearer|token|basic)\s+)\S+/gi
const SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSPHRASE|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi
// A pasted private key must never reach an agent's prompt, even cut in half by a log tail.
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g

/**
 * Text Dolphin hands to an agent (an error, a log tail) with its secrets taken out: credentials
 * in URLs, pairing codes, secret JSON fields, bearer tokens, `PASSWORD=…`-style assignments and
 * private key blocks. Fences are defused so the text cannot close ours and pose as instructions.
 */
export function redactAgentDiagnosticText(text: string): string {
  return redactEphemeralVmRecipeDiagnosticText(text)
    .replace(PRIVATE_KEY_BLOCK, '[redacted private key]')
    .replace(BEARER_TOKEN, '$1[redacted]')
    .replace(SECRET_ASSIGNMENT, '$1[redacted]')
    .replace(/```/g, "'''")
}
