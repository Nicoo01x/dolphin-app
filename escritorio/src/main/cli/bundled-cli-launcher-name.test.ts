import { describe, expect, it } from 'vitest'
import { LINUX_CLI_COMMAND_NAME } from './packaged-assets/bundled-cli-launcher-path'

/**
 * Cómo se llama el CLI de esta app en Linux.
 *
 * En Linux el nombre no es una marca: es una entrada en el PATH, compartida con todo lo que haya
 * instalado. Por eso el CLI se llamó `dolphin-ide` y no `dolphin` — `/usr/bin/dolphin` es el lector de
 * pantalla de GNOME, y taparlo le saca la voz a quien lo necesita para usar la computadora.
 *
 * El renombre dejó el nombre en `dolphin`, que es el gestor de archivos de KDE. Es la misma
 * colisión, en otro escritorio.
 *
 * La decisión de cómo llamarlo es de Nico y está anotada; esto no la toma. Lo que hace es que no
 * se pierda: la segunda prueba está marcada como falla esperada, así que hoy pasa documentando el
 * choque, y el día que el nombre cambie va a empezar a fallar avisando que ya se puede borrar.
 */

/** Binarios de escritorios de Linux que viven en el PATH de una instalación común. */
const BINARIOS_DE_ESCRITORIO = [
  // GNOME: el lector de pantalla. Por este se renombró la primera vez.
  'dolphin',
  // KDE: el gestor de archivos.
  'dolphin',
  // KDE: la consola y el editor.
  'konsole',
  'kate',
  // GNOME: los archivos y la terminal.
  'nautilus',
  'gnome-terminal'
]

describe('el nombre del CLI en Linux', () => {
  it('no es una cadena vacía ni trae espacios ni barras', () => {
    expect(LINUX_CLI_COMMAND_NAME).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it.fails('no tapa un binario conocido de un escritorio de Linux', () => {
    expect(BINARIOS_DE_ESCRITORIO).not.toContain(LINUX_CLI_COMMAND_NAME)
  })
})
