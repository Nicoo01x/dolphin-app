/**
 * Agent-read text that calls a Dolphin session ID an "address". The noun only: "address it by that"
 * is a verb, and `run:`/`dispatch:`/group addresses are mailboxes, not this identity.
 */
export const DOLPHIN_SESSION_ID_AS_ADDRESS =
  /\b(?:orchestration|session|Dolphin|coordinator's|your(?: own)?) address\b|caller\.address|naming its address/i
