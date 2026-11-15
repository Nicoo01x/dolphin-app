// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NativeChatBlock } from '../../../../shared/native-chat/native-chat-types'
import { buildEditCards } from '../../../../shared/native-chat/tools/native-chat-edit-cards'
import { NativeChatDiffCard } from './tools/diffs/NativeChatDiffCard'
import type { NativeChatEditFile } from '../../../../shared/native-chat/tools/native-chat-edit-model'

afterEach(cleanup)

function cardFor(blocks: NativeChatBlock[]): void {
  const call = blocks[0]
  if (!call || call.type !== 'tool-call') {
    throw new Error('an edit card needs a tool call first')
  }
  const edit = buildEditCards(blocks).editCards.get(call)
  if (!edit?.files[0]) {
    throw new Error('expected a normalized edit')
  }
  render(<NativeChatDiffCard file={edit.files[0]} initialOpen />)
}

describe('NativeChatDiffCard', () => {
  it.each([
    [
      'Claude',
      [
        {
          type: 'tool-call' as const,
          name: 'Edit',
          state: 'completed' as const,
          input: { file_path: 'src/carrito.ts', old_string: 'old', new_string: 'new' }
        },
        { type: 'tool-result' as const, output: 'ok' }
      ]
    ],
    [
      'Codex',
      [
        {
          type: 'tool-call' as const,
          name: 'apply_patch',
          state: 'completed' as const,
          input: {
            changes: [
              {
                path: 'src/carrito.ts',
                kind: { type: 'update' },
                diff: '@@ -1 +1 @@\n-old\n+new'
              }
            ]
          }
        }
      ]
    ],
    [
      'Antigravity',
      [
        {
          type: 'tool-call' as const,
          name: 'apply_patch',
          state: 'completed' as const,
          input:
            '*** Begin Patch\n*** Update File: src/carrito.ts\n@@ -1 +1 @@\n-old\n+new\n*** End Patch'
        }
      ]
    ]
  ])('%s shows the Claude Code-style header and summary', (_provider, blocks) => {
    cardFor(blocks)

    expect(screen.getByText('Update(src/carrito.ts)')).toBeInTheDocument()
    expect(screen.getByText('Added 1 lines, removed 1 lines')).toBeInTheDocument()
  })

  it('uses Write for a newly created file', () => {
    cardFor([
      {
        type: 'tool-call',
        name: 'Write',
        state: 'completed',
        input: { file_path: 'src/nuevo.ts', content: 'uno\ndos\n' }
      },
      { type: 'tool-result', output: 'File created successfully at: src/nuevo.ts' }
    ])

    expect(screen.getByText('Write(src/nuevo.ts)')).toBeInTheDocument()
    expect(screen.getByText('Added 2 lines, removed 0 lines')).toBeInTheDocument()
  })

  it('starts numbers at the hunk line and keeps a long diff collapsible', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `+line-${index}`).join('\n')
    const block: NativeChatBlock[] = [
      {
        type: 'tool-call',
        name: 'Diff',
        state: 'completed',
        input: { path: 'src/carrito.ts' }
      },
      { type: 'tool-result', output: `@@ -42,20 +42,20 @@\n${lines}` }
    ]
    const call = block[0]
    if (call.type !== 'tool-call') {
      throw new Error('expected a tool call')
    }
    const file = buildEditCards(block).editCards.get(call)?.files[0]
    if (!file) {
      throw new Error('expected a normalized diff')
    }
    render(<NativeChatDiffCard file={file} />)

    const header = screen.getByRole('button', { name: /Update\(src\/carrito\.ts\)/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('line-0').closest('div')).toHaveTextContent('42+line-0')
    expect(screen.queryByText('line-19')).not.toBeInTheDocument()
    expect(screen.getByText('show 8 more lines')).toBeInTheDocument()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('line-19')).toBeInTheDocument()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('line-19')).not.toBeInTheDocument()
  })

  it('muestra entero un diff corto aun cuando está cerrado', () => {
    const file: NativeChatEditFile = {
      path: 'src/corto.ts',
      oldPath: null,
      changeKind: 'edited',
      lines: [
        { kind: 'context', text: 'uno', oldLineNumber: 1, newLineNumber: 1 },
        { kind: 'add', text: 'dos', oldLineNumber: null, newLineNumber: 2 },
        { kind: 'del', text: 'viejo', oldLineNumber: 2, newLineNumber: null }
      ],
      added: 1,
      removed: 1,
      lineNumbersKnown: true,
      truncated: false
    }
    render(<NativeChatDiffCard file={file} />)

    expect(screen.getByText('uno')).toBeInTheDocument()
    expect(screen.getByText('dos')).toBeInTheDocument()
    expect(screen.getByText('viejo')).toBeInTheDocument()
    expect(screen.queryByText('show 0 more lines')).not.toBeInTheDocument()
  })

  it('nombra borrados y renombres sin inventar un resumen vacío', () => {
    const deleted: NativeChatEditFile = {
      path: 'gone.ts',
      oldPath: null,
      changeKind: 'deleted',
      lines: [],
      added: 0,
      removed: 0,
      lineNumbersKnown: false,
      truncated: false
    }
    const renamed: NativeChatEditFile = {
      ...deleted,
      path: 'new.ts',
      oldPath: 'old.ts',
      changeKind: 'renamed'
    }
    render(
      <>
        <NativeChatDiffCard file={deleted} />
        <NativeChatDiffCard file={renamed} />
      </>
    )

    expect(screen.getByText('Delete(gone.ts)')).toBeInTheDocument()
    expect(screen.getByText('old.ts → new.ts')).toBeInTheDocument()
    expect(screen.getAllByText('Added 0 lines, removed 0 lines')).toHaveLength(1)
  })
})
