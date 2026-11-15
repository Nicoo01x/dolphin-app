import { getDolphinDiscordAppId } from '../../shared/dolphin-brand'
import { actividadDesde, type PresenciaDeDolphin } from '../../shared/discord-presencia'
import { PresenciaDeDiscord } from './discord-presence'

/**
 * El único lugar donde se prende la presencia de Discord, y el que decide si corre.
 *
 * Nace perezoso: sin `DOLPHIN_DISCORD_APP_ID` no se abre ningún socket ni se prueba ningún pipe,
 * así que en una instalación sin la aplicación de Discord configurada esto no hace absolutamente
 * nada. Y el primer socket se abre con la primera presencia, no al arrancar: una app que se abre
 * para mirar un diff no tiene por qué saludar a Discord.
 */

let presencia: PresenciaDeDiscord | null = null
let intentada = false

function registrar(mensaje: string, detalle?: unknown): void {
  // La presencia es decoración: su ruido no va al log normal.
  if (process.env.DOLPHIN_DISCORD_DEBUG) {
    console.warn(`[discord] ${mensaje}`, detalle ?? '')
  }
}

/** Publica lo que Dolphin está haciendo. Sin id de aplicación no hace nada, y no avisa dos veces. */
export function publicarPresenciaDeDiscord(estado: PresenciaDeDolphin): void {
  const idDeAplicacion = getDolphinDiscordAppId()
  if (!idDeAplicacion) {
    if (!intentada) {
      intentada = true
      registrar('sin DOLPHIN_DISCORD_APP_ID: la presencia queda apagada')
    }
    return
  }
  presencia ??= new PresenciaDeDiscord({ idDeAplicacion, registrar })
  presencia.actualizar(actividadDesde(estado))
}

/** Al cerrar la app: suelta el socket y los temporizadores. */
export function apagarPresenciaDeDiscord(): void {
  presencia?.cerrar()
  presencia = null
  intentada = false
}
