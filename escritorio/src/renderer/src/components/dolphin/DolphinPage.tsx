import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveRepo, useRepos } from '@/store/repos/use-repository-catalog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { DOLPHIN_BROWSER_PARTITION } from '../../../../shared/browser/browser-session-partition'
import { DOLPHIN_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../shared/browser/guest-lifecycle/browser-guest-web-preferences'
import { DolphinMark } from './DolphinMark'
import { dolphinRunsFor } from './dolphin-available'
import { dolphinFailureMessage } from './dolphin-failure'
import { requestDolphinConsole } from './dolphin-console-request'
import type { DolphinPageVista } from '@/store/slices/ui/ui-slice-contract-core'
import { vistaDeMensajeDeConsola } from './dolphin-console-message'

type ConsoleState =
  | { kind: 'starting' }
  | { kind: 'ready'; url: string }
  | { kind: 'failed'; reason: string }

type ConsoleTheme = 'claro' | 'oscuro'

/** El tema de la app en este momento: la consola embebida lo sigue. */
function appTheme(): ConsoleTheme {
  return document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro'
}

/**
 * La consola como una pantalla más de la app: con su tema y sin su marca ni su selector de
 * proyecto, que ya están en la barra de la app (ver dolphin-app, ui/src/lib/embebida.ts).
 */
/**
 * Con la pintura de fondo, la página es vidrio (`marca-de-pagina.ts`) y la consola se pinta
 * transparente encima, con velos en vez de superficies (ui/src/app.css, `data-vidrio`). Sin eso
 * tapaba el vidrio con su negro (Nico, 26/11/2026: «no tiene ni el fondo»).
 */
function appHasPainting(): boolean {
  return document.documentElement.hasAttribute('data-dolphin-paisaje')
}

function embeddedConsoleUrl(url: string, theme: ConsoleTheme, vista: DolphinPageVista): string {
  const embedded = new URL(url)
  embedded.searchParams.set('embebida', '1')
  embedded.searchParams.set('tema', theme)
  if (appHasPainting()) {
    embedded.searchParams.set('vidrio', '1')
  }
  embedded.hash = vista
  return embedded.toString()
}

/**
 * Lo que la consola embebida le pide a la app. Why por la consola del webview: es el canal que
 * ya existe sin un preload en una página que también se abre sola en el navegador. Solo se
 * atienden estos dos textos exactos.
 */
/**
 * Corre algo en la consola embebida. Why el try: antes de su `dom-ready`, executeJavaScript tira
 * en el acto (no rechaza la promesa), y ese error rompía la página entera al tocar una vista de la
 * barra mientras la consola cargaba.
 */
function runInConsole(webview: Electron.WebviewTag, code: string): void {
  try {
    void webview.executeJavaScript(code).catch(() => undefined)
  } catch {
    // Todavía cargando: al terminar (dom-ready) se aplica la vista de ese momento.
  }
}

const hashDeVista = (vista: DolphinPageVista): string =>
  `location.hash = ${JSON.stringify(`#${vista}`)}`

const CONSOLE_ASKS_RELOAD = 'dolphin:app:recargar'
const CONSOLE_ASKS_OPEN_OUTSIDE = 'dolphin:app:abrir-afuera'

/**
 * La consola de Dolphin del proyecto activo, adentro de la app: Mission Control, las
 * cosechas, la Memoria y la cola. O la de un worktree, si se llegó desde el modo live: la
 * siembra está en esa. El proceso principal la levanta (una por carpeta) y acá se muestra en un
 * <webview> con la misma política de invitado que el navegador interno.
 */
export default function DolphinPage(): React.JSX.Element {
  const activeRepo = useActiveRepo()
  const repos = useRepos()
  const target = useAppStore((s) => s.appPageTarget)
  const appPageVista = useAppStore((s) => s.appPageVista)
  const setDolphinPageVista = useAppStore((s) => s.setDolphinPageVista)
  // Sin proyecto activo se elige acá cuál mirar, sin cambiar el proyecto activo de la app.
  const [chosenRepoId, setChosenRepoId] = useState<string | null>(null)
  const repo = activeRepo ?? repos.find((r) => r.id === chosenRepoId) ?? null
  const closePage = useAppStore((s) => s.closeDolphinPage)
  const openModal = useAppStore((s) => s.openModal)
  const [state, setState] = useState<ConsoleState>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const appPageVistaRef = useRef(appPageVista)
  // Lo que la consola puede pedir; el listener del webview vive más que cada render.
  const consoleActions = useRef({ reload: (): void => undefined })
  // El worktree del modo live ya se miró al sembrar; un proyecto de otra máquina no tiene consola acá.
  const elsewhere = !target && repo !== null && !dolphinRunsFor(repo)
  const repoPath = target?.path ?? (elsewhere ? null : (repo?.path ?? null))
  const label = target?.label ?? repo?.displayName ?? null

  useEffect(() => {
    appPageVistaRef.current = appPageVista
  }, [appPageVista])

  useEffect(() => {
    if (!repoPath) {
      return
    }
    let alive = true
    setState({ kind: 'starting' })
    // Siempre contesta: con la consola, con el motivo del proceso principal, o con un tope propio.
    void requestDolphinConsole(() => window.api.dolphin.openConsole(repoPath)).then((result) => {
      if (alive) {
        setState(
          result.ok
            ? { kind: 'ready', url: result.url }
            : { kind: 'failed', reason: dolphinFailureMessage(result) }
        )
      }
    })
    return () => {
      alive = false
    }
  }, [repoPath, attempt])

  const url = state.kind === 'ready' ? state.url : null
  useEffect(() => {
    const container = containerRef.current
    if (!url || !container) {
      return
    }
    const webview = document.createElement('webview') as Electron.WebviewTag
    webview.setAttribute('partition', DOLPHIN_BROWSER_PARTITION)
    // Why las preferencias base y no las de página: esas fuerzan `transparent=false` (blanco para
    // una web cualquiera en blanco) y la consola es nuestra: transparente, deja ver el vidrio.
    webview.setAttribute('webpreferences', DOLPHIN_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
    webview.setAttribute(
      'aria-label',
      translate('auto.components.dolphin.DolphinPage.consoleLabel', 'Dolphin console')
    )
    webview.style.display = 'flex'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    // Transparente: lo de atrás es el vidrio de la página (o su fondo liso, sin pintura).
    webview.style.background = 'transparent'
    container.appendChild(webview)
    webviewRef.current = webview

    const onConsoleMessage = (event: Electron.ConsoleMessageEvent): void => {
      if (event.message === CONSOLE_ASKS_RELOAD) {
        consoleActions.current.reload()
      } else if (event.message === CONSOLE_ASKS_OPEN_OUTSIDE) {
        // Sola en el navegador, con su marca y su tema de siempre.
        void window.api.shell.openUrl(url)
      } else {
        const vista = vistaDeMensajeDeConsola(event.message)
        if (vista) {
          setDolphinPageVista(vista)
        }
      }
    }
    webview.addEventListener('console-message', onConsoleMessage)
    // Lo que se tocó en la barra mientras cargaba: la URL ya llevaba la vista de cuando nació.
    const onReady = (): void => {
      runInConsole(webview, hashDeVista(appPageVistaRef.current))
      const tarea = useAppStore.getState().dolphinNuevaTarea
      if (tarea !== null) {
        runInConsole(webview, `window.dolphinNuevaTarea?.(${JSON.stringify(tarea)})`)
        useAppStore.getState().setDolphinNuevaTarea(null)
      }
    }
    webview.addEventListener('dom-ready', onReady)
    webview.setAttribute('src', embeddedConsoleUrl(url, appTheme(), appPageVistaRef.current))
    // Why sin recargar: cambiar el tema de la app no tiene que tirar lo que la consola está mostrando.
    const themeObserver = new MutationObserver(() => {
      runInConsole(webview, `window.dolphinTema?.(${JSON.stringify(appTheme())})`)
      runInConsole(webview, `window.dolphinVidrio?.(${JSON.stringify(appHasPainting())})`)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-dolphin-paisaje']
    })
    return () => {
      themeObserver.disconnect()
      webview.removeEventListener('console-message', onConsoleMessage)
      webview.removeEventListener('dom-ready', onReady)
      webviewRef.current = null
      webview.remove()
    }
  }, [setDolphinPageVista, url])

  useEffect(() => {
    if (webviewRef.current) {
      runInConsole(webviewRef.current, hashDeVista(appPageVista))
    }
  }, [appPageVista])

  // Why pedirla de nuevo y no solo recargar: si la consola murió, recargar mostraba el error del
  // navegador. Pedirla la levanta otra vez; si sigue siendo la misma, se recarga la página.
  const reload = useCallback(() => {
    if (!repoPath) {
      return
    }
    void requestDolphinConsole(() => window.api.dolphin.openConsole(repoPath)).then((result) => {
      if (!result.ok) {
        setState({ kind: 'failed', reason: dolphinFailureMessage(result) })
      } else if (result.url === url && webviewRef.current) {
        webviewRef.current.reload()
      } else {
        setState({ kind: 'ready', url: result.url })
      }
    })
  }, [repoPath, url])
  useEffect(() => {
    consoleActions.current.reload = reload
  }, [reload])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Why solo mientras no está lista: lista, la consola trae su barra (vistas, Nueva tarea,
          recargar, abrir afuera) y la marca y el proyecto ya están en la barra de la app. Dos
          barras apiladas repetían «Dolphin» y el proyecto. */}
      {url ? null : (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <DolphinMark className="size-4 shrink-0" />
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight">
            {label ?? translate('auto.components.dolphin.DolphinPage.title', 'Dolphin')}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={closePage}
              aria-label={translate('auto.components.dolphin.DolphinPage.close', 'Close Dolphin')}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>
      )}

      {elsewhere ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <DolphinMark className="size-10 text-muted-foreground/40" />
          <h2 className="font-display text-[15px] font-semibold">
            {translate(
              'auto.components.dolphin.DolphinPage.elsewhereTitle',
              'This project lives on another machine'
            )}
          </h2>
          <p className="max-w-[46ch] text-[13px] text-muted-foreground">
            {translate(
              'auto.components.dolphin.DolphinPage.elsewhereCopy',
              'Dolphin runs on this computer, next to the project folder. Open a local project to use it.'
            )}
          </p>
        </div>
      ) : !repoPath ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <DolphinMark className="size-10 text-muted-foreground/40" />
          <h2 className="font-display text-[15px] font-semibold">
            {translate('auto.components.dolphin.DolphinPage.noProjectTitle', 'Pick a project')}
          </h2>
          {repos.length > 0 ? (
            <div className="flex max-w-[480px] flex-wrap justify-center gap-2">
              {repos.map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant="outline"
                  onClick={() => setChosenRepoId(r.id)}
                >
                  {r.displayName}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="max-w-[46ch] text-[13px] text-muted-foreground">
            {translate(
              'auto.components.dolphin.DolphinPage.noProjectCopy',
              "Dolphin's console shows the active project's sowings, harvests and memory."
            )}
          </p>
          <Button size="sm" onClick={() => openModal('add-repo')}>
            {translate('auto.components.dolphin.DolphinPage.addProject', 'Add project')}
          </Button>
        </div>
      ) : state.kind === 'starting' ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          {translate(
            'auto.components.dolphin.DolphinPage.starting',
            'Starting the Dolphin console…'
          )}
        </div>
      ) : state.kind === 'failed' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="font-display text-[15px] font-semibold">
            {translate(
              'auto.components.dolphin.DolphinPage.failedTitle',
              'The Dolphin console did not start'
            )}
          </h2>
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">{state.reason}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            {translate('auto.components.dolphin.DolphinPage.retry', 'Try again')}
          </Button>
        </div>
      ) : (
        <div ref={containerRef} className="flex min-h-0 flex-1" />
      )}
    </div>
  )
}
