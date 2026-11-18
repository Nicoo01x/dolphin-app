import type { ReactNode } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { enCastellano } from '../../component-fixtures/en-castellano'
import { monaco } from '@/lib/editor/monaco/monaco-setup'
import { definirTemasDeDolphin } from '../editor/tema-dolphin-monaco'
import DiffViewer from '../editor/diff/monaco-view/DiffViewer'
import { EscenaConPaisaje, esperarEscena } from '../dolphin/paisaje/escena-con-paisaje'
import { usePaisajeActivo } from '../dolphin/paisaje/paisaje-activo'

/**
 * El archivo que el agente tocó, abierto al costado del chat (`dolphin/chat/seguir-archivos.ts`),
 * sobre el óleo: el grupo de la izquierda con la conversación y el de la derecha con el archivo,
 * los dos adentro de la columna de vidrio. `pnpm fixtures:shot "tab-group/ArchivoAlCostado:*" --theme both`.
 *
 * El diff es el de verdad (Monaco con el tema sobre el vidrio); el markdown es la cáscara del
 * editor enriquecido con su clase, que es la que pinta el fondo.
 */

const ANTES = [
  "import { precioDelMes } from './precios'",
  '',
  "test('el plan Pro vale lo del mes', () => {",
  "  const hoy = new Date('2026-11-01')",
  "  expect(precioDelMes('pro', hoy)).toBe(49)",
  '})'
].join('\n')

const DESPUES = ANTES.replace("new Date('2026-11-01')", 'new Date(Date.UTC(2026, 10, 1))')

function Grupo({
  titulo,
  activo,
  children
}: {
  titulo: string
  activo?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="group/tab-group flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="flex h-[32px] shrink-0 items-stretch border-b border-border bg-tab-bar px-1.5"
        data-tab-group-strip-id={titulo}
      >
        <div
          data-tab-id={titulo}
          data-active={activo ? 'true' : 'false'}
          className="my-1 flex items-center px-3 text-[13px] text-foreground"
        >
          {titulo}
        </div>
      </div>
      <div data-tab-group-body-id={titulo} className="relative flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}

function Conversacion(): React.JSX.Element {
  return (
    <div data-native-chat-root="true" className="flex flex-col gap-4 p-5 text-sm text-foreground">
      <p className="ml-auto rounded-2xl bg-foreground/[0.08] px-3 py-2">
        El test de precios falla sólo en Safari. ¿Lo mirás?
      </p>
      <p>
        Era la fecha: Safari la lee como hora local y el mes queda en octubre. La armé con{' '}
        <code>Date.UTC</code> y te dejo el archivo al costado.
      </p>
      <p className="text-muted-foreground">Editó precios.test.ts · hace 1 min</p>
    </div>
  )
}

function CascaraDeMarkdown(): React.JSX.Element {
  return (
    <div className="rich-markdown-editor-shell">
      <div className="flex flex-col gap-3 px-8 py-6 text-sm text-foreground">
        <h1 className="text-xl font-semibold">Precios</h1>
        <p>El precio del mes se calcula en UTC: el primer día vale para todo el mundo.</p>
        <p className="text-muted-foreground">Última revisión: noviembre de 2026.</p>
      </div>
    </div>
  )
}

function Pantalla({
  archivo,
  opaco = false
}: {
  archivo: 'diff' | 'markdown'
  opaco?: boolean
}): React.JSX.Element {
  const titulo = archivo === 'diff' ? 'precios.test.ts' : 'PRECIOS.md'
  return (
    <EscenaConPaisaje alto={520} opaco={opaco}>
      <div className="flex min-h-0 flex-1">
        <aside data-dolphin-panel="lateral" className="w-52 shrink-0 bg-worktree-sidebar p-3">
          <p className="text-sm font-medium text-foreground">tienda-web</p>
        </aside>
        <div className="workspace-sidebar-seam flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border">
          <div className="h-[4px] shrink-0 bg-tab-bar" />
          <div className="flex min-h-0 flex-1">
            <Grupo titulo="Claude">
              <Conversacion />
            </Grupo>
            <Grupo titulo={titulo} activo>
              <div className="editor-header text-xs text-muted-foreground">src/{titulo}</div>
              {archivo === 'diff' ? (
                <div className="relative min-h-0 flex-1">
                  <div className="absolute inset-0 flex min-h-0 flex-col">
                    <DiffViewer
                      modelKey="fixture-al-costado"
                      originalContent={ANTES}
                      modifiedContent={DESPUES}
                      language="typescript"
                      filePath="/home/ana-dev/tienda-web/src/precios.test.ts"
                      relativePath="src/precios.test.ts"
                      sideBySide={false}
                    />
                  </div>
                </div>
              ) : (
                <CascaraDeMarkdown />
              )}
            </Grupo>
          </div>
        </div>
      </div>
    </EscenaConPaisaje>
  )
}

// Lo que hace `usePaletaDeCodigo` en la app con el paisaje y paneles de vidrio.
const conElTemaSobreElVidrio = (vidrio: boolean) => (): void => {
  usePaisajeActivo.setState({ activo: true, vidrio })
  definirTemasDeDolphin(monaco.editor, undefined, undefined, vidrio)
}

export const diff = defineFixture(
  enCastellano({
    width: 1280,
    setup: conElTemaSobreElVidrio(true),
    interact: esperarEscena,
    render: () => <Pantalla archivo="diff" />
  })
)
export const markdown = defineFixture(
  enCastellano({
    width: 1280,
    interact: esperarEscena,
    render: () => <Pantalla archivo="markdown" />
  })
)
/** «Paneles opacos»: el archivo queda opaco, como el chat y la barra lateral. */
export const markdownOpaco = defineFixture(
  enCastellano({
    width: 1280,
    interact: esperarEscena,
    render: () => <Pantalla archivo="markdown" opaco />
  })
)
