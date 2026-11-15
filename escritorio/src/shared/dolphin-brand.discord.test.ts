import { describe, expect, it } from 'vitest'
import {
  DOLPHIN_DISCORD_APP_ID,
  DOLPHIN_DISCORD_URL,
  DOLPHIN_X_URL,
  getDolphinDiscordAppId
} from './dolphin-brand'

/**
 * El panel de marca: lo que es null no se ofrece. Estas tres nacieron de encontrar el invite de
 * Discord de DOLPHIN y su cuenta de X escritos a mano en el diálogo de comentarios.
 */
describe('la marca de Dolphin', () => {
  it('no ofrece la comunidad de otro producto', () => {
    expect(DOLPHIN_DISCORD_URL).toBeNull()
    expect(DOLPHIN_X_URL).toBeNull()
  })

  it('sin id de aplicación la presencia de Discord queda apagada', () => {
    expect(DOLPHIN_DISCORD_APP_ID).toBeNull()
    expect(getDolphinDiscordAppId({})).toBeNull()
  })

  // La variable de entorno gana para poder probar sin recompilar.
  it('la variable de entorno pisa la constante', () => {
    expect(getDolphinDiscordAppId({ DOLPHIN_DISCORD_APP_ID: '123456789012345678' })).toBe(
      '123456789012345678'
    )
  })

  /**
   * Un id que no es un id haría que el cliente abriera diez pipes y saludara con basura en cada
   * reintento. Un snowflake de Discord son solo dígitos.
   */
  it('un id que no es un id no prende nada', () => {
    expect(getDolphinDiscordAppId({ DOLPHIN_DISCORD_APP_ID: 'poneloaca' })).toBeNull()
    expect(getDolphinDiscordAppId({ DOLPHIN_DISCORD_APP_ID: '123' })).toBeNull()
    expect(getDolphinDiscordAppId({ DOLPHIN_DISCORD_APP_ID: '  ' })).toBeNull()
  })

  it('un id con espacios alrededor se acepta limpio', () => {
    expect(getDolphinDiscordAppId({ DOLPHIN_DISCORD_APP_ID: ' 123456789012345678 ' })).toBe(
      '123456789012345678'
    )
  })
})
