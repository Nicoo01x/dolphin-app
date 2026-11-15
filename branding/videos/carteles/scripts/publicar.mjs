import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIPS } from './clips.mjs'

/**
 * Reparte lo que salió de `render` a los dos lugares donde se mira el mismo clip.
 *
 * - La app: `escritorio/resources/carteles/`, que es lo que empaqueta el instalador y lo que sirve
 *   `app:getCartelAssetBaseUrl`.
 * - La documentación: `escritorio/docs/site/public/docs/`, con el nombre que espera `demoMedia.mjs`
 *   (el video en `videos/<id>.mp4` y el poster en `posters/<id>.jpg`).
 * - El sitio: `web/public/carteles/`, que es de donde los lee `VideoDeFuncion` en las páginas de
 *   dolphin-app/web. Son dos sitios distintos y los dos muestran los mismos clips; antes este
 *   destino no estaba y el primero se había copiado a mano, que es justo lo que se olvida la
 *   segunda vez.
 *
 * Why copiar y no un enlace: el instalador empaqueta `resources/` tal cual, y un enlace simbólico
 * adentro de un asar o de un .deb llega roto.
 */
const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..', '..', '..', '..')
const ESCRITORIO = join(RAIZ, 'escritorio')

const DESTINOS = [
  {
    nombre: 'la app',
    video: (id) => join(ESCRITORIO, 'resources', 'carteles', `${id}.mp4`),
    poster: (id) => join(ESCRITORIO, 'resources', 'carteles', `${id}.poster.jpg`)
  },
  {
    nombre: 'la documentación',
    video: (id) => join(ESCRITORIO, 'docs', 'site', 'public', 'docs', 'videos', `${id}.mp4`),
    poster: (id) => join(ESCRITORIO, 'docs', 'site', 'public', 'docs', 'posters', `${id}.jpg`)
  },
  {
    nombre: 'el sitio',
    video: (id) => join(RAIZ, 'web', 'public', 'carteles', `${id}.mp4`),
    poster: (id) => join(RAIZ, 'web', 'public', 'carteles', `${id}.poster.jpg`)
  }
]

function copiar(origen, destino) {
  if (!existsSync(origen)) {
    throw new Error(`falta ${origen}: corré \`npm run render\` antes de publicar`)
  }
  mkdirSync(dirname(destino), { recursive: true })
  copyFileSync(origen, destino)
}

for (const clip of CLIPS) {
  for (const destino of DESTINOS) {
    copiar(join(AQUI, '..', 'out', `${clip.id}.mp4`), destino.video(clip.id))
    copiar(join(AQUI, '..', 'out', `${clip.id}.poster.jpg`), destino.poster(clip.id))
    console.log(`[carteles] ${clip.id} → ${destino.nombre}`)
  }
}
