/**
 * Dolphin: cómo viaja la carpeta de skills propias (shared/dolphin-skills-source.ts) dentro de un
 * comando que se pega en una terminal. Una ruta ahí tiene tres enemigos: las barras invertidas, que
 * bash se come; los espacios, en cualquier terminal; y las comillas adentro del `cmd.exe /d /s /c "…"`
 * que la configuración pega en Windows, porque PowerShell parte el argumento en cada comilla y la
 * ruta le llegaba a skills como `" C:\…"`, con un espacio adelante, que ya no reconoce como local
 * (probado en PowerShell 5.1 y 7.4 el 23/10/2026).
 */

// `npx skills[@versión] add <fuente> …`, con la fuente sola o entre comillas dobles.
const SKILLS_ADD_COMMAND = /^(npx\s+skills(?:@[\w.-]+)?\s+add\s+)(?:"([^"]*)"|(\S+))(.*)$/s
const WINDOWS_DRIVE_PATH = /^([a-zA-Z]):[\\/](.*)$/s
const URL_SOURCE = /^[a-z][\w+.-]*:\/\//i
// Lo que una ruta puede llevar sin comillas en bash, PowerShell y cmd a la vez.
const BARE_PATH = /^[\w./:@+-]+$/
// Lo que cmd reinterpreta aunque vaya en un `cd`: una ruta con esto no se puede escribir sin comillas.
const CMD_UNSAFE = /[&|<>^%!"]/

type SkillsAddCommand = { head: string; source: string; quoted: boolean; tail: string }

export function parseSkillsAddCommand(command: string): SkillsAddCommand | null {
  const match = SKILLS_ADD_COMMAND.exec(command)
  if (!match) {
    return null
  }
  const quoted = match[2] !== undefined
  return { head: match[1], source: quoted ? match[2] : match[3], quoted, tail: match[4] }
}

/**
 * La fuente como va en el comando: una URL tal cual; una ruta de Windows con barras normales (skills
 * la reconoce igual y bash ya no se come las invertidas) y, si tiene espacios u otra cosa, entre
 * comillas dobles, que valen en bash, PowerShell y cmd.
 */
export function formatSkillsSourceForCommand(source: string): string {
  if (URL_SOURCE.test(source)) {
    return source
  }
  const path = WINDOWS_DRIVE_PATH.test(source) ? source.replace(/\\/g, '/') : source
  return BARE_PATH.test(path) ? path : `"${path}"`
}

/**
 * Lo que va después del `else` en el `cmd.exe /d /s /c "where.exe npx … & if errorlevel 1 (…) else …"`,
 * que no puede llevar comillas. Sin una fuente entre comillas, el comando entre paréntesis como
 * siempre. Con una ruta entre comillas se entra a la carpeta y se le pasa `.`: `cd /d` no corta en
 * los espacios y, fuera de un bloque, tampoco en el paréntesis de `Program Files (x86)`. Null cuando
 * la ruta tiene algo que cmd reinterpreta: el comando va sin envolver, que igual anda en las dos.
 */
export function buildWindowsCmdSkillBranch(command: string): string | null {
  const parsed = parseSkillsAddCommand(command)
  if (!parsed?.quoted) {
    return `(${command})`
  }
  const dir = parsed.source.replace(/\//g, '\\')
  if (CMD_UNSAFE.test(dir)) {
    return null
  }
  return `cd /d ${dir} && ${parsed.head}.${parsed.tail}`
}

/**
 * En WSL la carpeta de Windows se ve por `/mnt/<unidad>`, el montaje de siempre: la misma fuente,
 * escrita como la ve Linux. Sin esto skills tomaba `D:/…` por una ruta relativa a la terminal.
 */
export function skillsCommandForWsl(command: string): string {
  const parsed = parseSkillsAddCommand(command)
  const drive = parsed ? WINDOWS_DRIVE_PATH.exec(parsed.source) : null
  if (!parsed || !drive) {
    return command
  }
  const linuxPath = `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`
  return `${parsed.head}${formatSkillsSourceForCommand(linuxPath)}${parsed.tail}`
}
