/** Shift traditionally forces system browser; the inversion setting instead chooses the other destination when system is already default. */
export function resolveModifierRouting(
  modifierHeld: boolean,
  openLinksInApp: boolean,
  modifierInverts: boolean
): { wantsDolphin: boolean; wantsSystemBrowser: boolean } {
  if (!modifierHeld) {
    return { wantsDolphin: false, wantsSystemBrowser: false }
  }
  if (!modifierInverts) {
    return { wantsDolphin: false, wantsSystemBrowser: true }
  }
  return { wantsDolphin: !openLinksInApp, wantsSystemBrowser: openLinksInApp }
}
