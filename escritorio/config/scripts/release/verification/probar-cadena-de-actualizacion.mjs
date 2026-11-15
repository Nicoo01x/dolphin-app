#!/usr/bin/env node
// Prueba la cadena de actualización sin publicar nada: una app «instalada» en la versión ACTUAL le
// pregunta a un servidor local, armado igual que las releases de GitHub, y tiene que ver la
// SIGUIENTE. Corre con el Electron y el electron-updater de verdad del repo, y con el mismo feed que
// arma la app (`provider: generic` sobre `/releases/latest/download`, ver updater-setup.ts).
//
// Uso: node config/scripts/release/verification/probar-cadena-de-actualizacion.mjs
//
// Lo que demuestra, por escenario:
//   - hay-version-nueva: 1.6.0 instalada + 1.6.1 publicada → `update-available` con la 1.6.1. En
//     Windows además la baja entera, verifica el sha512 y llega a `update-downloaded` (es el
//     momento en que la tarjeta ofrece «Reiniciar para actualizar»).
//   - al-dia: 1.6.0 instalada + 1.6.0 publicada → `update-not-available`.
//   - trampa-publisher (sólo Windows): la instalada dice `publisherName` sin estar firmada, como la
//     1.5.2 → rechaza la versión nueva por firma. Es lo que NO tiene que volver a pasar.
// Lo que NO demuestra: que el instalador NSIS se ejecute y reemplace la app (haría falta un
// instalador real), ni el reemplazo de macOS (Squirrel.Mac exige firma).

import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const electronUpdaterEntry = require.resolve('electron-updater')

const INSTALADA = '1.6.0'
const SIGUIENTE = '1.6.1'
const RUTA_FEED = '/Nicoo01x/dolphin-app/releases/latest/download'
const INSTALADOR = 'dolphin-windows-setup.exe'
const CACHE = 'dolphin-prueba-actualizacion'
const TOPE_MS = 90_000

const instaladorFalso = randomBytes(256 * 1024)
const sha512 = createHash('sha512').update(instaladorFalso).digest('base64')

function manifiesto(version) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${INSTALADOR}`,
    `    sha512: ${sha512}`,
    `    size: ${instaladorFalso.length}`,
    `path: ${INSTALADOR}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    ''
  ].join('\n')
}

function levantarServidor(versionPublicada) {
  const pedidos = []
  const server = createServer((req, res) => {
    pedidos.push(req.url)
    const ruta = (req.url ?? '').split('?')[0]
    if (ruta.startsWith(`${RUTA_FEED}/latest`) && ruta.endsWith('.yml')) {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end(manifiesto(versionPublicada))
      return
    }
    if (ruta === `${RUTA_FEED}/${INSTALADOR}`) {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': instaladorFalso.length
      })
      res.end(instaladorFalso)
      return
    }
    res.writeHead(404)
    res.end()
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, pedidos, puerto: server.address().port }))
  })
}

// La app de mentira: lo mínimo que hace updater-setup.ts, sin el resto de Dolphin.
function mainDeLaApp({ feedUrl, descargar, salida }) {
  return `
const { app } = require('electron')
const { writeFileSync, appendFileSync } = require('node:fs')
app.setPath('userData', ${JSON.stringify(join(salida, 'perfil'))})
const anotar = (evento) => appendFileSync(${JSON.stringify(join(salida, 'eventos.jsonl'))}, JSON.stringify(evento) + '\\n')
app.whenReady().then(async () => {
  const { autoUpdater } = require(${JSON.stringify(electronUpdaterEntry)})
  autoUpdater.forceDevUpdateConfig = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.setFeedURL({ provider: 'generic', url: ${JSON.stringify(feedUrl)} })
  autoUpdater.on('update-available', (info) => anotar({ evento: 'update-available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => anotar({ evento: 'update-not-available', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => anotar({ evento: 'update-downloaded', version: info.version }))
  autoUpdater.on('error', (error) => anotar({ evento: 'error', mensaje: String(error && error.message || error) }))
  try {
    const resultado = await autoUpdater.checkForUpdates()
    if (${descargar} && resultado && resultado.isUpdateAvailable) {
      await autoUpdater.downloadUpdate().catch(() => {})
    }
  } catch (error) {
    anotar({ evento: 'error', mensaje: String(error && error.message || error) })
  }
  writeFileSync(${JSON.stringify(join(salida, 'fin'))}, 'ok')
  app.exit(0)
})
`
}

