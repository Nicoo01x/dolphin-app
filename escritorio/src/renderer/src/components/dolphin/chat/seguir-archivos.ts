import { detectLanguage } from '../../../../../shared/editor-language/editor-language-detect'
import { useAppStore } from '@/store'
import { isLiveLinkOpenGroup as isLiveEditorOpenGroup } from '@/lib/links/placement/link-open-intent'
import { isEditorTabContentType } from '@/store/slices/editor/tabs/editor-tab-content-type'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { toWslExecutionSpace } from '../../../../../shared/wsl-paths'

/** Dónde corre el agente: su worktree y la pestaña de la que salió el chat. */
export type ContextoDelChat = {
  worktreeId: string
  worktreePath: string
  runtimeEnvironmentId?: string | null
  sourceTabId?: string
}

const ESCRIBE = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

function rutaDe(input: unknown): string | null {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const path = record.file_path ?? record.notebook_path
  return typeof path === 'string' && path.trim() !== '' ? path : null
}

/** Una escritura del agente: el archivo y una clave que no cambia al cargar mensajes más viejos. */
export type Escritura = { path: string; clave: string }

/**
 * Las escrituras del agente en la conversación, en orden, sin las que fallaron o se rechazaron (no
 * cambiaron nada; se aparean con su resultado por callId).
 */
export function escriturasDe(messages: readonly NativeChatMessage[]): Escritura[] {
  const escrituras: (Escritura & { callId?: string })[] = []
  const fallidas = new Set<string>()
  for (const message of messages) {
    for (const [index, block] of message.blocks.entries()) {
      if (block.type === 'tool-call' && ESCRIBE.has(block.name)) {
        const path = rutaDe(block.input)
        if (path) {
          escrituras.push({
            path,
            clave: block.callId ?? `${message.id}#${index}`,
            callId: block.callId
          })
        }
      } else if (block.type === 'tool-result' && block.isError && block.callId) {
        fallidas.add(block.callId)
      }
    }
  }
  return escrituras
    .filter((e) => !e.callId || !fallidas.has(e.callId))
    .map(({ path, clave }) => ({ path, clave }))
}

/**
 * La escritura que hay que abrir: la última, si no se había visto. Va por clave y no por cuenta:
 * cargar mensajes más viejos suma escrituras sin que el agente haya hecho nada, y una que falla
 * después deja de última a otra que ya se vio.
 */
export function escrituraNueva(
  vistas: ReadonlySet<string>,
  escrituras: readonly Escritura[]
): Escritura | null {
  const ultima = escrituras.at(-1)
  return ultima && !vistas.has(ultima.clave) ? ultima : null
}

// Sin «..» ni «:»: `D:foo` en Windows es relativa a otra unidad, no al worktree.
const sinSubirDeCarpeta = (relativa: string): string | null =>
  relativa && !relativa.includes(':') && !relativa.split('/').includes('..') ? relativa : null

/**
 * La parte de `archivo` adentro de `raiz`, o null. En Windows compara sin mayúsculas, pero corta por
 * el largo de la raíz tal cual: pasar a minúsculas puede alargar el texto («İ» da dos caracteres).
 */
function relativaA(raiz: string, archivo: string): string | null {
  const cabeza = archivo.slice(0, raiz.length)
  const coincide = /^[a-z]:\//i.test(raiz)
    ? cabeza.toLowerCase() === raiz.toLowerCase()
    : cabeza === raiz
  return coincide && archivo[raiz.length] === '/'
    ? sinSubirDeCarpeta(archivo.slice(raiz.length + 1))
    : null
}

/**
 * La ruta del archivo relativa al worktree, con «/», o null si cae afuera. El agente la nombra
 * absoluta y en Windows con cualquier separador; en WSL el worktree es `\\wsl.localhost\<distro>\…`
 * y el agente la nombra como la ve Linux. Un archivo fuera del worktree no se abre solo.
 */
