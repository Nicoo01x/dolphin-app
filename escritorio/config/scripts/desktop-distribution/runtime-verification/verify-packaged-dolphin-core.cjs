const { existsSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

// El núcleo de Dolphin (siembras, portón, la consola web) vive en la raíz del repo, arriba de
// escritorio/. La app instalada lo lleva construido en resources/dolphin-app y lo corre con su
// propio Electron como Node (ver src/main/dolphin/dolphin-console-arranque.ts, consoleEntry).
const DOLPHIN_CORE_ROOT = resolve(__dirname, '../../../../..')
const DOLPHIN_CORE_RESOURCE_DIR = 'dolphin-app'
const REMEDY =
  'Construí el núcleo en la raíz del repo antes de empaquetar: npm ci && npm run build && npm run ui:build.'

// Lo que el núcleo construido lee en runtime: dist/ (el código; la app lanza ui-cli.js para la
// consola y dolphin.js para el reporte de bugs de X-ray), ui/dist (la consola) y ui/public
// (sus estáticos sueltos, ver servidor.ts), package.json («type: module», sin eso dist/ no carga)
// y bin/ (el comando `dolphin`). No tiene dependencias: no lleva node_modules.
const DOLPHIN_CORE_REQUIRED_FILES = [
  'dist/ui-cli.js',
  'dist/dolphin.js',
  'dist/servidor.js',
  'ui/dist/index.html',
  'package.json'
]

function failure(message) {
  return new Error(`[verify-packaged-dolphin-core] ${message}`)
}

/** Las entradas de extraResources que copian el núcleo construido a resources/dolphin-app. */
function dolphinCoreExtraResources(coreRoot = DOLPHIN_CORE_ROOT) {
  const to = (path) => `${DOLPHIN_CORE_RESOURCE_DIR}/${path}`
  return [
    { from: join(coreRoot, 'dist'), to: to('dist') },
    { from: join(coreRoot, 'ui', 'dist'), to: to('ui/dist') },
    { from: join(coreRoot, 'ui', 'public'), to: to('ui/public') },
    { from: join(coreRoot, 'bin'), to: to('bin') },
    { from: join(coreRoot, 'package.json'), to: to('package.json') }
  ]
}

function assertCoreTree(root, where) {
  const missing = DOLPHIN_CORE_REQUIRED_FILES.filter(
    (path) => !existsSync(join(root, ...path.split('/')))
  )
  if (missing.length > 0) {
    throw failure(`${where} no tiene ${missing.join(', ')}. ${REMEDY}`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    throw failure(`${where}: package.json no se puede leer (${error.message}).`)
  }
  if (manifest.type !== 'module') {
    throw failure(`${where}: package.json no dice "type": "module" y dist/ no cargaría.`)
  }
}

/** Antes de empaquetar: que el núcleo esté construido en la raíz, o no hay nada que copiar. */
function assertDolphinCoreBuilt(coreRoot = DOLPHIN_CORE_ROOT) {
  assertCoreTree(coreRoot, `El núcleo de Dolphin (${coreRoot})`)
}

/** Después de empaquetar: un instalador sin el núcleo abre una consola que no arranca nunca. */
function verifyPackagedDolphinCore(resourcesDir) {
  const packaged = join(resourcesDir, DOLPHIN_CORE_RESOURCE_DIR)
  assertCoreTree(packaged, `El paquete (${packaged})`)
  console.log(`[verify-packaged-dolphin-core] OK — ${packaged} trae el núcleo construido`)
}

module.exports = {
  DOLPHIN_CORE_REQUIRED_FILES,
  DOLPHIN_CORE_RESOURCE_DIR,
  DOLPHIN_CORE_ROOT,
  assertDolphinCoreBuilt,
  dolphinCoreExtraResources,
  verifyPackagedDolphinCore
}
