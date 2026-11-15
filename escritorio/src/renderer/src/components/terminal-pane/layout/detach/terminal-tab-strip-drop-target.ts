import type { PaneExternalDropTarget } from '@/lib/pane-manager/pane-manager-types'
import type { AppState } from '@/store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/constants'

const TAB_GROUP_STRIP_SELECTOR = '[data-tab-group-strip-id][data-worktree-id]'

export type TerminalTabStripDropTarget = PaneExternalDropTarget & {
  groupId: string
  insertionIndex?: number
  worktreeId: string
}

function pointWithinRect(clientX: number, clientY: number, rect: DOMRect): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}

function rectFromBox(args: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    left: args.left,
    top: args.top,
    right: args.left + args.width,
    bottom: args.top + args.height,
    width: args.width,
    height: args.height
  } as DOMRect
}

function clampIndex(index: number, max: number): number {
  return Math.min(Math.max(index, 0), max)
}

function getTabElements(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-tab-id]')).filter(
    (element) => typeof element.dataset.tabId === 'string' && element.dataset.tabId.length > 0
  )
}

function getInsertionMarkerRect(
  tabRects: DOMRect[],
  insertionIndex: number,
  stripRect: DOMRect
): DOMRect {
  const markerWidth = 2
  const clampedIndex = clampIndex(insertionIndex, tabRects.length)
  const rawLeft =
    clampedIndex < tabRects.length
      ? (tabRects[clampedIndex]?.left ?? stripRect.left)
      : (tabRects.at(-1)?.right ?? stripRect.left) - markerWidth
  const left = Math.min(Math.max(rawLeft, stripRect.left), stripRect.right - markerWidth)
  return rectFromBox({ left, top: stripRect.top, width: markerWidth, height: stripRect.height })
}

function resolveTabStripInsertion(args: {
  clientX: number
  clientY: number
  groupTabOrderLength: number
  strip: HTMLElement
  stripRect: DOMRect
}): { index: number; rect: DOMRect } | null {
  const tabs = getTabElements(args.strip)
  if (tabs.length === 0) {
    return null
  }
  const tabRects = tabs.map((tab) => tab.getBoundingClientRect())

  for (let index = 0; index < tabRects.length; index += 1) {
    const tabRect = tabRects[index]
    if (!tabRect) {
      continue
    }
    if (args.clientX < tabRect.left) {
      const insertionIndex = clampIndex(index, args.groupTabOrderLength)
      return {
        index: insertionIndex,
        rect: getInsertionMarkerRect(tabRects, insertionIndex, args.stripRect)
      }
    }
    if (pointWithinRect(args.clientX, args.clientY, tabRect)) {
      const insertionIndex = clampIndex(
        index + (args.clientX < tabRect.left + tabRect.width / 2 ? 0 : 1),
        args.groupTabOrderLength
      )
      return {
        index: insertionIndex,
        rect: getInsertionMarkerRect(tabRects, insertionIndex, args.stripRect)
      }
    }
  }

  const insertionIndex = args.groupTabOrderLength
  return {
    index: insertionIndex,
    rect: getInsertionMarkerRect(tabRects, insertionIndex, args.stripRect)
  }
}

function getElementsFromPoint(clientX: number, clientY: number): Element[] {
  if (typeof document === 'undefined') {
    return []
  }
  const elements = document.elementsFromPoint?.(clientX, clientY)
  if (elements && elements.length > 0) {
    return elements
  }
  const element = document.elementFromPoint?.(clientX, clientY)
  return element ? [element] : []
}

/**
 * Las tiras que aceptan un panel arrastrado: las del propio workspace y la de la ventana flotante.
 *
 * Why la flotante también: es otro workspace, y soltar un panel ahí es justamente «llevate esta
 * conversación a la ventana flotante». Cualquier OTRO workspace sigue afuera: mover un panel al de
 * otro proyecto movería su PTY a un árbol que no es el suyo, y nadie pidió eso.
 */
function aceptaElPanel(stripWorktreeId: string, propio: string): boolean {
  return stripWorktreeId === propio || stripWorktreeId === FLOATING_TERMINAL_WORKTREE_ID
}

export function resolveTerminalTabStripDropTarget(args: {
  clientX: number
  clientY: number
  groupsByWorktree: AppState['groupsByWorktree']
  worktreeId: string
}): TerminalTabStripDropTarget | null {
  // Los grupos se validan contra el workspace de la TIRA, no contra el propio: el grupo de la
  // flotante no está en la lista del proyecto, y con la lista equivocada su tira se descartaba.
  const gruposDe = (worktreeId: string) => args.groupsByWorktree[worktreeId] ?? []
  if (
    gruposDe(args.worktreeId).length === 0 &&
    gruposDe(FLOATING_TERMINAL_WORKTREE_ID).length === 0
  ) {
    return null
  }

  for (const element of getElementsFromPoint(args.clientX, args.clientY)) {
    const strip = element.closest<HTMLElement>(TAB_GROUP_STRIP_SELECTOR)
    const groupId = strip?.dataset.tabGroupStripId
    const worktreeId = strip?.dataset.worktreeId
    if (!strip || !groupId || !worktreeId || !aceptaElPanel(worktreeId, args.worktreeId)) {
      continue
    }
    const groups = gruposDe(worktreeId)
    const groupById = new Map(groups.map((group) => [group.id, group]))
    if (!groupById.has(groupId)) {
      continue
    }
    const rect = strip.getBoundingClientRect()
    if (!pointWithinRect(args.clientX, args.clientY, rect)) {
      continue
    }
    const group = groupById.get(groupId)
    const insertion = group
      ? resolveTabStripInsertion({
          clientX: args.clientX,
          clientY: args.clientY,
          groupTabOrderLength: group.tabOrder?.length ?? 0,
          strip,
          stripRect: rect
        })
      : null
    return insertion
      ? {
          id: groupId,
          groupId,
          insertionIndex: insertion.index,
          overlayKind: 'insertion',
          rect: insertion.rect,
          worktreeId
        }
      : { id: groupId, groupId, worktreeId, rect }
  }

  return null
}

export function isTerminalTabStripDropTarget(
  target: PaneExternalDropTarget
): target is TerminalTabStripDropTarget {
  const candidate = target as Partial<TerminalTabStripDropTarget>
  return typeof candidate.groupId === 'string' && typeof candidate.worktreeId === 'string'
}
