import { Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/**
 * Intelligent Orchestration: el interruptor de si Dolphin reparte el trabajo solo.
 *
 * Prendido, cuando el líder termina un plan que se puede partir, cada parte abre su propio
 * compañero con su modelo y su terminal. Apagado no pasa absolutamente nada: no se abre nada y no
 * aparece ninguna ventana preguntando. Eso último es el cambio del 09/11/2026 (Nico: «me saltan
 * modelos y no sé qué, pero no tiene que ser así») — hasta ese día el interruptor sólo decidía si
 * delegaba sola, y la ventana con la propuesta saltaba igual con el interruptor apagado, que es
 * exactamente lo que alguien que lo apagó pidió que no pasara.
 *
 * Why el nombre se ve y no es sólo un icono: un interruptor que no dice qué prende obliga a
 * descubrirlo apretándolo, y lo que prende acá abre sesiones de agente que cuestan plata.
 *
 * Es el mismo ajuste global que la fila de Ajustes › Experimental: prenderlo acá lo deja prendido
 * en todos los chats, y la fila se mueve con él.
 */
export function IntelligentOrchestration(): React.JSX.Element {
  const prendida = useAppStore((state) => state.settings?.autoDelegation === true)
  const guardar = useAppStore((state) => state.updateSettingsOrThrow)
  // Why el nombre corto en la pastilla: medido en la app (10/11/2026), la fila del compositor mide
  // 720 px y sus controles ya los ocupan todos. Con «Orquestación inteligente» algo se cortaba
  // siempre: o este nombre («Orquestación int…») o el selector de permisos («Ac…»). No había
  // reparto de encogimiento que lo arreglara porque no sobraba lugar. El nombre completo sigue en
  // el tooltip y en la etiqueta accesible, que además explican qué hace.
  const nombre = translate('components.dolphin.chat.orquestacion.nombreCorto', 'Orchestration')
  const etiqueta = prendida
    ? translate(
        'components.dolphin.chat.orquestacion.prendida',
        'Intelligent Orchestration is on: the plan opens one teammate per part, each with its own model'
      )
    : translate(
        'components.dolphin.chat.orquestacion.apagada',
        'Intelligent Orchestration is off: nothing is delegated and nothing pops up'
      )

  return (
    <Button
      type="button"
      // Why una variante y no una clase de color: <Button> maneja su propio color, y pintarlo
      // desde afuera lo saca del sistema (lo corta `oxlint-design-system`). Prendido se ve como un
      // control activo —relleno— y apagado como el resto de los controles de la barra.
      variant={prendida ? 'secondary' : 'ghost'}
      size="xs"
      // Si aun así la fila se angosta, cede al mismo ritmo que el selector de permisos: darle
      // prioridad a esta pastilla dejaba al selector en «Ac…», que es peor.
      className="min-w-0 shrink"
      aria-label={etiqueta}
      aria-pressed={prendida}
      title={etiqueta}
      onClick={() => {
        // Why el catch y no un `void`: guardar un ajuste pasa por el proceso principal y puede
        // fallar. Sin esto el interruptor se vería cambiado —el store ya se dibujó— y volvería
        // solo al rato, que es la peor forma de decir que no se guardó.
        void guardar({ autoDelegation: !prendida }).catch(() => {
          toast.error(
            translate(
              'components.dolphin.chat.orquestacion.noSeGuardo',
              'Could not save Intelligent Orchestration.'
            )
          )
        })
      }}
    >
      <Workflow aria-hidden="true" />
      {/* Why el nombre siempre visible: vive en la fila del compositor, que no es un
          `@container` (el que lo escondía era la barra de arriba). Esconderlo sin ancestro que
          mida lo dejaba oculto para siempre, y un interruptor sin nombre obliga a apretarlo para
          descubrir qué prende. Si la fila se angosta, el nombre se trunca y el estado queda. */}
      <span className="min-w-0 truncate">{nombre}</span>
      <span className={prendida ? 'font-semibold' : 'text-muted-foreground'}>
        {prendida
          ? translate('components.dolphin.chat.orquestacion.on', 'On')
          : translate('components.dolphin.chat.orquestacion.off', 'Off')}
      </span>
    </Button>
  )
}
