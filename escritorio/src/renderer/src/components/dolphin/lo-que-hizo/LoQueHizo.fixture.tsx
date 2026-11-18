import { defineFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { fijarTemaDeResaltado } from '@/lib/syntax-highlighting/syntax-highlighter'
import { CapaDePaisaje } from '../paisaje/FondoDePaisaje'
import { fondoIncluido } from '../paisaje/fondos'
import { EscenaConPaisaje, esperarEscena } from '../paisaje/escena-con-paisaje'
import { loQueHizo } from './pasos'
import { TarjetaLoQueHizo, type DatosDeLoQueHizo } from './TarjetaLoQueHizo'

/**
 * La tarjeta «Lo que hizo» con un turno de la tienda de ejemplo: el test de precios que fallaba en
 * Safari. `pnpm fixtures:shot "dolphin/lo-que-hizo/LoQueHizo:*" --theme both`.
 */

const INICIO = Date.UTC(2026, 10, 14, 15, 0, 0)

function mensaje(
  id: string,
  segundo: number,
  blocks: NativeChatMessage['blocks']
): NativeChatMessage {
  return {
    id,
    role: id.startsWith('u') ? 'user' : 'assistant',
    blocks,
    timestamp: INICIO + segundo * 1000,
    source: 'transcript'
  }
}

const RAIZ = '/home/ana-dev/tienda-web/'

const PRUEBA_VIEJA = [
  '  const picker = render(<PlanPicker now={safariDate} />);',
  "  const price = picker.getByTestId('pro-price');",
  "  expect(price).toHaveText('$49');",
  "  await snap('safari-pricing');"
].join('\n')

const PRUEBA_NUEVA = PRUEBA_VIEJA.replace(
  "expect(price).toHaveText('$49');",
  "expect(price).toHaveText(currentPrice('pro'));"
)

const TURNO: NativeChatMessage[] = [
  mensaje('u1', 0, [{ type: 'text', text: 'El test de precios falla sólo en Safari.' }]),
  mensaje('a1', 4, [
    {
      type: 'tool-call',
      name: 'Read',
      callId: 'c1',
      input: { file_path: `${RAIZ}src/pricing/plan-picker.tsx` }
    },
    { type: 'tool-result', callId: 'c1', output: '…' }
  ]),
  mensaje('a2', 9, [
    { type: 'tool-call', name: 'Bash', callId: 'c2', input: { command: 'pnpm test pricing' } },
    {
      type: 'tool-result',
      callId: 'c2',
      output: ' Tests  1 failed | 11 passed (12)',
      isError: true
    }
  ]),
  mensaje('a3', 11, [
    {
      type: 'tool-call',
      name: 'Edit',
      callId: 'c3',
      input: {
        file_path: `${RAIZ}src/pricing/plan-picker.spec.ts`,
        old_string: PRUEBA_VIEJA,
        new_string: PRUEBA_NUEVA
      }
    },
    { type: 'tool-result', callId: 'c3', output: 'ok' }
  ]),
  mensaje('a4', 31, [
    {
      type: 'tool-call',
      name: 'Edit',
      callId: 'c4',
      input: {
        file_path: `${RAIZ}src/pricing/price-list.ts`,
        old_string:
          'export function priceListFor(now: Date) {\n  const month = new Date(`${now.getFullYear()}-${now.getMonth() + 1}-01`);\n  return lists.find((list) => list.from <= month) ?? lists[0];\n}',
        new_string:
          'export function priceListFor(now: Date) {\n  const month = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));\n  return lists.find((list) => list.from <= month) ?? lists[0];\n}'
      }
    },
    { type: 'tool-result', callId: 'c4', output: 'ok' }
  ]),
  mensaje('a5', 38, [
    { type: 'tool-call', name: 'Bash', callId: 'c5', input: { command: 'pnpm test pricing' } },
    { type: 'tool-result', callId: 'c5', output: ' Tests  12 passed (12)' }
  ])
]

const DATOS: DatosDeLoQueHizo = {
  agente: 'codex',
  resumen: loQueHizo(TURNO),
  pr: { numero: 491, url: 'https://github.com/ana-dev/tienda-web/pull/491' }
}

function Escena({ datos }: { datos: DatosDeLoQueHizo }): React.JSX.Element {
  return (
    <div className="relative grid place-items-center overflow-hidden p-12">
      <CapaDePaisaje url={fondoIncluido('meandro').url} desenfoque absoluta />
      <div className="lo-que-hizo-ventana relative z-10 w-[46rem] overflow-hidden rounded-[20px]">
        <TarjetaLoQueHizo datos={datos} onCerrar={() => undefined} />
      </div>
    </div>
  )
}

const conNoche = (): void => {
  document.documentElement.dataset.temaDeCodigo = 'noche'
  fijarTemaDeResaltado('noche')
}

export const turnoConPr = defineFixture(
  enCastellano({
    width: 1000,
    setup: conNoche,
    render: () => <Escena datos={DATOS} />
  })
)

/**
 * Como se abre en la app: sobre la ventana de vidrio (un panel con la conversación), con el velo y
 * el desenfoque del fondo de la ventana (`VentanaLoQueHizo`) entre los dos.
 */
function EscenaSobreElVidrio({ opaco = false }: { opaco?: boolean }): React.JSX.Element {
  return (
    <EscenaConPaisaje alto={860} opaco={opaco}>
      <div data-dolphin-panel="fixture" className="flex min-h-0 flex-1 flex-col gap-4 p-10">
        <p className="max-w-xl text-sm text-foreground">
          Era la fecha: Safari la lee como hora local y el mes queda en octubre.
        </p>
      </div>
      <div className="absolute inset-0 grid place-items-center bg-black/11 p-4 backdrop-blur-[6px]">
        <div className="lo-que-hizo-ventana flex max-h-[85vh] w-[46rem] max-w-full flex-col overflow-hidden rounded-[20px]">
          <TarjetaLoQueHizo datos={DATOS} onCerrar={() => undefined} />
        </div>
      </div>
    </EscenaConPaisaje>
  )
}

export const sobreElVidrio = defineFixture(
  enCastellano({
    width: 1000,
    setup: conNoche,
    interact: esperarEscena,
    render: () => <EscenaSobreElVidrio />
  })
)
/** «Paneles opacos»: la ventana vuelve a ser la de siempre. */
export const sobreElVidrioOpaco = defineFixture(
  enCastellano({
    width: 1000,
    setup: conNoche,
    interact: esperarEscena,
    render: () => <EscenaSobreElVidrio opaco />
  })
)

/** Sin PR y con un solo paso: el pie queda sin botón. */
export const sinPr = defineFixture(
  enCastellano({
    width: 1000,
    setup: conNoche,
    render: () => <Escena datos={{ ...DATOS, pr: null, resumen: loQueHizo(TURNO.slice(0, 2)) }} />
  })
)
