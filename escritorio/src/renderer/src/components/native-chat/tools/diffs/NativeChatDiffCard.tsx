import { NativeChatExpandable } from '../../messages/disclosure/NativeChatExpandable'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useNativeChatDisclosure } from '../../messages/disclosure/native-chat-disclosure-store'
import { ChevronRight, FilePlus2, FileMinus2, FilePen } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatCopyButton } from '../../messages/actions/NativeChatCopyButton'
import { NativeChatHighlightedCode } from '../../markdown/code/NativeChatHighlightedCode'
import { NativeChatToolFileTarget } from '../lines/NativeChatToolFileTarget'
import { nativeChatEditFilePatchText } from '../../../../../../shared/native-chat/tools/native-chat-edit-cards'
import { detectLanguage } from '../../../../../../shared/editor-language/editor-language-detect'
import {
  nativeChatEditFileBaseName,
  nativeChatEditGutterChars,
  unifiedLineNumber,
  type NativeChatEditFile,
  type NativeChatEditLine
} from '../../../../../../shared/native-chat/tools/native-chat-edit-model'

function VerbIcon({ kind }: { kind: NativeChatEditFile['changeKind'] }): React.JSX.Element {
  const className = 'size-3.5 shrink-0 text-chat-foreground-faint'
  if (kind === 'added') {
    return <FilePlus2 className={className} />
  }
  if (kind === 'deleted') {
    return <FileMinus2 className={className} />
  }
  return <FilePen className={className} />
}

/** Mark omitted file regions so gutter line jumps do not resemble missing rendered content. */
function DiffGapRow(): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      role="separator"
      aria-label={t('components.native-chat.tool.diffGap', 'Lines not shown')}
      className="select-none border-y border-chat-code-border bg-chat-code-surface py-0.5 text-center text-chat-foreground-faint"
    >
      ⋯
    </div>
  )
}

function DiffRow({
  line,
  gutterWidth,
  language
}: {
  line: NativeChatEditLine
  gutterWidth: number
  language: string
}) {
  if (line.kind === 'gap') {
    return <DiffGapRow />
  }
  return (
    <div
      className={cn(
        'flex items-start',
        line.kind === 'add' && 'bg-[var(--diff-added-background)]',
        line.kind === 'del' && 'bg-[var(--diff-removed-background)]'
      )}
    >
      {gutterWidth > 0 ? (
        <span
          // Give gutter numbers their own background to keep them legible on tinted diff rows.
          className={cn(
            'shrink-0 select-none pr-1.5 text-right tabular-nums text-chat-foreground-faint',
            line.kind === 'add' && 'bg-[var(--diff-added-gutter)]',
            line.kind === 'del' && 'bg-[var(--diff-removed-gutter)]',
            line.kind === 'context' && 'bg-chat-code-surface'
          )}
          style={{ width: `${gutterWidth}ch` }}
          aria-hidden
        >
          {unifiedLineNumber(line) ?? ''}
        </span>
      ) : null}
      <span
        className={cn(
          'w-3 shrink-0 select-none text-center',
          line.kind === 'add' && 'text-chat-diff-added',
          line.kind === 'del' && 'text-chat-diff-removed'
        )}
        aria-hidden
      >
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words pr-2 text-chat-foreground">
        <NativeChatHighlightedCode code={line.text} language={language} />
      </span>
    </div>
  )
}

/** Mount rows separately so collapsed cards do not build their DOM. */
function DiffCardRows({
  lines,
  gutterWidth,
  language,
  preview
}: {
  lines: NativeChatEditFile['lines']
  gutterWidth: number
  language: string
  preview?: boolean
}): React.JSX.Element {
  const seen = new Map<string, number>()
  return (
    // Focusable so the rows can be scrolled from the keyboard.
    <div
      data-native-chat-code-content
      tabIndex={0}
      className="ml-6 mt-1 max-h-72 overflow-auto rounded-lg border border-chat-code-border [background:linear-gradient(var(--chat-code-surface),var(--chat-code-surface)),var(--chat-canvas)] py-1 font-mono text-chat-code leading-relaxed text-chat-foreground scrollbar-sleek focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {lines.map((line) => {
        const signature = `${line.kind}:${line.oldLineNumber}:${line.newLineNumber}:${line.text}`
        const occurrence = seen.get(signature) ?? 0
        seen.set(signature, occurrence + 1)
        return (
          <DiffRow
            key={`${signature}:${occurrence}`}
            line={line}
            gutterWidth={gutterWidth}
            language={language}
          />
        )
      })}
      {preview ? (
        <div className="select-none px-2 text-chat-foreground-faint" aria-hidden>
          ⋯
        </div>
      ) : null}
    </div>
  )
}

