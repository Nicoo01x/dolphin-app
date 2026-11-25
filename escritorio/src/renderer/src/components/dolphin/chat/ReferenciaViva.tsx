import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { CircleDot, GitBranch, GitCommitHorizontal, GitPullRequest } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'
import type { ClaseDeReferencia } from './referencias'
import { workItemLabelChipStyle } from '../../../../../shared/github/work-item-labels'

/**
 * Lo que el agente nombró, hecho una pastilla que se toca.
 *
 * Pedido de Nico (01/11): «cuando se menciona un issue, un PR, una rama, te debe permitir
 * clickearlo y llevarte ahí, o si tocás por encima ves un flotante con cuál y demás».
 *
 * Tres decisiones que vale la pena no deshacer:
 *
 * 1. **El detalle se pide al pasar por encima, no al pintar el mensaje.** Un mensaje largo puede
 *    nombrar quince issues; pedirlos todos al dibujarlo son quince llamadas a GitHub para mostrar
 *    un texto que quizá nadie toca. Se pide una vez por referencia y queda cacheado mientras
 *    viva el chat.
 * 2. **La tarjeta aparece después de una pausa corta.** Sin eso, pasar el mouse por un párrafo
 *    con tres referencias abre y cierra tres tarjetas en el camino.
 * 3. **Si el issue no existe, la tarjeta lo dice.** La pastilla se dibuja por la forma del texto
 *    (`#412`), así que puede nombrar algo que no está; callarlo sería dejar a alguien tocando
 *    una pastilla que no hace nada.
 */

/** Lo que se muestra en la tarjeta. */
type Detalle =
  | { readonly que: 'buscando' }
  | { readonly que: 'nada' }
  | {
      readonly que: 'hay'
      readonly titulo: string
      readonly estado?: string
      readonly autor?: string | null
      readonly etiquetas?: readonly string[]
      /** El color de GitHub de cada etiqueta, por nombre. */
      readonly colores?: Readonly<Record<string, string>>
      readonly url?: string
    }

const ICONO: Record<ClaseDeReferencia, typeof CircleDot> = {
  issue: CircleDot,
  pr: GitPullRequest,
  rama: GitBranch,
  commit: GitCommitHorizontal
}

const comoSeLlama = createLocalizedCatalog((): Record<ClaseDeReferencia, string> => ({
  issue: translate('components.dolphin.chat.referenciaViva.issue', 'Issue'),
  pr: translate('components.dolphin.chat.referenciaViva.pr', 'Pull request'),
  rama: translate('components.dolphin.chat.referenciaViva.rama', 'Branch'),
  commit: translate('components.dolphin.chat.referenciaViva.commit', 'Commit')
}))

/** El que ya se pidió no se vuelve a pedir: el chat repite las mismas referencias todo el tiempo. */
const yaPedido = new Map<string, Detalle>()

const ESPERA_ANTES_DE_LA_TARJETA_MS = 320

/**
 * Si lo que se nombra ya es un link (el `#402` que el chat convierte en enlace a GitHub), el link
 * trae su propia tarjeta (TarjetaGithub) con los datos de verdad. La de acá no se abre: si no, se
 * apilan dos, y la de atrás dice «No lo encontré» —busca en el repo activo y como issue— mientras
 * la de adelante muestra el PR (Nico, 19/11/2026).
 */
function yaEsUnLink(marco: HTMLElement | null): boolean {
  return Boolean(marco?.querySelector('a[href]') ?? marco?.closest('a[href]'))
}

