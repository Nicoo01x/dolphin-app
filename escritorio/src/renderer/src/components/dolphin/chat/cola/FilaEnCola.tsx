import { ArrowUp, ListEnd, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { QueuedMessageImageCount } from '@/components/native-chat/queue/NativeChatQueuedMessageImageCount'
import type { QueuedMessageDragPresentation } from '@/components/native-chat/queue/NativeChatQueuedMessageRows'
import type { QueuedMessageCard } from '../../../../../../shared/agent-session/view/structured-agent-session-queued-cards'

export type AccionDeFila = 'enviar' | 'borrar'

/**
 * Un mensaje esperando en la cola del chat sobre el CLI: su texto en una línea y, al final, las dos
 * acciones. «Enviar ahora» es la principal (un tono de superficie); «Borrar» queda en tinta baja.
 *
 * Why el arrastre no choca con los botones: el arrastre sólo nace del asa (`drag.grip`, el sensor
 * de dnd-kit está en ese botón), así que tocar un botón nunca arrastra y arrastrar nunca es un clic.
 */
export function FilaEnCola({
  card,
  drag,
  saliendo = false,
  trabajando,
  onEnviarAhora,
  onBorrar
}: {
  card: QueuedMessageCard
  drag?: QueuedMessageDragPresentation
  /** Recién borrada: se cierra en su lugar y las de abajo suben sin salto. */
  saliendo?: boolean
  trabajando: boolean
  onEnviarAhora: () => void
  onBorrar: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const enviarAhora = t('components.dolphin.chat.cola.enviarAhora', 'Send now')
  const pistaDeEnviar = trabajando
    ? t(
        'components.dolphin.chat.cola.enviarAhoraTrabajando',
        'The agent gets it now, without waiting for this turn to end'
      )
    : t('components.dolphin.chat.cola.enviarAhoraQuieto', 'Send it to the agent now')
  const borrar = t('components.dolphin.chat.cola.borrar', 'Remove from queue')
  return (
    <li
      ref={drag?.rowRef}
      style={drag?.rowStyle}
      data-cola-del-chat-id={card.messageId}
      aria-hidden={saliendo || undefined}
      className="group/queued relative"
    >
      {drag?.insertion ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-primary',
            drag.insertion === 'before' ? 'top-0' : 'bottom-0'
          )}
        />
      ) : null}
      {/* El cierre va adentro: el estilo en línea del arrastre pisa la transición del <li>. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none',
          saliendo ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex h-[30px] items-center gap-1.5 rounded-md pr-0.5 pl-1 transition-colors group-focus-within/queued:bg-accent group-hover/queued:bg-accent motion-reduce:transition-none">
            <span className="relative flex size-5 shrink-0 items-center justify-center text-muted-foreground">
              <ListEnd
                aria-hidden
                className={cn(
                  'size-3.5',
                  drag?.grip &&
                    'group-focus-within/queued:opacity-0 group-hover/queued:opacity-0 [@media(hover:none)]:opacity-0'
                )}
              />
              {drag?.grip}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] leading-[18px]" title={card.text}>
              {card.text}
            </p>
            {card.images ? <QueuedMessageImageCount images={card.images} /> : null}
            <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-focus-within/queued:opacity-100 group-hover/queued:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    aria-label={enviarAhora}
                    data-accion="enviar"
                    disabled={saliendo}
                    onClick={onEnviarAhora}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  <span className="flex flex-col">
                    <span>{enviarAhora}</span>
                    <span className="opacity-70">{pistaDeEnviar}</span>
                  </span>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={borrar}
                    data-accion="borrar"
                    disabled={saliendo}
                    onClick={onBorrar}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {borrar}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