export function rutaDentroDelWorktree(worktreePath: string, filePath: string): string | null {
  const archivo = filePath.replace(/\\/g, '/')
  if (!/^([a-z]:)?\//i.test(archivo)) {
    return sinSubirDeCarpeta(archivo.replace(/^\.\//, ''))
  }
  const raices = new Set(
    [worktreePath, toWslExecutionSpace(worktreePath)].map((raiz) =>
      raiz.replace(/\\/g, '/').replace(/\/+$/, '')
    )
  )
  for (const raiz of raices) {
    const relativa = relativaA(raiz, archivo)
    if (relativa) {
      return relativa
    }
  }
  return null
}

const paraComparar = (path: string): string => {
  const conBarras = path.replace(/\\/g, '/')
  return /^[a-z]:\//i.test(conBarras) ? conBarras.toLowerCase() : conBarras
}

/** El grupo donde se muestran los archivos que toca el agente de cada pestaña. */
const grupoPorPestana = new Map<string, string>()

/** @internal Para que cada test arranque sin el grupo que dejó el anterior. */
export function __olvidarGruposDeSeguirParaTests(): void {
  grupoPorPestana.clear()
}

/**
 * Abre al costado del chat el archivo que tocó el agente, en modo «cambios» (contra HEAD), como el
 * editor de VS Code cuando el agente edita. Usa el grupo de la vez anterior, o uno de editor que ya
 * esté a la vista, o abre uno nuevo a la derecha. El foco se queda en el chat.
 */
export function abrirAlCostado(contexto: ContextoDelChat, filePath: string): boolean {
  const relativa = rutaDentroDelWorktree(contexto.worktreePath, filePath)
  if (!relativa || !contexto.sourceTabId) {
    return false
  }
  const state = useAppStore.getState()
  const { worktreeId } = contexto
  const tabs = state.unifiedTabsByWorktree?.[worktreeId] ?? []
  const pestana =
    tabs.find((tab) => tab.id === contexto.sourceTabId) ??
    tabs.find((tab) => tab.contentType === 'terminal' && tab.entityId === contexto.sourceTabId)
  if (!pestana) {
    return false
  }
  const enfocado = state.activeGroupIdByWorktree?.[worktreeId]
  let grupo = grupoPorPestana.get(pestana.id)
  if (!grupo || grupo === pestana.groupId || !isLiveEditorOpenGroup(state, worktreeId, grupo)) {
    const tabsPorId = new Map(tabs.map((tab) => [tab.id, tab]))
    // Un editor a la vista sirve, salvo el que la persona tiene enfocado: no se le cambia lo que
    // está mirando (o escribiendo) para mostrarle lo del agente.
    const conEditor = (state.groupsByWorktree?.[worktreeId] ?? []).find((g) => {
      const activa = g.activeTabId ? tabsPorId.get(g.activeTabId) : undefined
      return (
        g.id !== pestana.groupId &&
        g.id !== enfocado &&
        activa &&
        isEditorTabContentType(activa.contentType)
      )
    })
    grupo =
      conEditor?.id ??
      state.createEmptySplitGroup(worktreeId, pestana.groupId, 'right', { activate: false }) ??
      undefined
    if (!grupo) {
      return false
    }
    grupoPorPestana.set(pestana.id, grupo)
  }
  const separador = contexto.worktreePath.includes('\\') ? '\\' : '/'
  const absoluta = `${contexto.worktreePath.replace(/[\\/]+$/, '')}${separador}${relativa.split('/').join(separador)}`
  const yaAbierto = (state.openFiles ?? []).some(
    (file) =>
      file.worktreeId === worktreeId && paraComparar(file.filePath) === paraComparar(absoluta)
  )
  const id = state.openFile(
    {
      filePath: absoluta,
      relativePath: relativa,
      worktreeId,
      runtimeEnvironmentId: contexto.runtimeEnvironmentId ?? null,
      language: detectLanguage(relativa),
      mode: 'edit'
    },
    { preview: true, targetGroupId: grupo, selection: 'background', focusEditor: false }
  )
  // El modo es por archivo, no por pestaña: si la persona ya lo tenía abierto, se le cambiaría a ella.
  if (!yaAbierto) {
    useAppStore.getState().setEditorViewMode(id, 'changes')
  }
  // «background» igual enfoca el grupo del archivo y lo marca como activo: con eso Ctrl+S o Ctrl+W
  // irían al archivo del agente. Se vuelve a enfocar lo que tenía la persona; el grupo de al lado lo
  // sigue mostrando igual.
  if (enfocado && enfocado !== grupo) {
    useAppStore.getState().focusGroup(worktreeId, enfocado)
  }
  return true
}
