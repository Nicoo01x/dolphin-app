import { defineFixture } from '../../../component-fixtures/component-fixture'
import { fijarTemaDeResaltado } from '@/lib/syntax-highlighting/syntax-highlighter'
import { NativeChatCodeBlock } from '../../native-chat/markdown/code/NativeChatCodeBlock'
import { NATIVE_CHAT_APPEARANCE_ROOT_CLASS } from '../../native-chat/appearance/native-chat-appearance-style'

/**
 * Un bloque de código del chat con Dolphin Noche y con el de siempre, lado a lado del mismo código
 * de la tienda de ejemplo. `pnpm fixtures:shot "dolphin/lo-que-hizo/TemaNoche:*" --theme both`.
 */
const CODIGO = `// El mes en UTC: Safari lee "2026-11-01" como hora local.
export function priceListFor(now: Date) {
  const month = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  return lists.find((list) => list.from <= month) ?? lists[0];
}

const total = cart.items.reduce((sum, item) => sum + item.price * 2, 0);
await snap('safari-pricing');`

function Bloque(): React.JSX.Element {
  return (
    <div className={`${NATIVE_CHAT_APPEARANCE_ROOT_CLASS} p-6`} data-native-chat-root="true">
      <NativeChatCodeBlock language="ts">{CODIGO}</NativeChatCodeBlock>
    </div>
  )
}

export const noche = defineFixture({
  width: 760,
  setup: () => {
    document.documentElement.dataset.temaDeCodigo = 'noche'
    fijarTemaDeResaltado('noche')
  },
  render: () => <Bloque />
})

export const deSiempre = defineFixture({
  width: 760,
  setup: () => {
    document.documentElement.dataset.temaDeCodigo = 'dolphin'
    fijarTemaDeResaltado('dolphin')
  },
  render: () => <Bloque />
})
