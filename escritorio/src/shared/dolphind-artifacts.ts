/** Build, hash and install probe share this manifest; order determines the hash. Keep erasable-only TypeScript:
 * Node build scripts import via type stripping, which rejects enums, namespaces and parameter properties. */
// Bun-era slots only: kept so a client can still launch one for rollback (design D7.1 R5).
export const DOLPHIND_BUN_RUNTIME_FILENAME = 'bun-runtime'
export const DOLPHIND_WINDOWS_BUN_RUNTIME_FILENAME = 'bun-runtime.exe'
export const DOLPHIND_BUILD_TARGET_FILENAME = '.build-target'
export const DOLPHIND_WINDOWS_PROCESS_TREE_FILENAME = 'windows-process-tree.node'
/** native/windows-security: secure-file ACLs without spawning icacls. */
export const DOLPHIND_WINDOWS_SECURITY_FILENAME = 'windows-security.node'
/** native/windows-cli-launcher: cmd.exe and .ps1 shims cannot carry every argv intact. */
export const DOLPHIND_WINDOWS_CLI_LAUNCHER_FILENAME = 'bin/dolphin.exe'

export function dolphindBunRuntimeFilename(target: string): string {
  return isWindowsTarget(target)
    ? DOLPHIND_WINDOWS_BUN_RUNTIME_FILENAME
    : DOLPHIND_BUN_RUNTIME_FILENAME
}

function isWindowsTarget(target: string): boolean {
  return target === 'win32' || target.startsWith('win32-')
}

/** A Node slot's server target (e.g. linux-x64-musl); `.build-target` would mark it as Bun. */
export const DOLPHIND_SERVER_TARGET_FILENAME = '.server-target'

/** The pinned Node executableSha256 enters the version hash here. Never ship .build-target in Node slots:
 * Bun-era selectors exit 78 without bun-runtime (design D7.1 R5). */
export const DOLPHIND_NODE_RUNTIME_MARKER_FILENAME = '.runtime-node'
/** Beside the slot dirs and shared across Dolphin versions (design D2): `runtimes/node-<sha256>/bin/node`. */
export const DOLPHIND_RUNTIMES_DIRNAME = 'runtimes'
export const DOLPHIND_NODE_RUNTIME_DIR_PREFIX = 'node-'
export const DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE = 'bin/node'
// Upstream's own name and layout: renaming node.exe is the masquerading pattern EDR scores.
export const DOLPHIND_NODE_RUNTIME_WINDOWS_EXECUTABLE = 'node.exe'

export function dolphindNodeRuntimeExecutable(target: string): string {
  return isWindowsTarget(target)
    ? DOLPHIND_NODE_RUNTIME_WINDOWS_EXECUTABLE
    : DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE
}

/** Slot-relative path segments of the runtime a slot's marker names. */
export function dolphindNodeRuntimeRelativePath(
  target: string,
  executableSha256: string
): string[] {
  return [
    '..',
    DOLPHIND_RUNTIMES_DIRNAME,
    `${DOLPHIND_NODE_RUNTIME_DIR_PREFIX}${executableSha256}`,
    ...dolphindNodeRuntimeExecutable(target).split('/')
  ]
}

/** N-API level the slot addons are built for; equals SLOT_NAPI_VERSION in the prebuild script. */
export const DOLPHIND_ADDON_NAPI_VERSION = 8

export const DOLPHIND_NODE_PTY_DIR = 'node_modules/node-pty'
export const DOLPHIND_CLI_ENTRY_FILENAME = 'out/cli/index.js'
export const DOLPHIND_CLI_PACKAGE_FILENAME = 'out/package.json'
// Test files and sources stay out; these are every module the runtime path requires.
export const DOLPHIND_NODE_PTY_JS_ARTIFACTS = [
  'package.json',
  'lib/conpty_console_list_agent.js',
  'lib/eventEmitter2.js',
  'lib/index.js',
  'lib/interfaces.js',
  'lib/shared/conout.js',
  'lib/terminal.js',
  'lib/types.js',
  'lib/unixTerminal.js',
  'lib/utils.js',
  'lib/windowsConoutConnection.js',
  'lib/windowsPtyAgent.js',
  'lib/windowsTerminal.js',
  'lib/worker/conoutSocketWorker.js'
].map((file) => `${DOLPHIND_NODE_PTY_DIR}/${file}`)

/** The prebuild slot's files (config/scripts/dolphind-prebuild-slot-contents.mjs), relative to build/Release. */
export function dolphindNodePtySlotFiles(target: string): string[] {
  if (isWindowsTarget(target)) {
    return [
      'conpty.node',
      'conpty_console_list.node',
      'conpty/conpty.dll',
      'conpty/OpenConsole.exe',
      // node-pty's winpty backend, which it selects below Windows build 18309.
      'pty.node',
      'winpty.dll',
      'winpty-agent.exe'
    ]
  }
  return target.startsWith('darwin-') ? ['pty.node', 'spawn-helper'] : ['pty.node']
}

