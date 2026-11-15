const { createHash } = require('node:crypto')
const { existsSync, lstatSync, readFileSync, readdirSync } = require('node:fs')
const { basename, join, relative, sep } = require('node:path')
const {
  DOLPHIND_MOBILE_WEB_MANIFEST,
  DOLPHIND_NODE_RUNTIME_MARKER_FILENAME,
  DOLPHIND_SERVER_TARGET_FILENAME,
  DOLPHIND_TEMPLATE_MANIFEST_FILENAME,
  DOLPHIND_TEMPLATE_TARGETS_DIR,
  dolphindMobileWebAssetFilenames,
  dolphindTemplateCommonFilenames,
  dolphindTemplatePackagedRipgrep,
  dolphindTemplateTargetFilenames
} = require('../../../../src/shared/dolphind-artifacts.ts')
const {
  COMPAT_SERVER_TARGETS,
  DOLPHIND_TEMPLATE_TARGETS,
  pinnedNodeRuntimeAsset
} = require('../../../../src/shared/node-runtime-pin.ts')

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const BROWSER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const TEMPLATE_SCHEMA_VERSION = 3

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readManifest(templateDir) {
  const path = join(templateDir, DOLPHIND_TEMPLATE_MANIFEST_FILENAME)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `[verify-packaged-dolphind-template] invalid manifest at ${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[verify-packaged-dolphind-template] ${label} must be an object`)
  }
  return value
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`[verify-packaged-dolphind-template] ${label} must be a SHA-256 digest`)
  }
  return value
}

function requireRegularFile(path, label) {
  let metadata
  try {
    metadata = lstatSync(path)
  } catch {
    throw new Error(`[verify-packaged-dolphind-template] missing ${label} at ${path}`)
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`[verify-packaged-dolphind-template] ${label} is not a regular file at ${path}`)
  }
}

function verifyFile(path, expected, label) {
  requireRegularFile(path, label)
  const actual = sha256(path)
  if (actual !== expected) {
    throw new Error(
      `[verify-packaged-dolphind-template] ${label} checksum mismatch: expected ${expected}, got ${actual}`
    )
  }
}

function requireExactNames(actual, expected, label) {
  const actualNames = [...actual].sort()
  const expectedNames = [...expected].sort()
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      `[verify-packaged-dolphind-template] ${label} mismatch: expected=${expectedNames.join(',')} actual=${actualNames.join(',')}`
    )
  }
}

