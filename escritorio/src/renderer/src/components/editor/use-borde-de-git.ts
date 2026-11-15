import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '@/store'
import { monaco } from '@/lib/editor/monaco/monaco-setup'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree/id'
import { instalarBordeDeGit, type BordeDeGit } from './bordes-de-git-en-monaco'
import { firmaDelBordeDeGit } from './firma-del-borde-de-git'
import { instalarRevertirTrozo } from './revertir-trozo-monaco'

type BaseDelBorde = { content: string; exists: boolean; isBinary: boolean; failed: boolean }

async function leerBase(worktreePath: string, rutaRelativa: string): Promise<BaseDelBorde> {
  return (
    window.api.git
      .fileBaseForGutter({ worktreePath, filePath: rutaRelativa })
      // Que git no conteste no puede tirar el editor: el borde simplemente no se pinta.
      .catch(() => ({ content: '', exists: false, isBinary: true, failed: true }))
  )
}

/**
 * Engancha el borde de git a un editor montado, y el flotante para revertir un trozo desde él.
 *
 * Sigue la forma de `useAjustesDelProyecto`, que es su vecino: el editor montado, la ruta del
 * archivo y el worktree. Sin worktree no hay repo que preguntar y no se pinta nada — un archivo
 * suelto abierto desde el disco no tiene «antes».
 *
 * La base se lee al montar y cada vez que cambia la firma de git del archivo (`version`; si no
 * viene, sale del `git status` del store: HEAD más el área del archivo). Así un commit del agente
 * o un `git add` la mueven solos. Preguntarle a git en cada tecla sería un proceso nuevo por tecla.
 */
export function useBordeDeGit(args: {
  readonly editor: editor.IStandaloneCodeEditor | null
  readonly rutaRelativa: string
  readonly worktreeId: string | undefined
  /** Cambiarlo vuelve a leer la base. Por defecto, la firma de git del archivo en el store. */
  readonly version?: number | string
}): void {
  const bordeRef = useRef<BordeDeGit | null>(null)
  const firmaDelStore = useAppStore((estado) =>
    args.worktreeId
      ? firmaDelBordeDeGit(
          estado.gitStatusHeadByWorktree[args.worktreeId],
          estado.gitStatusByWorktree[args.worktreeId],
          args.rutaRelativa
        )
      : ''
  )
  const version = args.version ?? firmaDelStore
  const versionRef = useRef(version)
  versionRef.current = version
  const versionLeidaRef = useRef<number | string | null>(null)

  const worktreePath = args.worktreeId
    ? (splitWorktreeIdForFilesystem(args.worktreeId)?.worktreePath ?? null)
    : null

  useEffect(() => {
    const montado = args.editor
    if (!montado || !worktreePath || args.rutaRelativa === '') {
      return
    }
    let vigente = true
    let revertir: { dispose: () => void } | null = null
    versionLeidaRef.current = versionRef.current
    void leerBase(worktreePath, args.rutaRelativa).then((base) => {
      if (!vigente) {
        return
      }
      const borde = instalarBordeDeGit({
        editor: montado,
        base: base.content,
        // Un binario no tiene líneas que marcar, y un archivo nuevo sí: su base es vacía y de
        // verdad, así que se pinta entero como agregado, que es lo correcto.
        hayBase: !base.failed && !base.isBinary
      })
      bordeRef.current = borde
      revertir = instalarRevertirTrozo({ monaco, editor: montado, borde })
    })
    return () => {
      vigente = false
      revertir?.dispose()
      bordeRef.current?.dispose()
      bordeRef.current = null
    }
  }, [args.editor, args.rutaRelativa, worktreePath])

  useEffect(() => {
    const borde = bordeRef.current
    if (!borde || !worktreePath || versionLeidaRef.current === version) {
      return
    }
    versionLeidaRef.current = version
    let vigente = true
    void leerBase(worktreePath, args.rutaRelativa).then((base) => {
      // Si git no contestó se deja la base que había: borrar el borde sería afirmar que no hay
      // cambios cuando no sabemos.
      if (vigente && bordeRef.current === borde && !base.failed && !base.isBinary) {
        borde.refrescar(base.content)
      }
    })
    return () => {
      vigente = false
    }
  }, [version, worktreePath, args.rutaRelativa])
}
