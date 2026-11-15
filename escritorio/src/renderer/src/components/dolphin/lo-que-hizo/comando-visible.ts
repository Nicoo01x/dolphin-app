import { normalizeToolInput } from '../../../../../shared/native-chat/tools/native-chat-tool-summary'
import { nativeChatFullCommand } from '../../../../../shared/native-chat/tools/native-chat-tool-input-text'
import { posixShellWords } from '../../../../../shared/native-chat/tools/native-chat-tool-preview-prefix'

/**
 * Lo que la persona tiene que leer de un comando: el script que corrió, no el shell que lo lanzó.
 *
 * Codex en Windows manda cada comando como `"C:\\Users\\…\\pwsh.exe" -Command '…'` (o como el argv
 * con esas mismas partes). Mostrado tal cual, cada paso de la tarjeta decía «Corrió
 * "C:\\Users\\…\\pwsh.exe…»: ni se leía qué hizo, y salía la ruta de la casa de la persona.
 *
 * Sólo se desenvuelve la forma exacta de un lanzamiento (el programa y su `-Command`/`-c`); el
 * resto queda como lo dejó `nativeChatFullCommand`, que ya saca el `bash -lc '…'`.
 */

const POWERSHELL = /^(?:pwsh|powershell)(?:\.exe)?$/iu
const SHELL_POSIX = /^(?:ba|z|k|da|fi)?sh(?:\.exe)?$/iu
const BANDERA_DE_POWERSHELL = /^-(?:command|c)$/iu
const BANDERA_DE_SHELL = /^-[a-zA-Z]*c$/u
const OPCIONES_SIN_VALOR = /^-(?:nologo|noprofile|noninteractive|mta|sta)$/iu

function programa(ruta: string): string {
  return ruta.split(/[\\/]/u).at(-1) ?? ''
}

/** El script de un argv que lanza PowerShell o un shell POSIX; null si no es un lanzamiento. */
function scriptDelLanzamiento(partes: readonly string[]): string | null {
  const nombre = programa(partes[0] ?? '')
  if (POWERSHELL.test(nombre)) {
    let indice = 1
    while (indice < partes.length && OPCIONES_SIN_VALOR.test(partes[indice]!)) {
      indice += 1
    }
    return BANDERA_DE_POWERSHELL.test(partes[indice] ?? '')
      ? partes.slice(indice + 1).join(' ')
      : null
  }
  return SHELL_POSIX.test(nombre) && BANDERA_DE_SHELL.test(partes[1] ?? '') && partes[2]
    ? partes[2]
    : null
}

function argvDe(input: unknown): readonly string[] | null {
  const entrada = normalizeToolInput(input)
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return null
  }
  const campos = entrada as Record<string, unknown>
  const argv = Array.isArray(campos.command) ? campos.command : campos.cmd
  return Array.isArray(argv) && argv.every((parte) => typeof parte === 'string') ? argv : null
}

/** El comando como lo tiene que leer la persona; null si la llamada no trae ninguno. */
export function comandoVisible(input: unknown): string | null {
  const argv = argvDe(input)
  const delArgv = argv ? scriptDelLanzamiento(argv) : null
  if (delArgv?.trim()) {
    return delArgv.trim()
  }
  const comando = nativeChatFullCommand(input)
  if (!comando) {
    return null
  }
  const palabras = posixShellWords(comando)
  const delTexto = palabras ? scriptDelLanzamiento(palabras) : null
  return delTexto?.trim() ? delTexto.trim() : comando
}
