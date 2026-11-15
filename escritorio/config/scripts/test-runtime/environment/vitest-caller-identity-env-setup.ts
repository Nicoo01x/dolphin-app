import { quitarIdentidadDeTerminal } from '../../../../src/shared/dolphin-env'

// Clear the launching terminal’s inherited Dolphin identity so test branches depend on fixture env, not which agent launched runner.
// Dolphin: la lista exacta de nombres vive en `quitarIdentidadDeTerminal` (pane, tab, hook, runtime y orquestación).
quitarIdentidadDeTerminal(process.env, ['DOLPHIN_'])
