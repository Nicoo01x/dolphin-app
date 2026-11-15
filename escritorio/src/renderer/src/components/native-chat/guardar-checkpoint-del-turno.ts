import { useAppStore } from '../../store'
import { selectWorktreeById } from '@/store/workspaces/catalog/workspace-record-fields'
import { createNativeChatTabOwnerSelector } from './pane/ownership/native-chat-tab-owner'
import { recordarCheckpointDeTurno } from './checkpoints-del-chat'

/**
 * Guarda el código antes de mandarle un turno al agente.
 *
 * Es lo que hace que «deshacer» exista: cuando el agente toca veinte archivos y la cuarta vuelta
 * deja todo peor que la primera, la salida hoy es leer el diff entero o perder lo bueno con lo
 * malo. Un checkpoint por turno lo vuelve un botón.
 *
 * Reglas:
 *  - **No hace esperar al envío.** Se dispara y no se espera: el agente arranca igual. Si el
 *    checkpoint tarda o falla, lo único que se pierde es poder volver a ESE turno.
 *  - **Falla en silencio.** Un worktree que no es repo git, un HEAD que no existe todavía, git
 *    ocupado: nada de eso puede impedir que la persona le hable al agente.
 *  - **Solo en un turno de verdad.** Un comando con barra no cambia código, así que no merece un
 *    checkpoint; quien llama decide con su clasificación.
 */
export function guardarCheckpointDelTurno(args: {
  readonly tabId: string
  readonly pedido: string
}): void {
  const { tabId, pedido } = args
  if (pedido.trim() === '') {
    return
  }
  const puente = window.api?.checkpoints
  // Si el preload es viejo la llamada tira acá adentro, sincrónicamente, y el `.catch()` no la
  // agarra. Ya pasó con `getCartelAssetBaseUrl`.
  if (typeof puente?.crear !== 'function') {
    return
  }
  // El proyecto se resuelve acá y no viaja como prop: el selector del dueño de la pestaña es puro,
  // así que alcanza una instantánea del store. Pasarlo como prop obligaba a tocar el compositor,
  // que ya está en su techo de líneas.
  const estado = useAppStore.getState()
  const worktreeId = createNativeChatTabOwnerSelector(tabId)(estado)
  if (!worktreeId) {
    return
  }
  const worktree = selectWorktreeById(estado, worktreeId)
  const carpeta = worktree?.path
  if (!carpeta) {
    return
  }
  void puente
    .crear(carpeta, 'antes del turno')
    .then((checkpoint) => {
      if (checkpoint) {
        recordarCheckpointDeTurno(tabId, checkpoint, pedido)
      }
    })
    .catch(() => {
      // Un checkpoint que no se pudo guardar no es un error de la persona: no se le avisa nada.
    })
}