export function dolphindNodePtyNativeArtifacts(target: string): string[] {
  return dolphindNodePtySlotFiles(target).map(
    (file) => `${DOLPHIND_NODE_PTY_DIR}/build/Release/${file}`
  )
}

export const DOLPHIND_PARCEL_WATCHER_ENTRY = 'node_modules/@parcel/watcher/index.js'
export const DOLPHIND_PARCEL_WATCHER_NATIVE = 'node_modules/@parcel/watcher/watcher.node'
export const DOLPHIND_EMOJI_SHORTCODE_DATASET =
  'node_modules/emojibase-data/en/shortcodes/emojibase.json'
// linear-sdk.ts loads it through createRequire, which the server bundle cannot follow.
export const DOLPHIND_LINEAR_SDK_ENTRY = 'node_modules/@linear/sdk/index.js'

export const DOLPHIND_VERSION = '0.1.0'
export const DOLPHIND_LAUNCHER_FILENAME = 'dolphind.js'
export const DOLPHIND_SERVER_ENTRY_FILENAME = 'dolphind-server.js'

// Equals FOREIGN_SQLITE_READER_ENTRY_FILENAME; that module is not loadable under type stripping.
export const DOLPHIND_FOREIGN_SQLITE_READER_ENTRY = 'foreign-sqlite-reader-entry.js'
/** Worker thread that runs workspace port detection's probe commands off the event loop. */
export const DOLPHIND_PORT_SCAN_COMMAND_WORKER_ENTRY = 'port-scan-command-worker-entry.js'
// Equals AI_VAULT_SERVICE_ENTRY_FILENAME: the forked child that lists agent sessions.
export const DOLPHIND_SESSION_SCANNER_SERVICE_ENTRY = 'session-scanner-service-entry.js'
/** Worker thread SessionSearchWorkerClient loads; without it remote session search is unavailable. */
export const DOLPHIND_SESSION_SEARCH_WORKER_ENTRY = 'session-search-worker-entry.js'
// Equals COMPUTER_SIDECAR_ENTRY_FILENAME, and the desktop's out/main entry name.
export const DOLPHIND_COMPUTER_SIDECAR_ENTRY = 'computer-sidecar.js'
/** Plain scripts, one copy for every target: each platform's sidecar runs only its own. */
export const DOLPHIND_COMPUTER_USE_RUNTIME_ARTIFACTS = [
  'computer-use-linux/runtime.py',
  'computer-use-windows/runtime.ps1'
] as const

// Kept here because build-dolphind.mjs imports this manifest directly under Node type stripping.
export const DOLPHIND_RIPGREP_ARTIFACTS = [
  'ripgrep/linux-x64/rg',
  'ripgrep/linux-arm64/rg',
  'ripgrep/darwin-x64/rg',
  'ripgrep/darwin-arm64/rg',
  'ripgrep/win32-x64/rg.exe',
  'ripgrep/win32-arm64/rg.exe'
] as const

/** Only the target's own ripgrep ships (design D2); both libcs share one static build. */
export function dolphindRipgrepArtifact(target: string): string {
  const [platform, arch] = target.split('-')
  const artifact = DOLPHIND_RIPGREP_ARTIFACTS.find((candidate) =>
    candidate.startsWith(`ripgrep/${platform}-${arch}/`)
  )
  if (!artifact) {
    throw new Error(`dolphind ships no ripgrep for ${target}`)
  }
  return artifact
}

/** Packaging-only references; deployed slots still contain their own verified binary. */
export function dolphindTemplatePackagedRipgrep(
  schemaVersion: number,
  target: string,
  reference: unknown
): string | null {
  if (reference === undefined) {
    return null
  }
  if (schemaVersion !== 4 || reference !== true || target.startsWith('darwin-')) {
    throw new Error(`Invalid packaged ripgrep reference for ${target}`)
  }
  return dolphindRipgrepArtifact(target)
}

export const DOLPHIND_RIPGREP_LICENSE_ARTIFACTS = [
  'ripgrep/licenses/JEMALLOC-COPYING',
  'ripgrep/licenses/LICENSE-MIT',
  'ripgrep/licenses/LLVM-LIBUNWIND-LICENSE.TXT',
  'ripgrep/licenses/MUSL-COPYRIGHT',
  'ripgrep/licenses/PCRE2-LICENCE.md',
  'ripgrep/licenses/README.md',
  'ripgrep/licenses/RUST-CRATE-NOTICES.txt',
  'ripgrep/licenses/SLJIT-LICENSE',
  'ripgrep/licenses/UNLICENSE'
] as const

