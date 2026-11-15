import { detectMonacoFilenameLanguage } from './editor-language/monaco-filename-language'

/**
 * Qué cuenta Dolphin de sí mismo en Discord.
 *
 * Es su propia presencia, no la de DOLPHIN ni la del emulador: el nombre y el ícono los da la
 * aplicación de Discord que apunta `DOLPHIN_DISCORD_APP_ID`, y esto decide las dos líneas de abajo
 * —en qué proyecto y con qué lenguaje—.
 *
 * Módulo compartido y puro a propósito: lo arma el renderer, que es el único que sabe qué archivo
 * está abierto, y el proceso principal solo lo manda. Así lo que se muestra se puede probar sin un
 * socket y sin Discord instalado.
 */

export type PresenciaDeDolphin = {
  /** El proyecto donde se está trabajando, tal como lo nombra la app. */
  proyecto: string | null
  /** El archivo abierto, con su nombre nada más: la ruta completa es de la máquina de uno. */
  archivo: string | null
  /** Desde cuándo está abierta la sesión, en milisegundos. Discord dibuja el reloj. */
  desde: number
}

/** Lo que el IPC de Discord acepta en `SET_ACTIVITY`. */
export type ActividadDeDiscord = {
  details?: string
  state?: string
  timestamps?: { start: number }
}

/**
 * Discord rechaza la actividad entera si un campo pasa los 128 caracteres, y también si tiene
 * menos de 2: una línea de un solo carácter tira el `SET_ACTIVITY` completo, no se recorta sola.
 */
const MAXIMO = 128
const MINIMO = 2

function recortar(texto: string): string | undefined {
  const limpio = texto.trim()
  if (limpio.length < MINIMO) {
    return undefined
  }
  return limpio.length > MAXIMO ? `${limpio.slice(0, MAXIMO - 1)}…` : limpio
}

/**
 * El nombre del lenguaje como lo lee una persona.
 *
 * El detector devuelve el id de Monaco (`typescriptreact`, `cpp`, `shellscript`), que sirve para
 * pintar un editor y no para leerlo en un perfil. Lo que no está en la tabla se muestra con la
 * primera en mayúscula, que para la mayoría ya alcanza (`rust` → `Rust`).
 */
const NOMBRE_DEL_LENGUAJE: Record<string, string> = {
  typescript: 'TypeScript',
  typescriptreact: 'TypeScript',
  javascript: 'JavaScript',
  javascriptreact: 'JavaScript',
  python: 'Python',
  cpp: 'C++',
  csharp: 'C#',
  objectivec: 'Objective-C',
  shellscript: 'Shell',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  yaml: 'YAML',
  json: 'JSON',
  jsonc: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  xml: 'XML',
  markdown: 'Markdown',
  mdx: 'MDX',
  php: 'PHP',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  dart: 'Dart',
  lua: 'Lua',
  r: 'R',
  toml: 'TOML',
  ini: 'INI',
  graphql: 'GraphQL',
  vue: 'Vue',
  svelte: 'Svelte'
}

/** El lenguaje del archivo abierto, listo para leer. Null si no hay archivo o no se reconoce. */
export function lenguajeDe(archivo: string | null): string | null {
  if (!archivo) {
    return null
  }
  const id = detectMonacoFilenameLanguage(archivo)
  if (!id || id === 'plaintext') {
    return null
  }
  return NOMBRE_DEL_LENGUAJE[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1)}`
}

/** Solo el nombre: la ruta de un archivo dice dónde vive la persona y con qué se gana la vida. */
export function nombreDelArchivo(ruta: string | null): string | null {
  if (!ruta) {
    return null
  }
  const partes = ruta.split(/[\\/]/).filter(Boolean)
  return partes.at(-1) ?? null
}

/**
 * Las dos líneas que Discord muestra debajo del nombre de la app.
 *
 * Arriba el proyecto, abajo el lenguaje con el archivo. Si no se sabe algo, no se inventa: se
 * omite el campo, porque «Proyecto desconocido» ocupa el mismo lugar y no dice nada.
 */
export function actividadDesde(presencia: PresenciaDeDolphin): ActividadDeDiscord {
  const lenguaje = lenguajeDe(presencia.archivo)
  const archivo = nombreDelArchivo(presencia.archivo)
  const detalle = presencia.proyecto ? recortar(presencia.proyecto) : undefined
  const abajo =
    lenguaje && archivo ? `${lenguaje} · ${archivo}` : (lenguaje ?? archivo ?? undefined)
  return {
    ...(detalle ? { details: detalle } : {}),
    ...(abajo ? { state: recortar(abajo) } : {}),
    timestamps: { start: presencia.desde }
  }
}

/** Dos presencias que se ven igual no se mandan dos veces: Discord limita cuántas acepta. */
export function mismaActividad(a: ActividadDeDiscord, b: ActividadDeDiscord): boolean {
  return (
    a.details === b.details && a.state === b.state && a.timestamps?.start === b.timestamps?.start
  )
}
