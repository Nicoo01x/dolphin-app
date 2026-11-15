import { Config } from '@remotion/cli/config'

// Un cartel se mira en una tarjeta de ~560 px de ancho y el mismo clip va a la web, así que se
// renderiza a 1280×800 (16:10, la proporción de la ventana de Dolphin) y se escala al mostrarlo.
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
// Sin audio: estos clips se miran en silencio, en loop, adentro de un cartel.
Config.setMuted(true)