/** The skill plugin native-chat agents load by path; mirrors resources/native-chat-visuals. */
export const DOLPHIND_NATIVE_CHAT_VISUALS_ARTIFACTS = [
  'native-chat-visuals/.claude-plugin/plugin.json',
  'native-chat-visuals/skills/dolphin-chat-visuals/SKILL.md'
] as const

/** Phones load this page via mobileWeb.bundle.*; its content-addressed assets are listed only in the manifest. */
export const DOLPHIND_MOBILE_WEB_DIR = 'out/mobile-web'
export const DOLPHIND_MOBILE_WEB_MANIFEST = `${DOLPHIND_MOBILE_WEB_DIR}/manifest.json`

// Mirrors manifest-contract ASSET_PATH_PATTERN; cannot import under type stripping.
const MOBILE_WEB_ASSET_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/

/** A bundle-relative asset path that stays inside the page directory. */
export function isDolphindMobileWebAssetPath(path: string): boolean {
  return (
    MOBILE_WEB_ASSET_PATH.test(path) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..')
  )
}

/** Slot paths of every asset `manifestText` lists, their brotli copies and the host-only catalogs, sorted; throws rather than ship a partial page. */
export function dolphindMobileWebAssetFilenames(manifestText: string): string[] {
  const manifest: unknown = JSON.parse(manifestText)
  const assets =
    manifest && typeof manifest === 'object' && 'assets' in manifest ? manifest.assets : undefined
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error(`${DOLPHIND_MOBILE_WEB_MANIFEST} lists no assets`)
  }
  const catalogs =
    manifest && typeof manifest === 'object' && 'catalogs' in manifest ? manifest.catalogs : []
  if (!Array.isArray(catalogs)) {
    throw new Error(`${DOLPHIND_MOBILE_WEB_MANIFEST} catalogs is not a list`)
  }
  const filenames = [...assets, ...catalogs].flatMap((asset: unknown) => {
    const entry = asset && typeof asset === 'object' ? asset : {}
    const path = 'path' in entry ? entry.path : undefined
    if (typeof path !== 'string' || !isDolphindMobileWebAssetPath(path)) {
      throw new Error(`${DOLPHIND_MOBILE_WEB_MANIFEST} names an unsafe asset path: ${String(path)}`)
    }
    const slotPath = `${DOLPHIND_MOBILE_WEB_DIR}/${path}`
    // The asset's brotli copy, served to phones that inflate it; mirrors mobileWebBundleBrotliPath.
    return 'brotliByteLength' in entry ? [slotPath, `${slotPath}.br`] : [slotPath]
  })
  return filenames.sort(compareCodeUnits)
}

/** Code-unit order: page asset lists feed the install hash, so they must not depend on locale. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type DolphindArtifact = {
  filename: string
  /** Missing optional agent-browser means no headless browser, not a torn install; the remote probe must allow it. */
  optional?: boolean
}

