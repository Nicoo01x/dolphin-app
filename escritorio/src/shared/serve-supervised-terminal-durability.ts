/** Set by `dolphin serve` on its dolphind child: '1' when a service manager supervises it, '' otherwise. */
export const DOLPHIN_SERVE_SUPERVISED_ENV = 'DOLPHIN_SERVE_SUPERVISED'

/** EX_TEMPFAIL: a supervised dolphind had no terminal daemon, so its terminals would die on restart. */
export const DOLPHIND_EXIT_TERMINALS_NOT_DURABLE = 75
