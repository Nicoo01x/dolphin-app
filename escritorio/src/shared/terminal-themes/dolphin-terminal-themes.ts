import type { TerminalThemeMap } from './types'

/**
 * Los temas de terminal de Dolphin: el fondo es el lienzo de la piel (#101010 / #fcfcfc), así la
 * terminal no queda como un rectángulo azulado al lado del resto de la app (el de la base,
 * «Ghostty Default Style Dark», es #282c34).
 *
 * El cursor y el texto van en la tinta de la piel. Los ocho colores ANSI están desaturados para que
 * el color sea de lo que imprime el programa y no del chrome, pero cada uno llega a AA (4,5:1)
 * sobre su fondo: un rojo de error o un verde de diff se tienen que poder leer. En claro, `white`
 * y `brightWhite` son grises oscuros por lo mismo que en el Tango de la base: hay CLIs que los usan
 * para texto.
 *
 * Viven en un archivo propio y no en `defaults.ts` de la base para que una puesta al día no choque.
 */
export const TEMA_DE_TERMINAL_DOLPHIN_OSCURO = 'Dolphin Dark'
export const TEMA_DE_TERMINAL_DOLPHIN_CLARO = 'Dolphin Light'

export const DOLPHIN_TERMINAL_THEMES: TerminalThemeMap = {
  [TEMA_DE_TERMINAL_DOLPHIN_OSCURO]: {
    background: '#101010',
    foreground: '#f0f0f0',
    cursor: '#f0f0f0',
    cursorAccent: '#101010',
    // Gris neutro y no un velo: tiene que distinguirse de los bloques grises que pintan los agentes.
    selectionBackground: '#4a4a4a',
    selectionForeground: '#ffffff',
    black: '#2a2a2a',
    red: '#e07a7a',
    green: '#9cc49a',
    yellow: '#d9c48c',
    blue: '#8fa9c9',
    magenta: '#c19ac4',
    cyan: '#8fc2c0',
    white: '#c8c8c8',
    brightBlack: '#808080',
    brightRed: '#f09a9a',
    brightGreen: '#b4d8b1',
    brightYellow: '#ece0ad',
    brightBlue: '#aac2e0',
    brightMagenta: '#d8b6da',
    brightCyan: '#aad9d6',
    brightWhite: '#f0f0f0'
  },

  [TEMA_DE_TERMINAL_DOLPHIN_CLARO]: {
    background: '#fcfcfc',
    foreground: '#181818',
    cursor: '#181818',
    cursorAccent: '#fcfcfc',
    selectionBackground: '#d6d6d6',
    selectionForeground: '#181818',
    black: '#181818',
    red: '#a33a3a',
    green: '#3d6b3a',
    yellow: '#7a6420',
    blue: '#3b5a85',
    magenta: '#7a4a7e',
    cyan: '#2f6b69',
    white: '#636363',
    brightBlack: '#6e6e6e',
    brightRed: '#8a2c2c',
    brightGreen: '#2f5a2c',
    brightYellow: '#5e4c14',
    brightBlue: '#2c4770',
    brightMagenta: '#633a67',
    brightCyan: '#23524f',
    brightWhite: '#3d3d3d'
  }
}