export const DOLPHIND_ARTIFACTS: readonly DolphindArtifact[] = [
  { filename: DOLPHIND_CLI_ENTRY_FILENAME },
  { filename: DOLPHIND_CLI_PACKAGE_FILENAME },
  { filename: DOLPHIND_LAUNCHER_FILENAME },
  { filename: DOLPHIND_SERVER_ENTRY_FILENAME },
  // Forked so a native @parcel/watcher fault kills the child, not the server.
  { filename: 'parcel-watcher-process-entry.js' },
  // Forked so PTYs outlive the runtime process; its absence makes every restart destructive.
  { filename: 'daemon-entry.js' },
  { filename: 'profile-state-writer-worker-entry.js' },
  { filename: 'profile-state-backup-worker-entry.js' },
  { filename: 'command-path-directory-worker-entry.js' },
  // Worker thread that reads other apps' SQLite (the OpenCode binder and history) off the event loop.
  { filename: DOLPHIND_FOREIGN_SQLITE_READER_ENTRY },
  { filename: DOLPHIND_PORT_SCAN_COMMAND_WORKER_ENTRY },
  // Forked so transcript parsing stays off the server's event loop.
  { filename: DOLPHIND_SESSION_SCANNER_SERVICE_ENTRY },
  // Session search queries run in a worker thread, also off the event loop.
  { filename: DOLPHIND_SESSION_SEARCH_WORKER_ENTRY },
  // Account worker threads keep CLI probes and Claude setup off the event loop.
  { filename: 'worker-thread-child-process-entry.js' },
  { filename: 'claude-profile-setup-worker-entry.js' },
  // Claude fork and rewind copy a transcript in a worker thread, off the event loop.
  { filename: 'claude-conversation-fork-worker-entry.js' },
  // Dictation loads the recognizer named by dolphin serve (#31174).
  { filename: 'stt-worker.js' },
  // The forked computer sidecar finds platform runtimes beside itself (#31777).
  { filename: DOLPHIND_COMPUTER_SIDECAR_ENTRY },
  ...DOLPHIND_COMPUTER_USE_RUNTIME_ARTIFACTS.map((filename) => ({ filename })),
  // Target-specific even when the JavaScript bundle is shared across packaged slots.
  { filename: DOLPHIND_SERVER_TARGET_FILENAME },
  // dolphind never depends on a host runtime or host-installed native module.
  { filename: DOLPHIND_NODE_RUNTIME_MARKER_FILENAME },
  { filename: DOLPHIND_PARCEL_WATCHER_ENTRY },
  { filename: DOLPHIND_PARCEL_WATCHER_NATIVE },
  { filename: DOLPHIND_EMOJI_SHORTCODE_DATASET },
  { filename: DOLPHIND_LINEAR_SDK_ENTRY },
  ...DOLPHIND_NODE_PTY_JS_ARTIFACTS.map((filename) => ({ filename })),
  ...DOLPHIND_RIPGREP_LICENSE_ARTIFACTS.map((filename) => ({ filename })),
  ...DOLPHIND_NATIVE_CHAT_VISUALS_ARTIFACTS.map((filename) => ({ filename }))
  // The page (DOLPHIND_MOBILE_WEB_MANIFEST and its assets) is NOT here: see the `mobileWebAssets`
  // argument below. An app built without a mobile page ships a server without one, and that is a
  // degradation its clients already handle — `mobileWeb.bundle.*` answers "no bundle". Listing the
  // manifest unconditionally made the one server that cannot have a page the one that cannot be
  // built, and made every remote install probe demand a file the build never emits.
]

/** Written after the artifacts, so it is never an input to its own hash. */
export const DOLPHIND_VERSION_FILENAME = '.version'
export const DOLPHIND_TEMPLATE_MANIFEST_FILENAME = 'dolphind-template.json'
export const DOLPHIND_TEMPLATE_TARGETS_DIR = 'targets'

/** Written last by the installer; its absence means a torn install. */
export const DOLPHIND_INSTALL_COMPLETE_FILENAME = '.install-complete'

/** Slot files in hash order for <os>-<arch>[-<libc>]; mobileWebAssets comes from the slot’s own page manifest. */
export function dolphindArtifactFilenames(
  target: string,
  mobileWebAssets: readonly string[]
): string[] {
  const filenames = DOLPHIND_ARTIFACTS.filter((artifact) => !artifact.optional).map(
    (artifact) => artifact.filename
  )
  filenames.push(...dolphindNodePtyNativeArtifacts(target), dolphindRipgrepArtifact(target))
  if (isWindowsTarget(target)) {
    filenames.push(
      DOLPHIND_WINDOWS_PROCESS_TREE_FILENAME,
      DOLPHIND_WINDOWS_SECURITY_FILENAME,
      DOLPHIND_WINDOWS_CLI_LAUNCHER_FILENAME
    )
  }
  filenames.push(...mobileWebPageFilenames(mobileWebAssets))
  return filenames
}

/** The page's own files, manifest first; empty when the slot ships no page. */
function mobileWebPageFilenames(mobileWebAssets: readonly string[]): string[] {
  return mobileWebAssets.length === 0 ? [] : [DOLPHIND_MOBILE_WEB_MANIFEST, ...mobileWebAssets]
}

/** Files shared by every template target; the rest live under `targets/<target>/`. */
export function dolphindTemplateCommonFilenames(mobileWebAssets: readonly string[]): string[] {
  const filenames = DOLPHIND_ARTIFACTS.filter(
    (artifact) =>
      !artifact.optional &&
      artifact.filename !== DOLPHIND_SERVER_TARGET_FILENAME &&
      artifact.filename !== DOLPHIND_NODE_RUNTIME_MARKER_FILENAME &&
      artifact.filename !== DOLPHIND_PARCEL_WATCHER_NATIVE
  ).map((artifact) => artifact.filename)
  // The page is platform-independent, so the template keeps one copy for every target.
  filenames.push(...mobileWebPageFilenames(mobileWebAssets))
  return filenames
}

/** Files stored under the template's `targets/<target>/`, at their slot-relative paths. */
export function dolphindTemplateTargetFilenames(target: string): string[] {
  const common = new Set(dolphindTemplateCommonFilenames([]))
  return dolphindArtifactFilenames(target, []).filter((filename) => !common.has(filename))
}
