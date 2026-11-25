const { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')

// Why: los scripts build:* ya pasan por el freno, pero un workflow puede llamar a electron-builder
// directo. Solo cuando lo carga su CLI: los tests de esta config la cargan para leerla.
if (/electron-builder/.test(process.argv[1] ?? '')) {
  require('./scripts/dolphin-packaging-guard.cjs')
}
const {
  MACOS_FOLDER_USAGE_DESCRIPTIONS,
  applyMacHelperFolderUsageDescriptions
} = require('./scripts/desktop-distribution/macos/macos-folder-usage-descriptions.cjs')
const electronBuilderNativeRebuild = require('./scripts/desktop-distribution/runtime-verification/electron-builder-native-rebuild.cjs')
const {
  assertPackagedDaemonEntryExists,
  verifyPackagedDaemonEntryBoots,
  verifyPackagedMacTerminalHostBoots
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-daemon-entry.cjs')
const {
  buildMacTerminalHost,
  macTerminalHostSignIgnore,
  verifyMacTerminalHost
} = require('./scripts/macos/terminal-host-bundle/macos-terminal-host-bundle.cjs')
const {
  assertPackagedNativeVariantsInstalled,
  assertProcessHostOutputBuilt,
  createPackagedRuntimeNodeModuleResources,
  normalizeElectronArchitecture,
  prunePackagedRuntimeNodeModules,
  readPackage,
  verifyPackagedMainRuntimeDeps
} = require('./packaged-runtime-node-modules.cjs')
const { copyPackagedTranscribeCpp } = require('./packaged-transcribe-cpp.cjs')
const {
  assertNoWindowsExecutablesInRuntimeNodeModules
} = require('./packaged-windows-only-runtime-files.cjs')
const {
  verifyLinuxGlibcFloor
} = require('./scripts/native-build/linux/verify-linux-glibc-floor.cjs')
const {
  verifyPackagedWindowsAgentHook
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-windows-agent-hook.cjs')
const {
  verifyPackagedWindowsCliLauncher
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-windows-cli-launcher.cjs')
const { readWindowsExecutableName } = require('./windows-executable-name.cjs')

// Una sola fuente para el nombre del binario de Windows: la lee también el launcher del CLI.
const windowsExecutableName = readWindowsExecutableName()
const {
  ensureBundledWaylandClipboard,
  finalizePackagedWaylandClipboard
} = require('./wayland-clipboard-resources.cjs')
const {
  writeMacBuildCompatibility
} = require('./scripts/desktop-distribution/macos/mac-build-compatibility.cjs')
const {
  MOBILE_WEB_BUNDLE_DIR,
  assertMobileWebBundleBuilt
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-mobile-web-bundle.cjs')
const {
  verifyPackagedPluginResources,
  verifyPackagedPluginTypings
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-plugin-resources.cjs')
const {
  assertDolphinCoreBuilt,
  dolphinCoreExtraResources,
  verifyPackagedDolphinCore
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-dolphin-core.cjs')
const {
  assertPackagedServeSelectionEntry,
  assertPackagedWebClient
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-serve-payload.cjs')
const {
  assertBundledRipgrepInstalled,
  bundledRipgrepExtraResources,
  bundledRipgrepMacSignIgnore,
  finalizePackagedRipgrep
} = require('./bundled-ripgrep-resources.cjs')
const {
  verifyPackagedWindowsNodePty
} = require('./scripts/desktop-distribution/runtime-verification/verify-packaged-node-pty-job-ownership.cjs')
const {
  assertDolphindTemplateBuilt,
  finalizePackagedDolphindTemplate,
  dolphindTemplateExtraResource,
  dolphindTemplateNodeModulesExtraResource,
  dolphindTemplateMacSignIgnore
} = require('./scripts/dolphind-distribution/template/packaged-dolphind-template.cjs')
const {
  verifySkillsCliRuntime
} = require('./scripts/runtime-verification/skills-cli/verify-skills-cli-runtime.cjs')
const { assertNotDarkBuild } = require('./dark-build-switches.cjs')
const {
  verifyStaticAppImagePackage
} = require('./scripts/desktop-distribution/appimage/static-appimage-package-contract.cjs')
const {
  appImageNodeRuntimeFpmArgs,
  placeAppImageNodeRuntime,
  verifyAppImageNodeRuntimeServesPty
} = require('./scripts/desktop-distribution/linux/appimage-node-runtime.cjs')
const {
  signWindowsUninstallerViaSignPath
} = require('./scripts/desktop-distribution/windows/windows-uninstaller-signing.cjs')
const {
  buildMacShipItScheduling
} = require('./scripts/desktop-distribution/macos/macos-shipit-scheduling.cjs')

// Dev channels need release bundle ID/signature/notarization so Squirrel.Mac accepts updates and macOS retains app identity.
const isMacHourly = process.env.DOLPHIN_MAC_HOURLY === '1'
const isMacDaily = process.env.DOLPHIN_MAC_DAILY === '1'
const isMacAdhoc = process.env.DOLPHIN_MAC_ADHOC === '1'
// Keep Windows dev flags separate: mac flags enable hardened runtime/notarization/global signing, which would demand an unavailable Windows cert.
const isWinHourly = process.env.DOLPHIN_WIN_HOURLY === '1'
const isWinDaily = process.env.DOLPHIN_WIN_DAILY === '1'
const isWinAdhoc = process.env.DOLPHIN_WIN_ADHOC === '1'
const isWinDevChannel = isWinHourly || isWinDaily || isWinAdhoc
/**
 * Si este build se va a firmar de verdad.
 *
 * El relevo a SignPath sólo actúa cuando están puestas sus variables de CI; sin ellas el
 * instalador sale `NotSigned`. Declarar `publisherName` igual no es cosmético: electron-updater
 * verifica con Authenticode cada instalador que baja contra el nombre que quedó en el
 * `app-update.yml` del build INSTALADO (`NsisUpdater.verifySignature`), así que un build sin
 * firma que dice ser de SignPath rechaza la versión siguiente —se vio el 08/11/2026: la 1.5.1
 * bajó la 1.5.2 entera y la descartó por firma—. Y Windows muestra ese nombre como «editor»
 * durante la instalación, que es otra razón para no decir uno que no somos.
 */
const firmaDeVerdad = Boolean(
  process.env.DOLPHIN_WIN_UNINSTALLER_RELAY_URL || process.env.DOLPHIN_WIN_SIGNPATH_RELAY
)
const isMacRelease =
  process.env.DOLPHIN_MAC_RELEASE === '1' || isMacHourly || isMacDaily || isMacAdhoc
const isLinuxArm64Release = process.env.DOLPHIN_LINUX_ARM64_RELEASE === '1'
const localBuildVersion =
  isMacRelease || isWinDevChannel ? undefined : process.env.DOLPHIN_LOCAL_BUILD_VERSION
const isHourlyChannel = isMacHourly || isWinHourly
const isDailyChannel = isMacDaily || isWinDaily
const isAdhocChannel = isMacAdhoc || isWinAdhoc
const devChannelBuildVersion = isHourlyChannel
  ? process.env.DOLPHIN_HOURLY_BUILD_VERSION
  : isDailyChannel
    ? process.env.DOLPHIN_DAILY_BUILD_VERSION
    : isAdhocChannel
      ? process.env.DOLPHIN_ADHOC_BUILD_VERSION
      : undefined
// Separate dev-channel repos: 24 hourly tags/day would evict stable/RC from the ten-entry release feed; isolate adhoc/daily from hourly subscribers too.
const devChannelRepo = isHourlyChannel
  ? 'dolphin-hourly'
  : isDailyChannel
    ? 'dolphin-daily'
    : isAdhocChannel
      ? 'dolphin-adhoc'
      : null
const appId = 'io.github.nicoo01x.dolphin'
// Dolphin: el muro de novedades está apagado (DOLPHIN_MURO_DE_NOVEDADES en src/shared/dolphin-brand.ts)
// y sus grabaciones, que eran de la base, salieron del árbol: la carpeta ya no se empaqueta.
// Los clips de los carteles de función: el `<video>` del cartel los lee de process.resourcesPath,
// y adentro de app.asar no hay nada que un elemento multimedia pueda abrir por ruta.
const cartelResources = {
  from: 'resources/carteles',
  to: 'carteles'
}
// Why: freshness detection needs immutable identity metadata from this exact
// app build, but never needs the skill package bytes or a runtime network read.
const skillFreshnessResources = {
  from: 'resources/skills',
  to: 'skills'
}
// The bundled agent-browser binary finds its version-matched catalog via the nearest skills/ above it (Resources/).
const agentBrowserSkillResources = [
  { from: 'node_modules/agent-browser/skills/agent-browser', to: 'skills/agent-browser' },
  { from: 'node_modules/agent-browser/skill-data', to: 'skill-data' }
]
// Native agents load plugins by path and cannot read inside app.asar.
const nativeChatVisualsResource = {
  from: 'resources/native-chat-visuals',
  to: 'native-chat-visuals'
}
// SSH deploy resolves process.resourcesPath/relay; extraResources keeps bundles on real disk.
const relayExtraResource = {
  from: 'out/relay',
  to: 'relay'
}
// Bootstrap verifies/publishes immutable plugin bytes from ordinary directories.
const bundledPluginResources = {
  from: 'resources/plugins/launch',
  to: 'plugins/launch'
}
// electron-builder always drops `*.d.ts` from app files, so `dolphin plugin types` reads these copies.
const pluginAuthorTypingsResources = {
  from: 'resources/plugins',
  to: 'plugins',
  filter: ['declarative/*.d.ts', 'types/*.d.ts']
}
// Packaged main/CLI/SSH/speech paths lack pnpm links; copy runtime closure so bare requires cannot fall through to checkout dependencies.
// Ship only the 166KB emoji dataset used by worktree naming, not all 49MB of emojibase-data.
const emojiShortcodeDatasetResource = {
  from: 'node_modules/emojibase-data/en/shortcodes/emojibase.json',
  to: 'node_modules/emojibase-data/en/shortcodes/emojibase.json'
}
// Dolphin: las skills propias viajan con la app y se instalan desde acá, sin el repo de Dolphin
// (ver src/shared/dolphin-skills-source.ts).
const dolphinSkillsResource = {
  from: 'skills',
  to: 'dolphin-skills'
}
const commonExtraResources = [
  dolphinSkillsResource,
  // Dolphin: el núcleo construido (dist/, la consola, bin/ y package.json), para que la consola de
  // Dolphin arranque en la app instalada sin un clon del repo ni DOLPHIN_APP_DIR.
  ...dolphinCoreExtraResources(),
  relayExtraResource,
  dolphindTemplateExtraResource,
  dolphindTemplateNodeModulesExtraResource,
  ...bundledRipgrepExtraResources,
  bundledPluginResources,
  pluginAuthorTypingsResources,
  skillFreshnessResources,
  ...agentBrowserSkillResources,
  nativeChatVisualsResource,
  emojiShortcodeDatasetResource
]
// electron-builder replaces these defaults when `depends` is configured; retain
// Electron's loader requirements alongside Dolphin's headless-host dependencies.
const debElectronRuntimeDependencies = [
  'libgtk-3-0',
  'libnotify4',
  'libnss3',
  'libxss1',
  'libxtst6',
  'xdg-utils',
  'libatspi2.0-0',
  'libuuid1',
  'libsecret-1-0',
  // Electron links these but electron-builder's defaults omit them; t64 is Ubuntu 24.04+/Debian 13.
  'libasound2t64 | libasound2',
  'libgbm1'
]
const rpmElectronRuntimeDependencies = [
  'gtk3',
  'libnotify',
  'nss',
  'libXScrnSaver',
  '(libXtst or libXtst6)',
  'xdg-utils',
  'at-spi2-core',
  '(libuuid or libuuid1)',
  'alsa-lib'
]

// Mirror OS document extensions: CJS packager cannot import TS; keep startup/os-opened-documents.ts and NSIS hooks aligned.
const MARKDOWN_FILE_EXTENSIONS = ['md', 'markdown', 'mdx']
const TABULAR_FILE_EXTENSIONS = ['csv', 'tsv']

// Config loads without unused Windows addons; beforePack enforces target natives. Only @vscode/windows-process-tree has os:win32; workspace links prove no binary exists.
const windowsRuntimeResources = existsSync(
  join(__dirname, '..', 'node_modules', '@vscode', 'windows-process-tree', 'package.json')
)
  ? createPackagedRuntimeNodeModuleResources('win32')
  : []

// Shared with the terminal host helper so its purpose strings cannot drift from the app's.
const macUsageDescriptions = {
  NSAppleEventsUsageDescription:
    'Dolphin allows terminal-launched developer tools to automate local apps when you request it.',
  NSBluetoothAlwaysUsageDescription:
    'Dolphin allows terminal-launched developer tools to access Bluetooth devices when you request it.',
  NSBluetoothPeripheralUsageDescription:
    'Dolphin allows terminal-launched developer tools to access Bluetooth devices when you request it.',
  NSCalendarsUsageDescription:
    'Dolphin allows terminal-launched developer tools to access your calendars when you request it.',
  NSCalendarsFullAccessUsageDescription:
    'Dolphin allows terminal-launched developer tools to access your calendars when you request it.',
  NSCameraUsageDescription: "Application requests access to the device's camera.",
  NSContactsUsageDescription:
    'Dolphin allows terminal-launched developer tools to access your contacts when you request it.',
  NSLocationUsageDescription:
    'Dolphin allows terminal-launched developer tools to access location when you request it.',
  NSLocalNetworkUsageDescription:
    'Dolphin allows terminal-launched developer tools to discover and connect to local development servers when you request it.',
  NSMicrophoneUsageDescription: "Application requests access to the device's microphone.",
  NSRemindersUsageDescription:
    'Dolphin allows terminal-launched developer tools to access your reminders when you request it.',
  NSRemindersFullAccessUsageDescription:
    'Dolphin allows terminal-launched developer tools to access your reminders when you request it.',
  NSAudioCaptureUsageDescription:
    'Dolphin allows terminal-launched developer tools to capture desktop audio when you request it.',
  NSBonjourServices: ['_http._tcp', '_https._tcp'],
  ...MACOS_FOLDER_USAGE_DESCRIPTIONS
}
// Developer ID team that signs every release-channel mac build.
const DOLPHIN_MAC_TEAM_ID = '6CX3WHS9HZ'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId,
  // Why no es «Dolphin» a secas: ese nombre ya está tomado tres veces y las tres rompían algo. En
  // Discord, «Dolphin» es un juego de Atari 2600 (y el emulador de GameCube), así que la detección
  // de juegos mostraba eso en vez de la app. En Windows, el instalador caía en
  // %LOCALAPPDATA%\Programs\Dolphin y el perfil en %APPDATA%\Dolphin, que son los del Dolphin viejo
  // instalado: lo habría pisado.
  productName: 'Dolphin Code',
  // Why explícito: sin esto electron-builder arma «Copyright © <año> <author>», y es lo que muestran
  // el Acerca de de macOS y las propiedades del .exe en Windows.
  copyright: 'Copyright © 2026 Nicolás Cabanillas',
  protocols: [{ name: 'Dolphin', schemes: ['dolphin'] }],
  toolsets: { appimage: '1.0.3' },
  ...(devChannelBuildVersion
    ? { extraMetadata: { version: devChannelBuildVersion } }
    : localBuildVersion
      ? { extraMetadata: { version: localBuildVersion } }
      : {}),
  directories: {
    buildResources: 'resources/build'
  },
  files: [
    '!**/.vscode/*',
    // Repo inputs already bundled/copied through extraResources would bloat app.asar.
    '!src{,/**/*}',
    '!out/dolphind{,/**/*}',
    // Never in app.asar: the template ships via dolphindTemplateExtraResource; prebuilds are build inputs.
    '!out/dolphind-*{,/**/*}',
    '!out/.dolphind-*{,/**/*}',
    // Why: the pinned Node a local dolphind build references (~120 MB) and its download cache.
    '!out/runtimes{,/**/*}',
    '!out/node-runtime-cache{,/**/*}',
    '!config{,/**/*}',
    // Release archives and other build staging are not runtime resources.
    '!.build{,/**/*}',
    // Worktree-local Vite dependency caches are development inputs.
    '!.cache/vite{,.lock}{,/**/*}',
    '!docs{,/**/*}',
    '!native{,/**/*}',
    '!skills{,/**/*}',
    // Authoring guides/stubs compile into runtime artifacts; source trees only duplicate content.
    '!skill-guides{,/**/*}',
    '!skill-stubs{,/**/*}',
    '!tests{,/**/*}',
    // Examples have no runtime consumer and include adversarial hostile-panel; ship only resources/plugins/launch.
    '!examples{,/**/*}',
    // Exclude gitignored local screenshot evidence defensively so packaging cannot pick up stray captures.
    '!pr-evidence{,/**/*}',
    // Local build logs and rollback copies are never application resources.
    '!notes{,/**/*}',
    // Local tooling directories are not runtime inputs and may contain symlink loops.
    '!{.claude,.grok,.agents,.codex}{,/**/*}',
    '!Casks{,/**/*}',
    '!{AGENTS.md,CLAUDE.md,DEVELOPING.md,bundle-size-progress.md,ORCHESTRATION_IMPLEMENTATION_CHECKLIST.md,ORCHESTRATION_STRUCTURED_OUTPUT_DESIGN.md}',
    '!out/**/*.test.js',
    // Why: main builds with sourcemap:'hidden' so release CI can publish maps
    // for decoding minified crash traces. The app never loads them (no
    // sourceMappingURL is emitted), and packing them would add ~34MB to app.asar.
    '!out/**/*.map',
    // Why: Vite's manifest is only used to project the paired web client.
    '!out/renderer/.vite{,/**/*}',
    // The installed browser serves its allowlisted assets from the unpacked renderer.
    '!out/web{,/**/*}',
    // Local dev Electron.app caches (~270MB/branch) must not enter packaged builds.
    '!out/electron-dev{,/**/*}',
    // extraResources already ships relay; duplicating it in asar added 14MB and let script-heuristic quarantine gut the whole archive (#20966/#20972).
    '!out/relay{,/**/*}',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.oxlintrc.json,.oxfmtrc.json,components.json,opencode.json,dolphin.yaml,pnpm-workspace.yaml,vite.web.config.ts}',
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!tsconfig.json',
    // Feature media is read from process.resourcesPath via extraResources; exclude duplicate sources.
    '!resources/onboarding/feature-wall/**',
    '!resources/carteles/**',
    '!resources/skills/**',
    '!resources/native-chat-visuals/**',
    // extraResources already ships plugin bytes; exclude source duplicates.
    '!resources/plugins/launch/**',
    // afterPack copies the target's speech engine to resources/node_modules; asar would duplicate it and ship other variants.
    '!node_modules/{transcribe-cpp,@transcribe-cpp,koffi,@koromix}{,/**/*}',
    // CLI shim belongs beside resources/bin/dolphin.exe; unpacking source creates a second .cmd without its executable (#7351).
    '!resources/win32{,/**/*}'
  ],
  // Node-mode CLI/daemon/foreign SQLite reader/serve entries cannot read asar; unpack their shared/main dependencies too.
  // Keep out/package.json’s CommonJS boundary and remote CLI WebSocket/E2EE deps. Electron-only workers may stay packed.
  // Renderer/mobile-web assets need real paths: swept temporary asar extracts are not recreated (#27976).
  asarUnpack: [
    'out/package.json',
    'out/cli/**',
    'out/shared/**',
    'out/main/agent-hooks/**',
    'out/main/antigravity/**',
    'out/main/claude/**',
    'out/main/codex/**',
    // The CLI loads the socket-dir check; tsc-emitted output also needs its mode constants beside it.
    'out/main/daemon/endpoint/publication/daemon-{socket-endpoint-path,private-file-modes}.js',
    'out/main/copilot/**',
    'out/main/cursor/**',
    'out/main/droid/**',
    'out/main/gemini/**',
    'out/main/gitlab/projects/project-ref-parser.js',
    'out/main/grok/**',
    'out/main/hermes/**',
    'out/main/filesystem/asar-transparent-fs.js',
    'out/main/filesystem/macos-tree-clone.js',
    'out/main/dolphin-profiles/profile-index-store.js',
    'out/main/persistence/profile-state/**',
    'out/main/plugins/plugin-authoring-checks.js',
    'out/main/environment-doctor/environment-doctor.js',
    'out/main/environment-doctor/environment-doctor-host.js',
    // `dolphin plugin test` and `dolphin plugin check` load the runtime, kit and hooks in Node.
    'resources/plugins/declarative/*.mjs',
    'out/main/skills/bundled-skill-install/bundled-skill-local-host.js',
    'out/main/skills/bundled-skill-install/bundled-skill-installation.js',
    'out/main/startup/http1-compatibility-marker.js',
    'out/main/daemon-entry.js',
    'out/main/session-scanner-service-entry.js',
    'out/main/wsl-transcript-fs-process-entry.js',
    'out/main/foreign-sqlite-reader-entry.js',
    'out/main/session-search-worker-entry.js',
    'out/main/plugin-host-entry.js',
    'out/main/browser-extension-native-host-supervisor-entry.js',
    'out/main/computer-sidecar.js',
    'out/main/parcel-watcher-process-entry.js',
    'out/main/dolphind/dolphind-local-serve-selection-entry.js',
    // Why: the CLI runs as Node (ELECTRON_RUN_AS_NODE) and imports these main modules by path, so
    // they must exist outside app.asar. verify-skills-cli-runtime walks that closure after packing;
    // a folder the CLI reaches whole goes as folder/**.
    'out/main/agent-state-file-reader.js',
    'out/main/amp/**',
    'out/main/codebuddy/**',
    'out/main/codex-accounts/**',
    'out/main/codex-cli/**',
    'out/main/command-code/**',
    'out/main/crash-reporting/**',
    'out/main/daemon/**',
    'out/main/devin/**',
    'out/main/dolphin-chromium-process-pids.js',
    'out/main/dolphin-profiles/**',
    'out/main/dolphin-user-data-path.js',
    'out/main/dsh/**',
    'out/main/durable-file-write.js',
    'out/main/in-flight-run-dedupe.js',
    'out/main/ipc/**',
    'out/main/jcode/**',
    'out/main/kimi/**',
    'out/main/kiro/**',
    'out/main/muse/**',
    'out/main/observability/**',
    'out/main/openclaude/**',
    'out/main/own-chromium-tree-kill-guard.js',
    'out/main/provider-process/**',
    'out/main/providers/**',
    'out/main/pty-descendant-exit-verification.js',
    'out/main/pty-descendant-termination.js',
    'out/main/pty-process-table-parser.js',
    'out/main/qoder/**',
    'out/main/qwen-code/**',
    'out/main/rolling-file-backup.js',
    'out/main/sqlite/**',
    'out/main/startup/**',
    'out/main/win32-utils.js',
    'out/main/windows-native-registry.js',
    'out/main/windows-process-tree-kill.js',
    'out/main/windows-pty-root-identity.js',
    'out/main/windows/**',
    'out/main/worker-thread-entry-path.js',
    'out/main/wsl-interop-spawn-directory.js',
    'out/main/zcode/**',
    'out/main/dolphind/dolphind-stale-lock-reclaim.js',
    'out/main/dolphind/dolphind-host-identity-reset.js',
    'out/main/chunks/**',
    'out/renderer/**',
    'out/mobile-web/**',
    'resources/**',
    'node_modules/ws/**',
    'node_modules/tweetnacl/**',
    'node_modules/zod/**',
    'node_modules/yaml/**'
  ],
  artifactBuildCompleted: ({ file, arch }) => {
    if (file.endsWith('.AppImage')) {
      verifyStaticAppImagePackage(file, arch)
    }
  },
  // electron-builder calls this with the context alone. The second parameter is the bundle root,
  // so a test can point the guard at a scratch bundle instead of needing the repo's out/ built.
  beforePack: (
    context,
    mobileWebBundleDir = MOBILE_WEB_BUNDLE_DIR,
    ensureWaylandClipboard = ensureBundledWaylandClipboard,
    dolphindTemplateDir = join(__dirname, '..', dolphindTemplateExtraResource.from)
  ) => {
    // The template is the server every SSH host gets, so a dark test template must never ship.
    assertNotDarkBuild([
      join(__dirname, '..', 'out', 'main'),
      mobileWebBundleDir,
      dolphindTemplateDir
    ])
    assertPackagedNativeVariantsInstalled(context.electronPlatformName, context.arch)
    assertBundledRipgrepInstalled()
    assertProcessHostOutputBuilt()
    assertDolphindTemplateBuilt()
    assertDolphinCoreBuilt()
    // Why: Dolphin no trae DOLPHIN Mobile (se retiró con su script build:mobile-web), así que el bundle
    // es opcional; el runtime contesta «sin bundle». Si alguien lo arma, tiene que estar entero.
    if (existsSync(mobileWebBundleDir)) {
      assertMobileWebBundleBuilt(mobileWebBundleDir)
    }
    if (context.electronPlatformName === 'linux') {
      ensureWaylandClipboard(context.arch)
    }
  },
  afterPack: async (context) => {
    const resourcesDir =
      context.electronPlatformName === 'darwin'
        ? join(
            context.appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
            'Contents',
            'Resources'
          )
        : join(context.appOutDir, 'resources')
    if (!existsSync(resourcesDir)) {
      throw new Error(`Missing packaged resources directory: ${resourcesDir}`)
    }
    // FpmTarget replaces this with deb/rpm while building those artifacts from the shared app tree.
    if (context.electronPlatformName === 'linux') {
      writeFileSync(join(resourcesDir, 'package-type'), 'AppImage')
    }
    if (context.electronPlatformName === 'darwin') {
      applyMacHelperFolderUsageDescriptions(
        join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
        context.packager.appInfo.productFilename
      )
      const architecture = macSliceArch(context.arch, 'local-build compatibility')
      const schedulingAddon = buildMacShipItScheduling(resourcesDir, architecture)
      await signMacStandaloneHelper(schedulingAddon, 'ShipIt scheduling', context.packager)
      const version = context.packager.appInfo.version
      let commit = process.env.DOLPHIN_BUILD_COMMIT || process.env.GITHUB_SHA || 'unknown'
      if (commit === 'unknown') {
        try {
          commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
            encoding: 'utf8'
          }).trim()
        } catch {
          // Source archives can still produce a signed build with an explicit version.
        }
      }
      writeMacBuildCompatibility(resourcesDir, { version, commit, architecture })
    }
    stampPackagedCliVersion(resourcesDir, context.packager.appInfo.version)
    // Before the prune, which drops the copied packages' type declarations too.
    copyPackagedTranscribeCpp(
      readPackage,
      resourcesDir,
      context.electronPlatformName,
      normalizeElectronArchitecture(context.arch)
    )
    prunePackagedRuntimeNodeModules(resourcesDir, context.electronPlatformName, context.arch)
    assertNoWindowsExecutablesInRuntimeNodeModules(resourcesDir, context.electronPlatformName)
    // Gate native glibc floor after pruning foreign CPU variants; GLIBC_2.34 once broke Ubuntu 20.04 startup (#9902).
    let appImageNodeRuntime = null
    if (context.electronPlatformName === 'linux') {
      const targetArch = { 1: 'x64', 3: 'arm64' }[context.arch]
      // Before the floor gate, so the bundled Node is held to the same glibc floor.
      appImageNodeRuntime = await placeAppImageNodeRuntime(resourcesDir, targetArch)
      // Why the arch is passed: symbol-version checks pass happily on a wrong-architecture binary,
      // so a cross-built slice could ship the host's pty.node and only fail at runtime.
      finalizePackagedWaylandClipboard(resourcesDir)
      verifyLinuxGlibcFloor(context.appOutDir, { targetArch })
    }
    verifyPackagedMainRuntimeDeps(resourcesDir)
    // Smoke only host-runnable slices: daemon JS loads target-arch node-pty. Arch enum ia32=0, x64=1, armv7l=2, arm64=3, universal=4.
    const archEnumByNodeArch = { ia32: 0, x64: 1, armv7l: 2, arm64: 3 }
    const hostArchEnum = archEnumByNodeArch[process.arch]
    const canExecuteTargetArch = context.arch === hostArchEnum || context.arch === 4
    if (context.electronPlatformName === 'win32') {
      verifyPackagedWindowsNodePty(resourcesDir, context.arch, { canExecuteTargetArch })
      verifyPackagedWindowsAgentHook(resourcesDir, context.arch)
      verifyPackagedWindowsCliLauncher(context.appOutDir, windowsExecutableName)
    }
    verifySkillsCliRuntime(join(resourcesDir, 'app.asar.unpacked', 'out'), resourcesDir, {
      executeCommands: canExecuteTargetArch
    })
    if (!canExecuteTargetArch) {
      console.log(
        `[verify-skills-cli-runtime] skipped command probes on cross-arch slice (target ${context.arch}, host ${process.arch})`
      )
    }
    if (canExecuteTargetArch) {
      verifyPackagedDaemonEntryBoots(resourcesDir)
      if (appImageNodeRuntime) {
        await verifyAppImageNodeRuntimeServesPty(resourcesDir, appImageNodeRuntime)
      }
    } else {
      // Cross-arch smoke cannot run, but missing unpacked entry is always a packaging error.
      assertPackagedDaemonEntryExists(resourcesDir)
      console.log(
        `[verify-packaged-daemon-entry] skipped boot on cross-arch slice (target ${context.arch}, host ${process.arch})`
      )
    }
    // Validate real electron-builder output so broken extraResources mappings fail before shipping.
    verifyPackagedPluginResources(resourcesDir)
    verifyPackagedPluginTypings(resourcesDir)
    verifyPackagedDolphinCore(resourcesDir)
    assertPackagedWebClient(resourcesDir)
    assertPackagedServeSelectionEntry(resourcesDir)
    finalizePackagedRipgrep(resourcesDir)
    for (const filename of readdirSync(resourcesDir)) {
      if (!filename.startsWith('agent-browser-')) {
        continue
      }
      // Upstream executable bits vary (notably darwin-x64); restore them so packaged execFile works.
      chmodSync(join(resourcesDir, filename), 0o755)
      // The dolphind template hashes this exact file next, so app signing must not rewrite it later.
      if (context.electronPlatformName === 'darwin') {
        await signMacStandaloneHelper(
          join(resourcesDir, filename),
          filename,
          context.packager,
          resolve(__dirname, '../resources/build/entitlements.mac.plist')
        )
      }
    }
    await finalizePackagedDolphindTemplate(resourcesDir, {
      platform: context.electronPlatformName,
      signMacBinary: (path) =>
        signMacStandaloneHelper(path, 'dolphind template binary', context.packager)
    })
    chmodUnixCliLaunchers(resourcesDir, context.electronPlatformName)
    if (context.electronPlatformName === 'darwin') {
      await signMacComputerUseHelper(
        join(resourcesDir, 'Dolphin Computer Use.app'),
        context.packager
      )
      await signMacStandaloneHelper(
        join(resourcesDir, '..', 'MacOS', 'dolphin-notification-status'),
        'dolphin-notification-status',
        context.packager
      )
      await signMacStandaloneHelper(
        join(resourcesDir, '..', 'MacOS', 'dolphin-keyboard-layout'),
        'dolphin-keyboard-layout',
        context.packager
      )
      await signMacStandaloneHelper(
        join(resourcesDir, '..', 'MacOS', 'dolphin-process-footprint'),
        'dolphin-process-footprint',
        context.packager
      )
      await packageMacTerminalHost(join(resourcesDir, '..', '..'), context)
    }
  },
  win: {
    // Sin espacio: es el nombre del binario, y es lo que mira la detección de juegos de Discord.
    // Sale de config/windows-executable-name.txt, el mismo archivo que compila el launcher del CLI
    // (native/windows-cli-launcher/src/app_executable.rs): cambiarlo acá sólo es cambiarlo allá.
    executableName: windowsExecutableName,
    // Why: Windows installers are signed after electron-builder packaging by
    // SignPath, so the packager cannot infer the updater publisherName.
    //
    // Why dev channels drop it instead: they ship unsigned, because SignPath's
    // approval waits are budgeted in hours and cannot fit an hourly cadence.
    // electron-updater Authenticode-verifies every installer it downloads
    // against the publisherName baked into the *installed* app's app-update.yml
    // (NsisUpdater.verifySignature), and skips verification entirely when that
    // name is absent. An unsigned build that still claimed 'SignPath Foundation'
    // would therefore reject its own channel's next build — and its way back to
    // stable with it. Dropping it is what makes dev→dev and dev→stable work.
    // Why a sign hook on a build that does not sign: it is the only moment
    // electron-builder exposes the NSIS uninstaller (built in its own makensis
    // pass, embedded, then deleted). The hook signs nothing — it relays the file
    // to and from the CI SignPath request, and is inert when the relay env vars
    // are unset, so local and dev builds are unaffected. publisherName stays on
    // its existing channel split above.
    signtoolOptions: {
      sign: signWindowsUninstallerViaSignPath,
      ...(firmaDeVerdad ? { publisherName: 'SignPath Foundation' } : {})
    },
    ...(firmaDeVerdad ? {} : { verifyUpdateCodeSignature: false }),
    extraResources: [
      ...commonExtraResources,
      ...windowsRuntimeResources,
      {
        from: 'resources/win32/bin/dolphin.cmd',
        to: 'bin/dolphin.cmd'
      },
      {
        from: 'native/windows-cli-launcher/.build/dolphin.exe',
        to: 'bin/dolphin.exe'
      },
      {
        from: 'native/windows-cli-launcher/.build/dolphin-administrator-restart.exe',
        to: 'bin/dolphin-administrator-restart.exe'
      },
      // Why resources/bin: SignPath signs every unsigned PE under win-unpacked, and the hook
      // installer copies this signed file into ~/.dolphin/agent-hooks (#20913).
      {
        from: 'native/windows-agent-hook/.build/dolphin-agent-hook.exe',
        to: 'bin/dolphin-agent-hook.exe'
      },
      {
        from: 'node_modules/agent-browser/bin/agent-browser-win32-x64.exe',
        to: 'agent-browser-win32-x64.exe'
      },
      {
        from: 'native/computer-use-windows/runtime.ps1',
        to: 'computer-use-windows/runtime.ps1'
      },
      {
        from: 'native/xray-windows/xray.ps1',
        to: 'xray-windows/xray.ps1'
      },
      cartelResources
    ]
  },
  nsis: {
    artifactName: 'dolphin-windows-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    // One NSIS include hosts update-guarded daemon cleanup and additive markdown Open With registration.
    // Avoid fileAssociations: it would steal default .md ownership; see the include’s header.
    include: resolve(__dirname, 'nsis', 'dolphin-installer-hooks.nsh')
  },
  mac: {
    // Alternate rank preserves Finder’s default; one entry per extension because app-builder globs the value as a string.
    fileAssociations: [
      ...MARKDOWN_FILE_EXTENSIONS.map((ext) => ({
        ext,
        name: 'Markdown Document',
        description: 'Markdown Document',
        role: 'Editor',
        rank: 'Alternate'
      })),
      ...TABULAR_FILE_EXTENSIONS.map((ext) => ({
        ext,
        name: `${ext.toUpperCase()} Document`,
        description: `${ext.toUpperCase()} Document`,
        role: 'Editor',
        rank: 'Alternate'
      }))
    ],
    // Set for ONNX Runtime (#22690, #39135), now gone; transcribe-cpp needs 11.0, Electron 12.0. Kept until
    // Kelvin decides. The update-manifest gate reads this from Info.plist.
    minimumSystemVersion: '13.4',
    icon: 'resources/build/icon.icns',
    entitlements: 'resources/build/entitlements.mac.plist',
    entitlementsInherit: 'resources/build/entitlements.mac.plist',
    ...(isMacRelease
      ? { sign: resolve(__dirname, './scripts/desktop-distribution/macos/sign-mac-app.mjs') }
      : {}),
    signIgnore: [
      ...bundledRipgrepMacSignIgnore,
      ...dolphindTemplateMacSignIgnore,
      // afterPack signs it before the dolphind template hashes it.
      '/Contents/Resources/agent-browser-darwin-[^/]+$',
      ...macTerminalHostSignIgnore
    ],
    extendInfo: macUsageDescriptions,
    // Local macOS builds need no release credentials; hardening/notarization stay on explicit release paths.
    hardenedRuntime: isMacRelease,
    // Dev notarization preserves TCC identifier/team identity across cdhash changes; unticketed hourly updates otherwise lose folder grants with EPERM and no prompt.
    notarize: isMacRelease,
    extraResources: [
      ...commonExtraResources,
      ...createPackagedRuntimeNodeModuleResources('darwin'),
      {
        from: 'resources/darwin/bin/dolphin',
        to: 'bin/dolphin'
      },
      {
        from: 'node_modules/agent-browser/bin/agent-browser-darwin-${arch}',
        to: 'agent-browser-darwin-${arch}'
      },
      {
        from: 'native/computer-use-macos/.build/release/Dolphin Computer Use.app',
        to: 'Dolphin Computer Use.app'
      },
      cartelResources
    ],
    // macOS 26 UNUserNotificationCenter aborts helpers launched from Resources; execute from Contents/MacOS (#7929).
    extraFiles: [
      {
        from: 'native/notification-status-macos/.build/release/dolphin-notification-status',
        to: 'MacOS/dolphin-notification-status'
      },
      {
        from: 'native/keyboard-layout-macos/.build/release/dolphin-keyboard-layout',
        to: 'MacOS/dolphin-keyboard-layout'
      },
      {
        from: 'native/process-footprint-macos/.build/release/dolphin-process-footprint',
        to: 'MacOS/dolphin-process-footprint'
      }
    ],
    // Why el mismo nombre para el .zip que para el .dmg: el .zip es el que baja el actualizador de
    // macOS y el que lista `latest-mac.yml`; con el nombre por defecto llevaría el productName con
    // espacio adentro, que GitHub reescribe al subirlo y deja al manifiesto apuntando a otro archivo.
    artifactName: 'dolphin-macos-${arch}.${ext}',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ]
  },
  // Why: release builds should fail if signing is unavailable instead of
  // silently downgrading to ad-hoc artifacts that look shippable in CI logs.
  forceCodeSigning: isMacRelease,
  dmg: {
    artifactName: 'dolphin-macos-${arch}.${ext}'
  },
  linux: {
    // shared-mime-info already maps md/markdown: advertise handler only, leaving mimeapps.list defaults intact.
    // Omit mdx because Ubuntu 24.04 maps it to application/x-genesis-32x-rom; claiming it would need a glob override.
    mimeTypes: ['text/markdown', 'text/csv', 'text/tab-separated-values'],
    // Why: Dolphin owns the plain `dolphin` command and does not claim GNOME Dolphin's `orca` name.
    executableName: 'dolphin',
    // Why: the icns source lets electron-builder emit standard hicolor PNG
    // sizes; a single 1024px PNG is ignored by some Linux docks/launchers.
    icon: 'resources/build/icon.icns',
    desktop: {
      entry: {
        // Why: the desktop entry and Electron window must share Dolphin's class for dock grouping.
        StartupWMClass: 'dolphin'
      }
    },
    extraResources: [
      ...commonExtraResources,
      ...createPackagedRuntimeNodeModuleResources('linux'),
      {
        from: 'native/wayland-clipboard/.build/${arch}/dolphin-wayland-clipboard',
        to: 'bin/dolphin-wayland-clipboard'
      },
      {
        from: 'resources/linux/bin/dolphin',
        to: 'bin/dolphin'
      },
      {
        from: 'node_modules/agent-browser/bin/agent-browser-linux-${arch}',
        to: 'agent-browser-linux-${arch}'
      },
      {
        from: 'native/computer-use-linux/runtime.py',
        to: 'computer-use-linux/runtime.py'
      },
      cartelResources
    ],
    // Keep local artifacts aligned with the release pipeline.
    target: ['AppImage', 'deb', 'rpm'],
    maintainer: 'Dolphin <https://odolphin.tech>',
    category: 'Utility'
  },
  appImage: {
    artifactName: isLinuxArm64Release ? 'dolphin-linux-arm64.${ext}' : 'dolphin-linux.${ext}'
  },
  deb: {
    packageName: 'dolphin',
    artifactName: 'dolphin_${version}_${arch}.${ext}',
    // Why: xvfb lets the bundled `dolphin serve` CLI run browser panes on a headless
    // Linux host — Chromium needs a display server even for offscreen rendering,
    // and serve starts Xvfb itself when present (see ensure-virtual-display.ts).
    depends: [
      ...debElectronRuntimeDependencies,
      'python3',
      'python3-gi',
      'gir1.2-atspi-2.0',
      'at-spi2-core',
      'xdotool',
      'xclip',
      'xvfb'
    ],
    // Install CLI onto PATH for headless hosts where GUI-triggered CliInstaller can never run.
    afterInstall: 'resources/linux/packaging/after-install.sh',
    afterRemove: 'resources/linux/packaging/after-remove.sh',
    // Why: only an AppImage's files can vanish under a running daemon (see appimage-node-runtime.cjs).
    fpm: appImageNodeRuntimeFpmArgs
  },
  rpm: {
    packageName: 'dolphin',
    artifactName: 'dolphin-${version}.${arch}.${ext}',
    // Why: see deb depends. RPM distros ship Xvfb as xorg-x11-server-Xvfb (there
    // is no `xvfb` package), so the name differs from the deb here.
    depends: [
      ...rpmElectronRuntimeDependencies,
      'python3',
      'python3-gobject',
      'xdotool',
      'xclip',
      'xorg-x11-server-Xvfb'
    ],
    // Why: same headless CLI-on-PATH registration as deb; rpm runs these via fpm.
    afterInstall: 'resources/linux/packaging/after-install.sh',
    afterRemove: 'resources/linux/packaging/after-remove.sh',
    // Why: only an AppImage's files can vanish under a running daemon (see appimage-node-runtime.cjs).
    fpm: appImageNodeRuntimeFpmArgs
  },
  beforeBuild: electronBuilderNativeRebuild,
  // Dual-arch builds need target node-pty rebuilds or Intel Macs get arm64 binaries and posix_spawnp failure.
  // beforeBuild performs targeted rebuild then returns false to skip optional cpu-features.
  npmRebuild: true,
  // Why: owner/repo van junto con DOLPHIN_UPDATE_FEED en dolphin-brand.ts; se cambian juntos.
  publish: {
    provider: 'github',
    owner: 'Nicoo01x',
    repo: devChannelRepo ?? 'dolphin-app',
    // Why borrador en el repo principal: con `--publish always` cada plataforma sube apenas termina,
    // y una release pública a medias hace que /releases/latest ofrezca un manifiesto cuyo instalador
    // todavía no está. El workflow `instaladores.yml` crea el borrador, las tres plataformas suben
    // ahí, y el último job lo publica recién cuando verificó todos los archivos.
    releaseType: devChannelRepo ? 'prerelease' : 'draft'
  }
}

// Stamp the effective channel version where node-mode CLI code can read it.
function stampPackagedCliVersion(resourcesDir, version) {
  const packageJsonPath = join(resourcesDir, 'app.asar.unpacked', 'out', 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Missing unpacked CLI package boundary: ${packageJsonPath}`)
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  writeFileSync(packageJsonPath, `${JSON.stringify({ ...packageJson, version }, null, 2)}\n`)
}

function chmodUnixCliLaunchers(resourcesDir, electronPlatformName) {
  if (electronPlatformName === 'win32') {
    return
  }
  for (const launcherName of ['dolphin']) {
    const launcherPath = join(resourcesDir, 'bin', launcherName)
    if (!existsSync(launcherPath)) {
      continue
    }
    // Public shell commands need executable extraResources modes despite source/packager drift.
    chmodSync(launcherPath, 0o755)
  }
}

async function signMacComputerUseHelper(helperAppPath, packager) {
  if (!existsSync(helperAppPath)) {
    if (isMacRelease) {
      throw new Error(`Missing Dolphin Computer Use helper app at ${helperAppPath}`)
    }
    return
  }
  const codeSigningInfo =
    isMacRelease && process.env.CSC_LINK && packager?.codeSigningInfo?.value
      ? await packager.codeSigningInfo.value
      : null
  const identity =
    process.env.DOLPHIN_COMPUTER_MACOS_SIGN_IDENTITY ??
    process.env.CSC_NAME ??
    findInstalledMacSigningIdentity(codeSigningInfo?.keychainFile) ??
    (isMacRelease ? null : '-')
  if (!identity) {
    throw new Error('Missing signing identity for Dolphin Computer Use helper app')
  }
  // Why: TCC grants attach to this nested app's code identity. Sign it before
  // the outer Dolphin.app is sealed so production builds preserve that identity.
  execFileSync('codesign', codesignArgs(identity, helperAppPath), { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', helperAppPath], {
    stdio: 'inherit'
  })
}

// electron-builder `Arch` enum: x64=1, arm64=3. A universal (4) slice has no single arch.
function macSliceArch(archEnum, purpose) {
  const arch = { 1: 'x64', 3: 'arm64' }[archEnum]
  if (!arch) {
    throw new Error(`Unsupported ${purpose} architecture: ${archEnum}`)
  }
  return arch
}

// Why after the node_modules prune: the helper copies this slice's node-pty.
async function packageMacTerminalHost(appPath, context) {
  const arch = macSliceArch(context.arch, 'macOS terminal host')
  await buildMacTerminalHost({
    appPath,
    arch,
    iconPath: resolve(__dirname, '../resources/build/icon.icns'),
    entitlementsPath: resolve(__dirname, '../resources/build/entitlements.mac.plist'),
    usageDescriptions: macUsageDescriptions,
    signCode: (path, { entitlements }) =>
      signMacStandaloneHelper(path, 'terminal host', context.packager, entitlements)
  })
  // Only a local build may skip a slice this host cannot run; a shipped slice must serve a PTY.
  await verifyPackagedMacTerminalHostBoots(appPath, {
    arch,
    required: isMacRelease || process.env.CI === 'true'
  })
  await verifyMacTerminalHost({
    appPath,
    arch,
    usageDescriptions: macUsageDescriptions,
    expectedTeamId: isMacRelease ? DOLPHIN_MAC_TEAM_ID : null
  })
}

async function signMacStandaloneHelper(helperPath, helperName, packager, entitlements) {
  if (!existsSync(helperPath)) {
    if (isMacRelease) {
      throw new Error(`Missing ${helperName} helper at ${helperPath}`)
    }
    return
  }
  const codeSigningInfo =
    isMacRelease && process.env.CSC_LINK && packager?.codeSigningInfo?.value
      ? await packager.codeSigningInfo.value
      : null
  const identity =
    process.env.CSC_NAME ??
    findInstalledMacSigningIdentity(codeSigningInfo?.keychainFile) ??
    (isMacRelease ? null : '-')
  if (!identity) {
    throw new Error(`Missing signing identity for ${helperName} helper`)
  }
  // Why: nested executables must be signed before the outer app bundle is sealed.
  const args = ['--force', '--sign', identity]
  if (isMacRelease) {
    args.push('--options', 'runtime', '--timestamp')
  }
  if (entitlements) {
    args.push('--entitlements', entitlements)
  }
  args.push(helperPath)
  execFileSync('codesign', args, { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--strict', helperPath], { stdio: 'inherit' })
}

function codesignArgs(identity, targetPath) {
  const args = ['--force', '--deep', '--sign', identity]
  if (isMacRelease) {
    args.push(
      '--options',
      'runtime',
      '--timestamp',
      '--entitlements',
      resolve(__dirname, '../resources/build/entitlements.computer-use.mac.plist')
    )
  }
  args.push(targetPath)
  return args
}

function findInstalledMacSigningIdentity(keychainFile) {
  try {
    const output = execFileSync(
      'security',
      ['find-identity', '-v', '-p', 'codesigning', ...(keychainFile ? [keychainFile] : [])],
      {
        encoding: 'utf8'
      }
    )
    const releaseMatch =
      output.match(/"([^"]*Developer ID Application:[^"]+)"/) ??
      output.match(/"([^"]*Apple Distribution:[^"]+)"/)
    if (releaseMatch?.[1]) {
      return releaseMatch[1]
    }
    if (!isMacRelease) {
      return output.match(/"([^"]*Apple Development:[^"]+)"/)?.[1] ?? null
    }
  } catch {}
  return null
}