function listFiles(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

function requireContent(path, expected, label) {
  if (readFileSync(path, 'utf8').trim() !== expected) {
    throw new Error(`[verify-packaged-dolphind-template] ${label} disagrees`)
  }
}

function verifyTarget(resourcesDir, templateDir, target, value, schemaVersion) {
  const targetManifest = requireRecord(value, `${target} manifest`)
  const files = requireRecord(targetManifest.files, `${target} files`)
  const packagedRipgrep = dolphindTemplatePackagedRipgrep(
    schemaVersion,
    target,
    targetManifest.packagedRipgrep
  )
  const expectedFiles = dolphindTemplateTargetFilenames(target)
  requireExactNames(Object.keys(files), expectedFiles, `${target} manifest inventory`)
  const hasBrowserName = Object.hasOwn(targetManifest, 'browserName')
  const hasBrowserSha256 = Object.hasOwn(targetManifest, 'browserSha256')
  if (hasBrowserName !== hasBrowserSha256) {
    throw new Error(
      `[verify-packaged-dolphind-template] ${target} browserName and browserSha256 must both be present`
    )
  }
  const packagedBrowser = Object.hasOwn(targetManifest, 'packagedBrowser')
  if (packagedBrowser && (targetManifest.packagedBrowser !== true || !hasBrowserName)) {
    throw new Error(`[verify-packaged-dolphind-template] ${target} packagedBrowser is invalid`)
  }
  const targetDir = join(templateDir, DOLPHIND_TEMPLATE_TARGETS_DIR, target)
  for (const filename of expectedFiles) {
    verifyFile(
      join(filename === packagedRipgrep ? resourcesDir : targetDir, ...filename.split('/')),
      requireSha256(files[filename], `${target} ${filename} checksum`),
      `${target} ${filename}`
    )
  }
  requireContent(
    join(targetDir, DOLPHIND_SERVER_TARGET_FILENAME),
    target,
    `${target} server target`
  )
  requireContent(
    join(targetDir, DOLPHIND_NODE_RUNTIME_MARKER_FILENAME),
    pinnedNodeRuntimeAsset(target).executableSha256,
    `${target} runtime reference`
  )

  const inventory = expectedFiles.filter((filename) => filename !== packagedRipgrep)
  if (hasBrowserName) {
    const browserName = targetManifest.browserName
    if (
      typeof browserName !== 'string' ||
      !BROWSER_NAME_PATTERN.test(browserName) ||
      basename(browserName) !== browserName
    ) {
      throw new Error(`[verify-packaged-dolphind-template] ${target} browserName is invalid`)
    }
    verifyFile(
      join(packagedBrowser ? resourcesDir : targetDir, browserName),
      requireSha256(targetManifest.browserSha256, `${target} browserSha256`),
      `${target} browser`
    )
    if (!packagedBrowser) {
      inventory.push(browserName)
    }
  }
  requireExactNames(listFiles(targetDir), inventory, `${target} file inventory`)
}

/** `targets` narrows the inventory for a CI-only partial template; packaging checks them all. */
/**
 * Verifica la plantilla que quedó empaquetada.
 *
 * `targets` null —lo normal— significa «verificá lo que la plantilla DICE que trae»: cada destino
 * declarado se comprueba archivo por archivo contra su checksum, y un nombre que no sea un destino
 * conocido es un error. `targets` con una lista exige exactamente esa, y es lo que usa el portón de
 * release para no publicar un instalador al que le falte una plataforma.
 *
 * Why se dejó de exigir siempre los ocho: el servidor de cada destino se compila en una máquina de
 * ese destino, así que una build que no los tuvo todos fallaba acá y terminaba enviándose SIN
 * plantilla —y sin plantilla no se puede conectar ningún host, ni siquiera los que sí se
 * compilaron—. Con esto se envía lo que se tenga, y un host cuyo destino no viaja recibe el motivo
 * en palabras (`ssh-host-unserved-status.ts`) en vez de un silencio.
 */
function verifyPackagedDolphindTemplate(resourcesDir, targets = null) {
  const templateDir = join(resourcesDir, 'dolphind-template')
  const manifest = requireRecord(readManifest(templateDir), 'manifest')
  if (![TEMPLATE_SCHEMA_VERSION, 4].includes(manifest.schemaVersion)) {
    throw new Error(
      `[verify-packaged-dolphind-template] manifest schemaVersion must be ${TEMPLATE_SCHEMA_VERSION} or 4`
    )
  }
  const commonSha256 = requireRecord(manifest.commonSha256, 'commonSha256')
  const pageManifest = join(templateDir, ...DOLPHIND_MOBILE_WEB_MANIFEST.split('/'))
  // Why absence is allowed: an app built without a mobile page ships a template without one, and
  // its clients already handle that (`mobileWeb.bundle.*` answers "no bundle"). A manifest listed
  // in commonSha256 but missing on disk is still caught, by the inventory check below.
  // Why verified before it is read: its contents name what else has to be verified.
  const hasPage = existsSync(pageManifest)
  if (hasPage) {
    verifyFile(
      pageManifest,
      requireSha256(
        commonSha256[DOLPHIND_MOBILE_WEB_MANIFEST],
        `${DOLPHIND_MOBILE_WEB_MANIFEST} checksum`
      ),
      DOLPHIND_MOBILE_WEB_MANIFEST
    )
  }
  const commonFilenames = dolphindTemplateCommonFilenames(
    hasPage ? dolphindMobileWebAssetFilenames(readFileSync(pageManifest, 'utf8')) : []
  )
  requireExactNames(Object.keys(commonSha256), commonFilenames, 'common manifest inventory')
  for (const filename of commonFilenames) {
    verifyFile(
      join(templateDir, ...filename.split('/')),
      requireSha256(commonSha256[filename], `${filename} checksum`),
      filename
    )
  }

  const manifestTargets = requireRecord(manifest.targets, 'targets')
  // Compat targets (design D6 rung B) are optional: a build without the compat slot omits them.
  const compatTargets = COMPAT_SERVER_TARGETS.filter((target) =>
    Object.hasOwn(manifestTargets, target)
  )
  const declarados = Object.keys(manifestTargets).filter(
    (target) => !COMPAT_SERVER_TARGETS.includes(target)
  )
  const desconocidos = declarados.filter((target) => !DOLPHIND_TEMPLATE_TARGETS.includes(target))
  if (desconocidos.length > 0) {
    throw new Error(
      `[verify-packaged-dolphind-template] manifest names targets that do not exist: ${desconocidos.join(',')}`
    )
  }
  if (declarados.length === 0) {
    throw new Error('[verify-packaged-dolphind-template] the template declares no target at all')
  }
  const expectedTargets = [...(targets ?? declarados), ...compatTargets]
  requireExactNames(Object.keys(manifestTargets), expectedTargets, 'target manifest inventory')
  requireExactNames(
    readdirSync(join(templateDir, DOLPHIND_TEMPLATE_TARGETS_DIR)),
    expectedTargets,
    'target directory inventory'
  )
  for (const target of expectedTargets) {
    verifyTarget(resourcesDir, templateDir, target, manifestTargets[target], manifest.schemaVersion)
  }
  console.log(
    `[verify-packaged-dolphind-template] OK — verified ${expectedTargets.length} Node targets`
  )
}

module.exports = { TEMPLATE_SCHEMA_VERSION, verifyPackagedDolphindTemplate }