/** Render file edits without invented line numbers; header-only changes have no empty disclosure. */
export function NativeChatDiffCard({
  file,
  revealSignal,
  onReveal,
  disclosureKey,
  initialOpen = false
}: {
  file: NativeChatEditFile
  revealSignal?: number
  onReveal?: (element: HTMLElement) => void
  /** Identity this card's open state is remembered under while it is unmounted. */
  disclosureKey?: string
  initialOpen?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const { open: expanded, setOpen: setExpanded } = useNativeChatDisclosure(
    disclosureKey,
    initialOpen
  )
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (revealSignal && cardRef.current) {
      setExpanded(true)
      // Reveal the requested file’s own card, not the enclosing turn that may contain several files.
      onReveal?.(cardRef.current)
    }
  }, [revealSignal, onReveal, setExpanded])
  const copyText = useMemo(() => nativeChatEditFilePatchText(file.lines), [file.lines])
  const hasBody = file.lines.length > 0
  const language = detectLanguage(file.path)
  const canExpand = hasBody && file.lines.length > 12
  const preview = canExpand && !expanded
  const header =
    file.changeKind === 'added'
      ? t('components.native-chat.tool.write', 'Write({{path}})', { path: file.path })
      : file.changeKind === 'deleted'
        ? t('components.native-chat.tool.delete', 'Delete({{path}})', { path: file.path })
        : file.changeKind === 'renamed'
          ? t('components.native-chat.tool.rename', '{{oldPath}} → {{path}}', {
              oldPath: file.oldPath ?? file.path,
              path: file.path
            })
          : t('components.native-chat.tool.update', 'Update({{path}})', { path: file.path })
  const summary = t(
    'components.native-chat.tool.summary',
    'Added {{added}} lines, removed {{removed}} lines',
    { added: file.added, removed: file.removed }
  )
  const gutterWidth = nativeChatEditGutterChars(file)

  return (
    <div ref={cardRef} className="my-1 min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => canExpand && setExpanded(!expanded)}
          className={cn(
            'flex min-h-6.5 min-w-0 flex-1 items-center gap-2 rounded-md text-left font-sans text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            canExpand ? 'cursor-pointer hover:bg-accent/20' : 'cursor-default'
          )}
          aria-expanded={canExpand ? expanded : undefined}
        >
          <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
            <VerbIcon kind={file.changeKind} />
          </span>
          <span className="min-w-0 truncate font-mono text-chat-foreground">{header}</span>
          {file.truncated ? (
            <span className="shrink-0 text-xs text-chat-foreground-faint">
              {t('components.native-chat.tool.diffTruncated', 'Diff truncated')}
            </span>
          ) : null}
          {canExpand ? (
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 text-chat-foreground-faint transition-transform motion-reduce:transition-none',
                expanded && 'rotate-90'
              )}
            />
          ) : null}
        </button>
        <NativeChatToolFileTarget
          path={file.path}
          label={nativeChatEditFileBaseName(file.path)}
          className="min-w-0 max-w-28 truncate text-xs text-chat-foreground-faint"
          // A deleted file has nothing left to open.
          openable={file.changeKind !== 'deleted'}
        />
        <NativeChatCopyButton
          text={copyText}
          label={t('components.native-chat.tool.copyDiff', 'Copy diff')}
          className="ml-auto shrink-0"
        />
      </div>
      {hasBody || file.changeKind !== 'deleted' ? (
        <p className="ml-6 text-xs text-chat-foreground-faint">{summary}</p>
      ) : null}
      {hasBody && preview ? (
        <>
          <DiffCardRows
            lines={file.lines.slice(0, 12)}
            gutterWidth={gutterWidth}
            language={language}
            preview
          />
          <button
            type="button"
            className="ml-6 mt-1 text-xs text-chat-foreground-faint underline-offset-2 hover:underline"
            onClick={() => setExpanded(true)}
          >
            {t('components.native-chat.tool.diffPreviewMore', 'show {{count}} more lines', {
              count: file.lines.length - 12
            })}
          </button>
        </>
      ) : null}
      {hasBody && !preview && canExpand ? (
        <NativeChatExpandable open={expanded}>
          <DiffCardRows lines={file.lines} gutterWidth={gutterWidth} language={language} />
        </NativeChatExpandable>
      ) : null}
      {hasBody && !canExpand ? (
        <DiffCardRows lines={file.lines} gutterWidth={gutterWidth} language={language} />
      ) : null}
    </div>
  )
}
