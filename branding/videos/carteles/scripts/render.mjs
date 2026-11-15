import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import process from 'node:process'
import { CLIPS } from './clips.mjs'

/**
 * Renderiza cada clip a mp4 y saca su poster.
 *
 * Why h264 y no webm: el mismo archivo lo tiene que poder leer el `<video>` de Chromium adentro de
 * Electron y el de Safari en la web, y h264 es el único que los dos tocan sin peros.
 *
 * Why `--crf 26` y 1280 de ancho: el clip se mira en una tarjeta de ~560 px y en loop, así que lo
 * que importa es que pese poco; a este tamaño cada uno queda abajo de 400 KB.
 */
const ENTRADA = 'src/index.ts'

/**
 * El puerto del servidor que Remotion levanta para que su navegador lea el bundle.
 *
 * Why no el 3000 que trae por defecto: en una máquina de trabajo ese puerto lo ocupa cualquier
 * cosa —un dev server, un backend— y cuando pasa, el render no dice «el puerto está ocupado»:
 * dice «Visited http://localhost:3000/index.html but got no response», o se cae antes con un
 * timeout al conectar con el navegador. Dos errores que no se parecen a la causa. Un puerto alto
 * y propio saca el problema de la mesa.
 */
const PUERTO = 3977

function correr(args) {
  const resultado = spawnSync('npx', ['remotion', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (resultado.status !== 0) {
    throw new Error(`remotion ${args[0]} ${args[1]} salió con ${resultado.status ?? 'sin código'}`)
  }
}

const pedidos = process.argv.slice(2)
const clips = pedidos.length > 0 ? CLIPS.filter((clip) => pedidos.includes(clip.id)) : CLIPS
if (clips.length === 0) {
  throw new Error(`no conozco ningún clip llamado ${pedidos.join(', ')}`)
}

mkdirSync('out', { recursive: true })
for (const clip of clips) {
  correr([
    'render',
    ENTRADA,
    clip.id,
    `out/${clip.id}.mp4`,
    '--codec=h264',
    '--crf=26',
    '--muted',
    `--port=${PUERTO}`
  ])
  correr([
    'still',
    ENTRADA,
    clip.id,
    `out/${clip.id}.poster.jpg`,
    `--frame=${clip.poster}`,
    '--image-format=jpeg',
    '--jpeg-quality=80',
    `--port=${PUERTO}`
  ])
  console.log(`[carteles] ${clip.id} listo`)
}
