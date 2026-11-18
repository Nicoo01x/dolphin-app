import { redactAgentDiagnosticText } from './agent-diagnostic-redaction'

/** What Dolphin knows about the host that failed; every field is optional and none is a secret. */
export type VpsSetupAgentContext = {
  /** The SSH target id, when the host was saved. */
  targetId?: string
  /** The name the person gave it, or its address when it has none. */
  label?: string
  /** The last error the person saw, as Dolphin showed it. */
  error?: string
  /** Dolphin: a bot («delfín») that should end up running on the host as a service. */
  botId?: string
}

// Bot ids are slugs (`vigia`, `parte-2`); anything else would break the inline code span.
const SAFE_BOT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const MAX_ERROR_CHARS = 500
const MAX_LABEL_CHARS = 80
// Target ids are generated (`ssh-…`); anything else would break the inline code span.
const SAFE_TARGET_ID = /^[A-Za-z0-9._:-]{1,128}$/

/** One bounded, redacted line, so pasted text cannot pose as prompt structure. */
function oneLine(text: string, max: number): string {
  const flat = redactAgentDiagnosticText(text).replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function hostSelector(context: VpsSetupAgentContext): string {
  if (context.targetId && SAFE_TARGET_ID.test(context.targetId)) {
    return context.targetId
  }
  return '<id>'
}

/**
 * The prompt that hands a failed VPS connection to an agent. It loads the guide through the CLI,
 * so the skill does not have to be installed first, and loops on the doctor until it passes.
 */
export function buildVpsSetupAgentPrompt(context: VpsSetupAgentContext): string {
  const selector = hostSelector(context)
  const doctor = `\`dolphin host doctor ${selector} --json\``
  const lines = [
    'Use the dolphin-vps skill to get this SSH host (a VPS or server) connected to Dolphin, with Dolphin’s server running on it. If the skill is not installed, load it with `dolphin skills get dolphin-vps`.',
    '',
    `Goal: ${doctor} reports "ok": true.`,
    `- Run ${doctor}, read \`reason\` and \`nextSteps\`, fix that cause, and run it again until it passes.`,
    '- Check SSH from this computer first (keys in ~/.ssh, ~/.ssh/config, `ssh -o BatchMode=yes <host> true`), then the host itself (firewall, sshd, disk space, system libraries), as the skill explains.',
    '- Ask the person before changing anything on the host (packages, sshd_config, firewall rules), and hand them what only they can do: typing a password or passphrase, the provider’s web panel, or signing an agent in on the host with `ssh -t <host> "claude auth login"`.',
    '- Never print, copy or save a password, passphrase, private key or token, and never ask for one in the chat.'
  ]
  if (selector === '<id>') {
    const label = context.label ? oneLine(context.label, MAX_LABEL_CHARS).replace(/"/g, "'") : ''
    lines.push(
      label
        ? `- The host may be saved as "${label}": find its id with \`dolphin host list --json\`, or add it with \`dolphin host add\`.`
        : '- Find the host’s id with `dolphin host list --json`, or add it with `dolphin host add`.'
    )
  }
  if (context.botId && SAFE_BOT_ID.test(context.botId)) {
    lines.push(
      '',
      `Then bring the Dolphin bot \`${context.botId}\` to run on that host, 24/7, as the skill’s section “Llevar un bot al servidor” explains: the bot’s engine signed in on the host, the user service enabled and linger on. Done when \`systemctl --user is-active dolphin-bots.service\` says active there and the bot shows up in its \`bots --json\`.`
    )
  }
  if (context.error?.trim()) {
    lines.push('', `The last attempt failed: ${oneLine(context.error, MAX_ERROR_CHARS)}`)
  }
  return lines.join('\n')
}
