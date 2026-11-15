/**
 * Demo animations live under the docs zone as MP4 + JPG poster.
 *
 * A screen recording also keeps its GIF, and is named by it. A clip made with Remotion
 * (branding/videos/carteles) never had one, so it is named by its MP4 — the extension is a key
 * here, not a file to load: both names below are derived from it.
 */
const DOCS_MEDIA_ROOT = '/docs'
const CLIP_EXTENSION = /\.(gif|mp4)$/

export function posterFor(src) {
  const name = src.split('/').pop().replace(CLIP_EXTENSION, '.jpg')
  return `${DOCS_MEDIA_ROOT}/posters/${name}`
}

export function videoFor(src) {
  const name = src.split('/').pop().replace(CLIP_EXTENSION, '.mp4')
  return `${DOCS_MEDIA_ROOT}/videos/${name}`
}

/** True for a src that names a clip (and so gets the poster-then-video treatment). */
export function isClip(src) {
  return CLIP_EXTENSION.test(src)
}
