/** Worktree-relative folder that client files dropped onto a remote workspace are uploaded into. */
// Why `.orca` y no `.dolphin`: es la carpeta que Dolphin siempre usó y que ya está en los
// worktrees de la gente (valor conservado por migración, como los `LEGACY_*`).
export const DROP_STAGING_RELATIVE_DIR = '.orca/drops'

// Why: `*` also matches the ignore file itself. Un-ignoring it (`!.gitignore`) left
// `?? .orca/.gitignore` behind, which still blocked a plain workspace delete.
export const DROP_STAGING_GITIGNORE_CONTENT = '*\n'
