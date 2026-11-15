import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { ColaDelChat } from './ColaDelChat'
import type { MensajeEnCola, MotivoDePausa } from './cola-del-chat-modelo'
import { cambiarCola, claveDeCola } from './cola-del-chat-store'

/**
 * La cola del chat sobre el CLI en sus estados, sin la app:
 * `pnpm fixtures:shot "dolphin/chat/cola/ColaDelChat:*" --theme both`.
 */
const mensaje = (id: string, texto: string, imagenes: string[] = []): MensajeEnCola => ({
  id,
  texto,
  imagenes,
  encoladoEn: 0
})

const LARGO =
  'Cuando termines con los tests del merge, revisá también que el panel de compañeros no se quede ' +
  'con la delegación vieja después de un /clear, y si encontrás algo raro en la cola de BullMQ ' +
  'anotalo en la bitácora antes de tocar nada, porque mañana lo miramos juntos con calma.'

function sembrar(paneKey: string, mensajes: MensajeEnCola[], pausa: MotivoDePausa | null) {
  return () => cambiarCola(claveDeCola(paneKey, 'claude'), () => ({ mensajes, pausa }))
}

function Marco({ paneKey, trabajando = true }: { paneKey: string; trabajando?: boolean }) {
  return (
    <div className="bg-background py-4">
      <ColaDelChat paneKey={paneKey} agent="claude" trabajando={trabajando} puedeRecibir={false} />
    </div>
  )
}

export const uno = defineFixture({
  width: 640,
  setup: sembrar('fixture-uno', [mensaje('a', 'Después corré el typecheck')], null),
  render: () => <Marco paneKey="fixture-uno" />
})

export const varios = defineFixture({
  width: 640,
  setup: sembrar(
    'fixture-varios',
    [
      mensaje('a', 'Después corré el typecheck'),
      mensaje('b', LARGO),
      mensaje('c', 'Mirá estas dos capturas', ['/tmp/antes.png', '/tmp/despues.png'])
    ],
    null
  ),
  render: () => <Marco paneKey="fixture-varios" />
})

export const restaurada = defineFixture({
  width: 640,
  setup: sembrar(
    'fixture-restaurada',
    [mensaje('a', 'Subí la rama cuando pase el portón'), mensaje('b', 'Y avisame')],
    'restaurada'
  ),
  render: () => <Marco paneKey="fixture-restaurada" trabajando={false} />
})

export const angosta = defineFixture({
  width: 360,
  setup: sembrar('fixture-angosta', [mensaje('a', LARGO)], 'detenido'),
  render: () => <Marco paneKey="fixture-angosta" trabajando={false} />
})
