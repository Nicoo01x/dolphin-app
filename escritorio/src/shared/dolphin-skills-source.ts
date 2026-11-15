/**
 * Las skills propias de Dolphin (orquestación, CLI, computer use…) se instalan desde la carpeta que
 * viaja con la app, no desde el repo de Dolphin (Nico, 23/10: «que no venga de dolphin, que sea nuestro por
 * completo»). Hasta acá se bajaban del repo de la base en `tree/<commit>`, y con el commit de
 * Dolphin, que allá no existe, la instalación fallaba.
 *
 * El proceso principal sabe dónde está la carpeta (en desarrollo, `skills/` del repo; empaquetada,
 * `dolphin-skills/` en los recursos) y se la pasa a la ventana como argumento, el mismo camino que el
 * id del host del navegador: la ventana lo tiene desde que nace, sin IPC sincrónico.
 *
 * Desde el merge de la base del 11/11 la instalación normal sale del paquete embebido en el build
 * (main/skills/bundled-skill-install/); esta carpeta sólo la usa el comando `npx skills add` que
 * sigue vivo para WSL (COMPAT(wsl-bridge)), que si no apuntaría a un commit de Dolphin en el repo de la base.
 */

const PREFIX = '--dolphin-skills-dir='

export function formatDolphinSkillsDirArgument(dir: string): string {
  return `${PREFIX}${dir}`
}

/** Null para cualquier proceso al que main no le pasó la carpeta (el cliente web, un invitado). */
export function readDolphinSkillsDirArgument(argv: readonly string[]): string | null {
  for (const argument of argv) {
    if (argument.startsWith(PREFIX)) {
      return argument.slice(PREFIX.length) || null
    }
  }
  return null
}