export function ReferenciaViva({
  clase,
  id,
  texto,
  children
}: {
  clase: ClaseDeReferencia
  id: string
  texto: string
  children?: React.ReactNode
}): React.JSX.Element {
  const repo = useActiveRepo()
  const repoPath = repo?.path ?? null
  const [abierta, setAbierta] = useState(false)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marco = useRef<HTMLSpanElement>(null)
  const Icono = ICONO[clase]
  const llave = `${repoPath ?? ''}|${clase}|${id}`

  useEffect(
    () => () => {
      if (reloj.current) {
        clearTimeout(reloj.current)
      }
    },
    []
  )

  const pedirDetalle = useCallback(async (): Promise<void> => {
    const guardado = yaPedido.get(llave)
    if (guardado) {
      setDetalle(guardado)
      return
    }
    if (!repoPath || (clase !== 'issue' && clase !== 'pr')) {
      // De una rama o un commit todavía no se pide nada: la tarjeta muestra qué es y adónde va.
      setDetalle({ que: 'nada' })
      return
    }
    setDetalle({ que: 'buscando' })
    try {
      const item = await window.api.gh.workItem({ repoPath, number: Number(id), type: clase })
      const hallado: Detalle = item
        ? {
            que: 'hay',
            titulo: item.title,
            estado: item.state,
            autor: item.author,
            etiquetas: item.labels,
            ...(item.labelColors ? { colores: item.labelColors } : {}),
            url: item.url
          }
        : { que: 'nada' }
      yaPedido.set(llave, hallado)
      setDetalle(hallado)
    } catch {
      // Sin red, sin `gh` instalado o sin permiso: la tarjeta queda con lo que ya sabemos.
      setDetalle({ que: 'nada' })
    }
  }, [clase, id, llave, repoPath])

  const entrar = useCallback((): void => {
    if (reloj.current) {
      clearTimeout(reloj.current)
    }
    if (yaEsUnLink(marco.current)) {
      return
    }
    reloj.current = setTimeout(() => {
      setAbierta(true)
      void pedirDetalle()
    }, ESPERA_ANTES_DE_LA_TARJETA_MS)
  }, [pedirDetalle])

  const salir = useCallback((): void => {
    if (reloj.current) {
      clearTimeout(reloj.current)
    }
    setAbierta(false)
  }, [])

  const abrir = useCallback(async (): Promise<void> => {
    // El link ya abre lo suyo; abrir también desde acá sería abrir dos veces.
    if (yaEsUnLink(marco.current)) {
      return
    }
    // Puede que todavía no se haya pedido el detalle: tocar una referencia sin haber pasado por
    // encima es lo normal con el teclado, y ahí la URL hay que ir a buscarla ahora.
    const guardado = yaPedido.get(llave)
    const yaTengo = detalle?.que === 'hay' ? detalle : guardado?.que === 'hay' ? guardado : null
    if (yaTengo?.url) {
      void window.api.shell.openUrl(yaTengo.url)
      return
    }
    await pedirDetalle()
    const recien = yaPedido.get(llave)
    if (recien?.que === 'hay' && recien.url) {
      void window.api.shell.openUrl(recien.url)
    }
  }, [detalle, llave, pedirDetalle])

  const sePuedeAbrir = clase === 'issue' || clase === 'pr'

  return (
    <span
      ref={marco}
      className="dolphin-ref-marco"
      onMouseEnter={entrar}
      onMouseLeave={salir}
      onFocus={entrar}
      onBlur={salir}
    >
      <span
        role={sePuedeAbrir ? 'button' : undefined}
        tabIndex={0}
        data-ref-clase={clase}
        onClick={sePuedeAbrir ? () => void abrir() : undefined}
        onKeyDown={(e) => {
          if (sePuedeAbrir && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void abrir()
          }
        }}
        className="dolphin-ref"
        title={texto}
      >
        <Icono aria-hidden="true" className="dolphin-ref-icono" />
        {children}
      </span>
      {abierta && (
        <span className="dolphin-ref-tarjeta" role="tooltip">
          <span className="dolphin-ref-tarjeta-que">
            {comoSeLlama()[clase]} · {texto}
          </span>
          {detalle?.que === 'buscando' && (
            <span className="dolphin-ref-tarjeta-gris">
              {translate('components.dolphin.chat.referenciaViva.buscando', 'Looking for it…')}
            </span>
          )}
          {detalle?.que === 'hay' && (
            <>
              <span className="dolphin-ref-tarjeta-titulo">{detalle.titulo}</span>
              <span className="dolphin-ref-tarjeta-gris">
                {[
                  detalle.estado,
                  detalle.autor
                    ? translate(
                        'components.dolphin.chat.referenciaViva.autor',
                        'by {author}'
                      ).replace('{author}', detalle.autor)
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {detalle.etiquetas && detalle.etiquetas.length > 0 && (
                <span className="dolphin-ref-etiquetas">
                  {detalle.etiquetas.map((etiqueta) => {
                    const estilo = workItemLabelChipStyle(detalle.colores?.[etiqueta])
                    return (
                      <span
                        key={etiqueta}
                        className={
                          estilo
                            ? 'dolphin-ref-etiqueta'
                            : 'dolphin-ref-etiqueta dolphin-ref-sin-color'
                        }
                        style={estilo ?? undefined}
                      >
                        {etiqueta}
                      </span>
                    )
                  })}
                </span>
              )}
            </>
          )}
          {detalle?.que === 'nada' && sePuedeAbrir && (
            <span className="dolphin-ref-tarjeta-gris">
              {translate(
                'components.dolphin.chat.referenciaViva.nada',
                "I couldn't find it in this repo."
              )}
            </span>
          )}
          {!sePuedeAbrir && (
            <span className="dolphin-ref-tarjeta-gris">
              {clase === 'rama'
                ? translate(
                    'components.dolphin.chat.referenciaViva.ramaDeAca',
                    "It's in this repo."
                  )
                : translate(
                    'components.dolphin.chat.referenciaViva.commitDeAca',
                    'A commit from this repo.'
                  )}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