function armarApp({ salida, feedUrl, descargar, publisherName }) {
  const appDir = join(salida, 'app')
  rmSync(appDir, { recursive: true, force: true })
  writeFileSync(join(salida, 'eventos.jsonl'), '')
  mkdirSync(appDir, { recursive: true })
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ name: CACHE, version: INSTALADA, main: 'main.cjs' })
  )
  // Hace de `app-update.yml` de la versión instalada: es el que decide con qué firma se valida.
  const yml = ['provider: generic', `url: ${feedUrl}`, `updaterCacheDirName: ${CACHE}`]
  if (publisherName) {
    yml.push('publisherName:', `  - ${publisherName}`)
  }
  writeFileSync(join(appDir, 'dev-app-update.yml'), `${yml.join('\n')}\n`)
  writeFileSync(join(appDir, 'main.cjs'), mainDeLaApp({ feedUrl, descargar, salida }))
  return appDir
}

function leerEventos(salida) {
  return readFileSync(join(salida, 'eventos.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((linea) => JSON.parse(linea))
}

// Why se borra y no se vacía: Electron arranca como Node pelado con ELECTRON_RUN_AS_NODE puesta,
// aunque valga '' (pasa adentro de una terminal de Dolphin o de un agente), y ahí no hay `app`.
function entornoDeElectron() {
  const entorno = { ...process.env }
  delete entorno.ELECTRON_RUN_AS_NODE
  return entorno
}

// Why spawn y no spawnSync: el servidor del feed vive en este mismo proceso, y un spawnSync le
// congela el event loop: la app le pregunta y nadie le contesta.
function correrElectron(appDir) {
  return new Promise((resolve) => {
    const hijo = spawn(electronBinary, [appDir], { env: entornoDeElectron() })
    let stderr = ''
    hijo.stderr.on('data', (parte) => {
      stderr += parte.toString()
    })
    const tope = setTimeout(() => hijo.kill(), TOPE_MS)
    hijo.on('close', () => {
      clearTimeout(tope)
      resolve({ stderr })
    })
  })
}

// Why se borra en cada escenario: electron-updater guarda lo bajado en esta carpeta y, si ya tiene
// la versión con el mismo sha512, la da por bajada sin volver a pasar por la verificación de firma.
function borrarCacheDelActualizador() {
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Caches')
        : (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'))
  if (base) {
    rmSync(join(base, CACHE), { recursive: true, force: true })
  }
}

async function escenario({ nombre, publicada, descargar, publisherName, espera }) {
  borrarCacheDelActualizador()
  const salida = mkdtempSync(join(tmpdir(), 'dolphin-prueba-update-'))
  const { server, pedidos, puerto } = await levantarServidor(publicada)
  const feedUrl = `http://127.0.0.1:${puerto}${RUTA_FEED}`
  try {
    const appDir = armarApp({ salida, feedUrl, descargar, publisherName })
    const corrida = await correrElectron(appDir)
    const eventos = leerEventos(salida)
    const ok = espera(eventos)
    console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`)
    console.log(`      pedidos: ${pedidos.join(', ')}`)
    console.log(`      eventos: ${JSON.stringify(eventos)}`)
    if (!ok && corrida.stderr) {
      console.log(`      stderr: ${corrida.stderr.slice(-800)}`)
    }
    return ok
  } finally {
    server.close()
    rmSync(salida, { recursive: true, force: true })
    borrarCacheDelActualizador()
  }
}

const enWindows = process.platform === 'win32'
const hay = (eventos, evento, version) =>
  eventos.some((e) => e.evento === evento && (version === undefined || e.version === version))

const resultados = [
  await escenario({
    nombre: `hay-version-nueva (${INSTALADA} instalada, ${SIGUIENTE} publicada)`,
    publicada: SIGUIENTE,
    descargar: enWindows,
    espera: (eventos) =>
      hay(eventos, 'update-available', SIGUIENTE) &&
      (!enWindows || hay(eventos, 'update-downloaded', SIGUIENTE))
  }),
  await escenario({
    nombre: `al-dia (${INSTALADA} instalada y publicada)`,
    publicada: INSTALADA,
    descargar: false,
    espera: (eventos) => hay(eventos, 'update-not-available') && !hay(eventos, 'update-available')
  })
]
if (enWindows) {
  resultados.push(
    await escenario({
      nombre: 'trampa-publisher (instalada sin firma que dice publisherName)',
      publicada: SIGUIENTE,
      descargar: true,
      publisherName: 'SignPath Foundation',
      espera: (eventos) =>
        hay(eventos, 'update-available', SIGUIENTE) &&
        !hay(eventos, 'update-downloaded') &&
        eventos.some((e) => e.evento === 'error' && /sign/i.test(e.mensaje))
    })
  )
}

if (resultados.every(Boolean)) {
  console.log('La cadena de actualización responde como tiene que responder.')
} else {
  process.exitCode = 1
}
