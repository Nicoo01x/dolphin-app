/**
 * Where the file explorer is on screen, besides the right sidebar.
 *
 * The tree only loads while it is actually visible — a hidden tree must not trigger passive file
 * loads (see file-explorer-reset.ts). That check used to read one thing only: whether the right
 * sidebar was open. Dolphin's canvas mounts the same explorer in a floating window with the
 * sidebar closed, so the check said "hidden" about a tree the user was looking at, and it span
 * forever.
 *
 * Surfaces claim while mounted and release on unmount, ref-counted the same way the PTY
 * delivery claims are: two windows showing the explorer must both release before it counts as
 * gone.
 */
let externalSurfaces = 0

/** Claims a surface. The returned function releases it and is safe to call twice. */
export function claimExternalFileExplorerSurface(): () => void {
  externalSurfaces += 1
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    externalSurfaces = Math.max(0, externalSurfaces - 1)
  }
}

export function hasExternalFileExplorerSurface(): boolean {
  return externalSurfaces > 0
}

/** Test seam: a renderer reload naturally clears this module-scoped count. */
export function _resetExternalFileExplorerSurfacesForTest(): void {
  externalSurfaces = 0
}
