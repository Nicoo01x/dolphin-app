import { useState } from 'react'
import { History, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { selectWorktreeById } from '@/store/workspaces/catalog/workspace-record-fields'
import { createNativeChatTabOwnerSelector } from './pane/ownership/native-chat-tab-owner'
import { useCheckpointsDelChat, type CheckpointDeTurno } from './checkpoints-del-chat'

/**
 * Los checkpoints del chat: volver el código a como estaba antes de un pedido.
 *
 * Por qué acá, al lado del compositor, y no una fila en cada turno de la conversación: la lista de
 * mensajes tiene ventana —monta y desmonta filas al scrollear—, así que un control por turno
 * aparece y desaparece justo cuando se lo busca. Esto queda quieto y dice cuántos hay.
 *
 * Restaurar deja un «deshacer» en el aviso, y no por cortesía: el motor guarda el estado anterior
 * antes de escribir un archivo, así que la vuelta atrás existe de verdad y sería una lástima no
 * ofrecerla.
 */

function hace(cuando: number, ahora = Date.now()): string {
  const minutos = Math.floor((ahora - cuando) / 60_000)
  if (minutos < 1) {
    return translate('components.native-chat.checkpoints.ahora', 'just now')
  }
  if (minutos < 60) {
    return translate('components.native-chat.checkpoints.minutos', '{{value0}} min ago', {
      value0: String(minutos)
    })
  }
  return translate('components.native-chat.checkpoints.horas', '{{value0}} h ago', {
    value0: String(Math.floor(minutos / 60))
  })
}

function carpetaDeLaPestana(tabId: string): string | null {
  const estado = useAppStore.getState()
  const worktreeId = createNativeChatTabOwnerSelector(tabId)(estado)
  if (!worktreeId) {
    return null
  }
  return selectWorktreeById(estado, worktreeId)?.path ?? null
}

async function restaurar(tabId: string, checkpoint: CheckpointDeTurno): Promise<void> {
  const puente = window.api?.checkpoints
  const carpeta = carpetaDeLaPestana(tabId)
  if (typeof puente?.restaurar !== 'function' || !carpeta) {
    toast.error(
      translate(
        'components.native-chat.checkpoints.sinProyecto',
        'Could not find this chat’s workspace.'
      )
    )
    return
  }
  try {
    const resultado = await puente.restaurar(carpeta, checkpoint.sha)
    toast.success(
      translate('components.native-chat.checkpoints.restaurado', 'Code restored to that point'),
      {
        description: translate(
          'components.native-chat.checkpoints.restauradoDetalle',
          '{{value0}} files written, {{value1}} removed.',
          {
            value0: String(resultado.archivosEscritos),
            value1: String(resultado.archivosBorrados.length)
          }
        ),
        action: {
          label: translate('components.native-chat.checkpoints.deshacer', 'Undo'),
          onClick: () => {
            void puente
              .restaurar(carpeta, resultado.deshacer.sha)
              .then(() =>
                toast.success(
                  translate('components.native-chat.checkpoints.deshecho', 'Restore undone')
                )
              )
              .catch(() =>
                toast.error(
                  translate(
                    'components.native-chat.checkpoints.deshacerFallo',
                    'Could not undo the restore.'
                  )
                )
              )
          }
        }
      }
    )
  } catch {
    toast.error(
      translate('components.native-chat.checkpoints.fallo', 'Could not restore that checkpoint.')
    )
  }
}

export function CheckpointsDelChat({
  tabId
}: {
  readonly tabId: string
}): React.JSX.Element | null {
  const checkpoints = useCheckpointsDelChat(tabId)
  const [abierto, setAbierto] = useState(false)

  // Sin un solo turno guardado no hay nada que ofrecer, y un botón vacío es una promesa incumplida.
  if (checkpoints.length === 0) {
    return null
  }

  return (
    <DropdownMenu open={abierto} onOpenChange={setAbierto}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="gap-1"
          title={translate(
            'components.native-chat.checkpoints.ayuda',
            'Go back to the code as it was before a request'
          )}
        >
          <History className="size-3" />
          {String(checkpoints.length)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="scrollbar-sleek max-h-80 w-80 overflow-y-auto">
        {checkpoints.map((checkpoint) => (
          <DropdownMenuItem
            key={checkpoint.sha}
            className="flex flex-col items-start gap-0.5"
            onSelect={() => {
              void restaurar(tabId, checkpoint)
            }}
          >
            <span className="flex w-full items-center gap-1.5 text-2xs text-muted-foreground">
              <Undo2 className="size-2.5" aria-hidden="true" />
              {hace(checkpoint.cuando)}
            </span>
            <span className="w-full truncate text-xs">{checkpoint.pedido}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
