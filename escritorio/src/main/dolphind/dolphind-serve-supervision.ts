// `dolphin serve --supervise` runs dolphind under a service manager, which restarts it routinely.
import process from 'node:process'
import { DOLPHIN_SERVE_SUPERVISED_ENV } from '../../shared/serve-supervised-terminal-durability'

/** A supervised service must not hand out terminals that its next restart would kill. */
export class DolphindTerminalsNotDurableError extends Error {
  constructor(readonly daemonFailure: string) {
    super(
      `The terminal daemon did not start (${daemonFailure}). This server runs under a service ` +
        'manager, so it will not start with terminals that a restart would lose; the supervisor ' +
        'retries with backoff.'
    )
    this.name = 'DolphindTerminalsNotDurableError'
  }
}

/** Read once and drop it, so nothing dolphind starts inherits it. */
export function takeDolphindServeSupervision(env: NodeJS.ProcessEnv = process.env): boolean {
  const supervised = env[DOLPHIN_SERVE_SUPERVISED_ENV] === '1'
  delete env[DOLPHIN_SERVE_SUPERVISED_ENV]
  return supervised
}
