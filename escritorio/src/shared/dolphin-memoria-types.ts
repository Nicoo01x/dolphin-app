/** Lo que contesta «Recordar esto» desde el chat. */
export type DolphinRememberResult =
  | { ok: true; id: string; alreadyKnown: boolean }
  | { ok: false; reason: 'empty' | 'too-long' | 'no-project' | 'invalid-request' | 'write-failed' }

export type DolphinForgetResult = { ok: boolean }
