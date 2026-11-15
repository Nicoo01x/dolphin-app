import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { isFloatingWorkspaceId } from '../../../../shared/floating-workspace-worktree'

/**
 * Si un panel —una terminal, o un chat, que es una terminal vista como chat— se puede sacar a la
 * ventana flotante.
 *
 * Es el gemelo de `editorDesacoplable` para el otro tipo de panel, y la diferencia que importa es
 * que acá se mueve un PTY vivo y no un archivo: no se puede «volver a abrirlo del otro lado», hay
 * que llevarse el proceso. Por eso el único motivo real es de dónde cuelga ese proceso.
 *
 * El movimiento en sí lo hace el camino que ya mueve un panel a otra pestaña
 * (`detachTerminalPaneToTab` → `planTerminalLeafMove`, una sola escritura durable) con el workspace
 * destino puesto. El `viewMode: 'chat'` viaja solo: la pestaña nueva nace como chat cuando el
 * layout movido tiene su `chatLeafId`, así que una conversación no llega convertida en terminal.
 */
export type MotivoNoSeDesacopla = 'ya-flotante' | 'de-otra-maquina'

/**
 * El motivo se devuelve en vez de un booleano para poder decirlo: un panel que no se puede mover
 * tiene que explicar por qué, no desaparecer en silencio cuando lo sueltan.
 */
export function paneDesacoplable(args: {
  /** El workspace del que sale el panel. */
  readonly worktreeId: string
  /** El anfitrión donde corre ese workspace; `null` o ausente es esta máquina. */
  readonly hostId?: string | null
}): true | MotivoNoSeDesacopla {
  if (isFloatingWorkspaceId(args.worktreeId)) {
    return 'ya-flotante'
  }
  // El workspace flotante vive en esta máquina (`suppressActiveRuntimeFallback`), así que un PTY
  // que corre en un host SSH o dentro de un entorno de runtime no se puede re-domiciliar acá: su
  // proceso no está de este lado, y la pestaña nueva quedaría mostrando una terminal muerta.
  if (args.hostId != null && args.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return 'de-otra-maquina'
  }
  return true
}

/**
 * Si un panel soltado en la tira de la ventana flotante puede cruzar, y cuando no, lo dice.
 *
 * Why avisa acá y no en silencio: el drop se consume igual —el panel vuelve a su lugar—, y soltar
 * algo y que no pase nada, sin una palabra, se lee como que la app se colgó.
 */
export function puedeCruzarALaFlotante(args: {
  readonly worktreeId: string
  readonly hostId?: string | null
}): boolean {
  const sePuede = paneDesacoplable(args)
  if (sePuede === true) {
    return true
  }
  toast.error(
    sePuede === 'de-otra-maquina'
      ? translate(
          'terminal.paneMove.otraMaquina',
          'The floating window runs on this machine, and this terminal lives on another.'
        )
      : translate('terminal.paneMove.failed', "Couldn't move the pane to a new tab.")
  )
  return false
}
