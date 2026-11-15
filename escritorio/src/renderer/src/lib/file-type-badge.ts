/**
 * La ficha de un archivo: su extensión y el color de su lenguaje.
 *
 * Los íconos de Lucide que había dicen «esto es un archivo» y poco más: en una lista de
 * veinte, un `.ts` y un `.png` se ven casi igual. Lo que deja leer una lista de un vistazo es
 * el color del lenguaje con su extensión encima, que es lo que hacen los editores.
 *
 * La etiqueta es la extensión de verdad y no un nombre inventado («JAVA» no entra en una ficha
 * de 16 px y «JV» no lo lee nadie): así cualquier extensión, conocida o no, tiene ficha, y la
 * tabla sólo decide el color.
 *
 * Los colores son los de linguist, que es el mismo juego que usa GitHub: el azul de
 * TypeScript, el amarillo de JavaScript, el celeste de Go. Un archivo sin color conocido sale
 * gris, y eso también informa.
 */
export type FileTypeBadge = {
  /** Hasta cuatro caracteres: lo que se dibuja adentro de la ficha. */
  label: string
  color: string
  /** Para los colores claros, donde el texto blanco no se lee. */
  darkText: boolean
}

/** Colores de linguist. Un color de más acá no es una decisión de diseño: es una marca. */
const COLOR_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: '#3178C6',
  mts: '#3178C6',
  cts: '#3178C6',
  tsx: '#3178C6',
  js: '#F7DF1E',
  mjs: '#F7DF1E',
  cjs: '#F7DF1E',
  jsx: '#F7DF1E',
  json: '#CBCB41',
  jsonc: '#CBCB41',
  md: '#083FA1',
  mdx: '#083FA1',
  css: '#563D7C',
  scss: '#C6538C',
  sass: '#C6538C',
  less: '#1D365D',
  html: '#E34C26',
  htm: '#E34C26',
  py: '#3572A5',
  pyi: '#3572A5',
  rs: '#DEA584',
  go: '#00ADD8',
  java: '#B07219',
  kt: '#A97BFF',
  kts: '#A97BFF',
  swift: '#F05138',
  rb: '#701516',
  php: '#4F5D95',
  c: '#555555',
  h: '#555555',
  cpp: '#F34B7D',
  cc: '#F34B7D',
  hpp: '#F34B7D',
  cs: '#178600',
  sh: '#89E051',
  bash: '#89E051',
  zsh: '#89E051',
  fish: '#89E051',
  ps1: '#012456',
  yml: '#CB171E',
  yaml: '#CB171E',
  toml: '#9C4221',
  ini: '#9C4221',
  sql: '#E38C00',
  vue: '#41B883',
  svelte: '#FF3E00',
  astro: '#FF5A03',
  lua: '#000080',
  dart: '#00B4AB',
  zig: '#EC915C',
  ex: '#6E4A7E',
  exs: '#6E4A7E',
  erl: '#B83998',
  hs: '#5E5086',
  scala: '#C22D40',
  clj: '#DB5855',
  r: '#198CE7',
  pl: '#0298C3',
  ipynb: '#DA5B0B',
  tf: '#844FBA',
  proto: '#C9D1D9',
  graphql: '#E10098',
  gql: '#E10098',
  svg: '#FFB13B',
  png: '#A074C4',
  jpg: '#A074C4',
  jpeg: '#A074C4',
  gif: '#A074C4',
  webp: '#A074C4',
  avif: '#A074C4',
  ico: '#A074C4',
  mp4: '#8E5EA2',
  webm: '#8E5EA2',
  mp3: '#8E5EA2',
  wav: '#8E5EA2',
  pdf: '#B30B00',
  zip: '#6E7681',
  tgz: '#6E7681',
  gz: '#6E7681',
  tar: '#6E7681',
  lock: '#6E7681',
  env: '#D9A441',
  gitignore: '#6E7681',
  dockerfile: '#2496ED',
  makefile: '#427819'
}

/** Nombres que no tienen extensión y sí identidad. */
const BADGE_BY_FILENAME: Readonly<Record<string, string>> = {
  dockerfile: 'dock',
  makefile: 'make',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.npmrc': 'npm',
  '.nvmrc': 'node',
  'package.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'cargo.toml': 'rs',
  'cargo.lock': 'rs',
  'go.mod': 'go',
  'go.sum': 'go'
}

/** Los colores claros donde el blanco encima no se lee. */
const DARK_TEXT_COLORS = new Set(['#F7DF1E', '#CBCB41', '#89E051', '#FFB13B', '#C9D1D9'])

const DEFAULT_COLOR = '#6E7681'

function filenameOf(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return (lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath).toLowerCase()
}

function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return ''
  }
  return filename.slice(lastDot + 1)
}

export function getFileTypeBadge(filePath: string | undefined | null): FileTypeBadge | null {
  if (!filePath) {
    return null
  }
  const filename = filenameOf(filePath)
  if (!filename) {
    return null
  }
  const byName = BADGE_BY_FILENAME[filename]
  if (byName) {
    const color = COLOR_BY_EXTENSION[byName] ?? COLOR_BY_EXTENSION[filename] ?? DEFAULT_COLOR
    return { label: byName, color, darkText: DARK_TEXT_COLORS.has(color) }
  }
  // A dotfile with no other dot is its own name: `.env` reads as `env`, not as a file called
  // nothing with an `env` extension.
  const extension = filename.startsWith('.')
    ? extensionOf(filename.slice(1)) || filename.slice(1)
    : extensionOf(filename)
  if (!extension) {
    return null
  }
  const color = COLOR_BY_EXTENSION[extension] ?? DEFAULT_COLOR
  return {
    // Four characters is what fits legibly at 16px; `.gitignore` is already handled by name.
    label: extension.length > 4 ? extension.slice(0, 4) : extension,
    color,
    darkText: DARK_TEXT_COLORS.has(color)
  }
}
