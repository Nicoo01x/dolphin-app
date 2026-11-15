/**
 * El canal por el que el renderer avisa si el foco está en el editor de código (Monaco).
 *
 * Va solo en su archivo porque lo importa el preload, y el preload no tiene que arrastrar las
 * definiciones de atajos para conocer un nombre de canal.
 */
export const CANAL_FOCO_DEL_EDITOR_DE_CODIGO = 'dolphin:editorDeCodigoEnfocado'
