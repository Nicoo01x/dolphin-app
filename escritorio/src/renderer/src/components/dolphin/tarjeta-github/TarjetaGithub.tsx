import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import type { GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import type { Repo } from '../../../../../shared/repo-types'
import {
  githubLinkPreviewKey,
  loadGitHubLinkPreview,
  readCachedGitHubLinkPreview
} from '../../native-chat/links/previews/native-chat-github-link-preview'
import { useNativeChatHoverPreview } from '../../native-chat/links/previews/use-native-chat-hover-preview'
import { VistaDeTarjeta } from './VistaDeTarjeta'

/** Si la red se cae o vuelve con la tarjeta abierta en un fallo, se completa sola al volver. */
function useSinConexion(fallo: boolean, reintentar: () => void): boolean {
  const [sinConexion, setSinConexion] = useState(() => !navigator.onLine)
  const alVolver = useEffectEvent(() => {
    setSinConexion(false)
    if (fallo) {
      reintentar()
    }
  })
  useEffect(() => {
    const alCaer = () => setSinConexion(true)
    const volvio = () => alVolver()
    window.addEventListener('offline', alCaer)
    window.addEventListener('online', volvio)
    return () => {
      window.removeEventListener('offline', alCaer)
      window.removeEventListener('online', volvio)
    }
  }, [])
  return sinConexion
}

/**
 * La tarjeta de un issue o un pull request de GitHub al pasar por su link en el chat. Reemplaza el
 * cuerpo de la base (NativeChatGitHubPeekBody) con la misma firma, la misma consulta y la misma caché;
 * lo que cambia es lo que se ve (VistaDeTarjeta) y los datos de más que trae main
 * (src/main/dolphin/dolphin-tarjeta-github.ts).
 */
export function TarjetaGithub({
  repo,
  link,
  otherRepoFallback,
  enDolphin = false
}: {
  repo: Repo
  link: GitHubIssueOrPRLink
  /** Igual que en la base: para un link de otro repo, lo que se mostraba antes mientras no llega. */
  otherRepoFallback?: ReactNode
  /** Es del repo del chat: el clic lo abre en Tareas y la tarjeta lo dice. */
  enDolphin?: boolean
}): ReactNode {
  const { state, retry } = useNativeChatHoverPreview(
    githubLinkPreviewKey(repo, link),
    () => readCachedGitHubLinkPreview(repo, link),
    () => loadGitHubLinkPreview(repo, link)
  )
  const sinConexion = useSinConexion(state.status === 'failed', retry)
  if (otherRepoFallback && state.status !== 'ready') {
    return otherRepoFallback
  }
  return (
    <VistaDeTarjeta
      link={link}
      estado={state}
      sinConexion={sinConexion}
      reintentar={retry}
      enDolphin={enDolphin}
    />
  )
}
