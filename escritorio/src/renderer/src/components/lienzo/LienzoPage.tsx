import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import {
  fitRect,
  findFreeSpot,
  rectUnion,
  resizeRect,
  screenToWorld,
  snapRect,
  snapResize,
  visibleWorldRect,
  type Guide,
  type ResizeHandle
} from './canvas'
import { siguienteZoom } from './camara'
import { useCamaraDelLienzo } from './use-camara-del-lienzo'
import {
  BarraDelLienzo,
  EsquinaDelZoom,
  Guias,
  LO_QUE_TAPA,
  RailDeHerramientas,
  RailDeVentanas,
  SalidaDelLienzo,
  SE_ENCIENDE,
  VIDRIO
} from './ChromeDelLienzo'
import {
  IslaDelProyecto,
  nombreDeRama,
  type OtroProyecto,
  type RamaDelProyecto
} from './IslaDelProyecto'
import { ContenidoDeLaVentana } from './ContenidoDeLaVentana'
import { FondoDelLienzo } from './FondoDelLienzo'
import { Minimapa } from './Minimapa'
import { guardarDisposicion, leerDisposicion } from './lienzo-disposicion'
import {
  agrandarOVolver,
  conRect,
  LIMITES,
  losOtros,
  rectsDe,
  traerAlFrente,
  type PanelDelLienzo
} from './lienzo-paneles'
import {
  iconoDe,
  paginasDelProyecto,
  tamanoDe,
  tipoDe,
  tituloDe,
  type QueAbrir
} from './paneles-que-se-abren'
import { limpiarDestinos } from './portales-del-lienzo'
import { PanelFlotante } from './PanelFlotante'
import { TEMA_DEL_LIENZO } from './tema-del-lienzo'

/**
 * El lienzo: el escritorio de Dolphin.
 *
 * En vez de una pantalla partida en paneles fijos, un plano donde cada cosa es una ventana que se
 * mueve, se estira y se acerca. Es un MODO: ocupa la ventana entera (sin la barra lateral, que al
 * costado lo hacía parecer una vista más) y se sale desde adentro.
 *
 * La geometría está portada de Tallow (ver `canvas/`), que es el escritorio espacial que Nico ya
 * tenía hecho: el zoom que se va al puntero, el imán con guías, la inercia al soltar, el lugar
 * libre para la ventana nueva y el nivel de detalle por zoom.
 *
 * Las ventanas muestran la consola del proyecto activo, cada una en una vista distinta, así que
 * esto no es una maqueta: adentro está el producto.
 */

/** Cuánto se imanta una ventana a otra, en píxeles de pantalla. */
const IMAN = 8
/** Una sola instancia: devolver `[]` nuevo desde un selector vuelve a dibujar en cada lectura. */
const SIN_WORKTREES: never[] = []
const TAMANO_NUEVA = { width: 560, height: 420 }

export default function LienzoPage(): React.JSX.Element {
  const repo = useActiveRepo()
  const repoPath = repo?.path ?? null
  // El worktree, para decir en la isla de arriba en qué rama estás: el lienzo no tiene la barra
  // lateral del Dolphin de siempre, así que si no lo dice acá no lo dice nadie.
  const worktree = useActiveWorktree()
  // Y las otras ramas del proyecto, para poder cambiar sin salir del modo.
  //
  // El `map` va en un `useMemo` y NO adentro del selector: adentro, cada lectura del store
  // devolvía objetos nuevos, la comparación superficial los veía distintos y el componente se
  // volvía a dibujar para siempre («Maximum update depth exceeded», con la pantalla del lienzo
  // caída). Del store salen las dos cosas que sí son estables: el array del repo y cuál está
  // activo.
  const worktreesDelRepo = useAppStore((s) =>
    repo ? (selectWorktreesByRepo(s)[repo.id] ?? SIN_WORKTREES) : SIN_WORKTREES
  )
  const worktreeActivoId = useAppStore((s) => s.activeWorktreeId)
  const ramasDelProyecto = useMemo<RamaDelProyecto[]>(
    () =>
      worktreesDelRepo.map((w) => ({
        id: w.id,
        nombre: nombreDeRama(w.branch) ?? w.path,
        activa: w.id === worktreeActivoId
      })),
    [worktreesDelRepo, worktreeActivoId]
  )
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const elegirRama = useCallback(
    (id: string) => {
      setActiveWorktree(id)
    },
    [setActiveWorktree]
  )

  // Los proyectos abiertos, para la otra miga de la isla.
  const repos = useAppStore((s) => s.repos)
  const proyectosAbiertos = useMemo<OtroProyecto[]>(
    () => repos.map((r) => ({ id: r.id, nombre: r.displayName, activo: r.id === repo?.id })),
    [repos, repo?.id]
  )

  /**
   * Cambiar de proyecto es, por abajo, elegir uno de sus worktrees: Dolphin trabaja siempre
   * sobre uno. Se toma el último que visitaste de ese proyecto —volver a un proyecto es volver
   * a donde lo dejaste— y, si nunca entraste, el primero que tenga.
   */
  const elegirProyecto = useCallback(
    (repoId: string) => {
      const estado = useAppStore.getState()
      const suyos = selectWorktreesByRepo(estado)[repoId] ?? SIN_WORKTREES
      const visto = estado.lastVisitedAtByWorktreeId
      const cual = suyos.toSorted((a, b) => (visto[b.id] ?? 0) - (visto[a.id] ?? 0)).at(0)
      if (cual) {
        setActiveWorktree(cual.id)
      }
    },
    [setActiveWorktree]
  )
  // El worktree activo: es lo que una terminal del lienzo necesita para abrir su PTY donde
  // corresponde. Sin proyecto elegido no hay ninguno, y la ventana lo dice adentro.
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  // El modo se apaga desde adentro: acá no hay barra lateral para volver, así que sin esto se
  // entra y no se sale. La vista queda guardada, así que la app vuelve a abrir donde la dejaste.
  const setActiveView = useAppStore((s) => s.setActiveView)

  const [base, setBase] = useState<string | null>(null)
  const [falla, setFalla] = useState<string | null>(null)
  const [paneles, setPaneles] = useState<readonly PanelDelLienzo[]>([])
  const [guias, setGuias] = useState<readonly Guide[]>([])
  const plano = useRef<HTMLDivElement>(null)
  /** Dónde estaba cada ventana al empezar el gesto: los deltas van contra eso. */
  const alEmpezar = useRef<Map<string, PanelDelLienzo['rect']>>(new Map())
  const yaAbrio = useRef(false)
  const yaAcomodo = useRef(false)

  const medida = (): { width: number; height: number } => {
    const caja = plano.current?.getBoundingClientRect()
    return { width: caja?.width ?? 1200, height: caja?.height ?? 800 }
  }

  // Cómo se mira el plano: la rueda, el arrastre con inercia y los vuelos del mapa.
  const {
    vista,
    setVista,
    alRodar,
    alBajarEnElFondo,
    alMoverElFondo,
    alSoltarElFondo,
    volarA,
    revelarRect,
    zoomAlMedio
  } = useCamaraDelLienzo({ plano, medida })

  // La consola del proyecto activo: una por carpeta, la levanta el proceso principal.
  useEffect(() => {
    if (!repoPath) {
      return
    }
    let vive = true
    void window.api.dolphin.openConsole(repoPath).then(
      (r) => {
        if (!vive) {
          return
        }
        if (r.ok) {
          setBase(r.url)
        } else {
          setFalla('No pude levantar la consola de este proyecto.')
        }
      },
      () => vive && setFalla('No pude levantar la consola de este proyecto.')
    )
    return () => {
      vive = false
    }
  }, [repoPath])

  const abrir = useCallback(
    (pedida: QueAbrir) => {
      setPaneles((previos) => {
        const tamano = tamanoDe(pedida) ?? TAMANO_NUEVA
        // En el medio de lo que se está mirando, y si ahí hay algo, al lado: una ventana nueva
        // exactamente encima de otra parece que no se abrió.
        const centro = screenToWorld(vista, { x: medida().width / 2, y: medida().height / 2 })
        const donde = findFreeSpot(
          tamano,
          { x: centro.x - tamano.width / 2, y: centro.y - tamano.height / 2 },
          rectsDe(previos)
        )
        return [
          ...previos,
          {
            id: `${pedida}-${Date.now()}`,
            tipo: tipoDe(pedida),
            titulo: tituloDe(pedida),
            subtitulo: pedida,
            rect: { ...donde, ...tamano }
          }
        ]
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `vista` se lee al abrir, no suscribe
    },
    [vista]
  )

  /**
   * Tocar una ventana en el rail: al frente Y a la vista.
   *
   * Traerla al frente sola no alcanza. Si está fuera de la pantalla —y en un plano grande pasa
   * todo el tiempo— el botón parecía no hacer nada.
   */
  const irALaVentana = useCallback(
    (id: string) => {
      setPaneles((p) => traerAlFrente(p, id))
      const cual = paneles.find((x) => x.id === id)
      if (cual) {
        revelarRect(cual.rect)
      }
    },
    [paneles, revelarRect]
  )

  /** La regla del rail de la derecha: si esa página ya está en el plano, te lleva; si no, la abre. */
  const mostrarOAbrir = useCallback(
    (vista: QueAbrir) => {
      const yaEsta = paneles.find((p) => p.subtitulo === vista)
      if (yaEsta) {
        irALaVentana(yaEsta.id)
        return
      }
      abrir(vista)
    },
    [paneles, irALaVentana, abrir]
  )

  // Cómo lo dejaste la última vez; y la primera vez, las tres de siempre. Un lienzo vacío no dice
  // qué es esto, y van aunque la consola no haya levantado todavía —o no haya proyecto—: cada
  // ventana cuenta adentro qué falta, que es mejor que un plano pelado.
  useEffect(() => {
    if (yaAbrio.current) {
      return
    }
    yaAbrio.current = true
    const guardado = leerDisposicion()
    if (guardado) {
      setPaneles(guardado.paneles)
      setVista(guardado.vista)
      yaAcomodo.current = true
      return
    }
    // La historia de Dolphin en tres ventanas: pedís, mirás cómo corre, ves la rama que quedó.
    setPaneles([
      {
        id: 'nueva',
        tipo: 'consola',
        titulo: 'Largar un agente',
        subtitulo: 'nueva',
        rect: { x: 0, y: 0, width: 640, height: 480 }
      },
      {
        id: 'vivo',
        tipo: 'consola',
        titulo: 'En vivo',
        subtitulo: 'vivo',
        rect: { x: 684, y: 56, width: 560, height: 400 }
      },
      {
        id: 'git',
        tipo: 'consola',
        titulo: 'Git',
        subtitulo: 'git',
        rect: { x: 228, y: 516, width: 720, height: 380 }
      }
    ])
  }, [setVista])

  /**
   * Agranda una ventana a toda la vista, o la devuelve a donde estaba.
   *
   * Lo que se ve se calcula en coordenadas del plano y con lo que tapa el chrome descontado: una
   * ventana agrandada hasta abajo del dock se comería su propia barra de zoom. Y pasa al frente,
   * porque agrandar algo que queda debajo de otra cosa no agranda nada.
   */
  const agrandarPanel = useCallback(
    (id: string) => {
      const caja = medida()
      const hueco = visibleWorldRect(vista, {
        width: caja.width - LO_QUE_TAPA.left - LO_QUE_TAPA.right,
        height: caja.height - LO_QUE_TAPA.top - LO_QUE_TAPA.bottom
      })
      const conMargen = {
        x: hueco.x + LO_QUE_TAPA.left / vista.zoom + 12,
        y: hueco.y + LO_QUE_TAPA.top / vista.zoom + 12,
        width: Math.max(LIMITES.minWidth, hueco.width - 24),
        height: Math.max(LIMITES.minHeight, hueco.height - 24)
      }
      setPaneles((previos) => traerAlFrente(agrandarOVolver(previos, id, conMargen), id))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vista` se lee al tocar, no suscribe
    [vista]
  )

  const verTodo = useCallback(() => {
    const todo = rectUnion(rectsDe(paneles))
    if (todo) {
      setVista(fitRect(todo, medida(), 48, 1, 0.3, LO_QUE_TAPA))
    }
  }, [paneles, setVista])

  // Que entren al abrir. Solo la primera vez: si venís de una disposición guardada, se respeta
  // dónde la dejaste.
  useEffect(() => {
    if (yaAcomodo.current || paneles.length === 0) {
      return
    }
    yaAcomodo.current = true
    verTodo()
  }, [paneles, verTodo])

  // Se guarda como quedó, pero no en cada píxel del arrastre: un respiro después de soltar.
  useEffect(() => {
    if (!yaAbrio.current || paneles.length === 0) {
      return
    }
    const cuando = setTimeout(() => guardarDisposicion({ paneles, vista }), 400)
    return () => {
      clearTimeout(cuando)
    }
  }, [paneles, vista])

  // Al salir del lienzo se sueltan los destinos de las terminales porteadas. Sin esto, la vista
  // de terminal normal se queda sin sus panes: siguen reclamadas por ventanas que ya no existen.
  useEffect(() => () => limpiarDestinos(), [])

  const rectDesdeDondeEmpezo = useCallback(
    (id: string): PanelDelLienzo['rect'] | null => {
      const guardado = alEmpezar.current.get(id)
      if (guardado) {
        return guardado
      }
      const ahora = paneles.find((p) => p.id === id)?.rect
      if (ahora) {
        alEmpezar.current.set(id, ahora)
      }
      return ahora ?? null
    },
    [paneles]
  )

  const moverPanel = useCallback(
    (id: string, dx: number, dy: number) => {
      const inicio = rectDesdeDondeEmpezo(id)
      if (!inicio) {
        return
      }
      const movido = { ...inicio, x: inicio.x + dx, y: inicio.y + dy }
      const iman = snapRect(movido, losOtros(paneles, id), IMAN / vista.zoom)
      setGuias(iman.guides)
      setPaneles((p) => conRect(p, id, { ...movido, x: movido.x + iman.dx, y: movido.y + iman.dy }))
    },
    [paneles, rectDesdeDondeEmpezo, vista.zoom]
  )

  const estirarPanel = useCallback(
    (id: string, borde: ResizeHandle, dx: number, dy: number) => {
      const inicio = rectDesdeDondeEmpezo(id)
      if (!inicio) {
        return
      }
      const estirado = resizeRect(inicio, borde, dx, dy, LIMITES)
      const iman = snapResize(estirado, borde, losOtros(paneles, id), IMAN / vista.zoom)
      setGuias(iman.guides)
      setPaneles((p) => conRect(p, id, iman.rect))
    },
    [paneles, rectDesdeDondeEmpezo, vista.zoom]
  )

  const soltarPanel = useCallback(() => {
    alEmpezar.current.clear()
    setGuias([])
  }, [])

  const oscuro = document.documentElement.classList.contains('dark')
  const activo = paneles.at(-1)?.id ?? null
  const aLaVista = visibleWorldRect(vista, medida())

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={TEMA_DEL_LIENZO}>
      <FondoDelLienzo vista={vista} />

      <div
        ref={plano}
        onWheel={alRodar}
        onPointerDown={alBajarEnElFondo}
        onPointerMove={alMoverElFondo}
        onPointerUp={alSoltarElFondo}
        onPointerCancel={alSoltarElFondo}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      >
        {paneles.map((panel) => (
          <PanelFlotante
            key={panel.id}
            panel={panel}
            vista={vista}
            activo={panel.id === activo}
            icono={iconoDe(panel.subtitulo ?? '')}
            onTocar={() => setPaneles((p) => traerAlFrente(p, panel.id))}
            onMover={(dx, dy) => moverPanel(panel.id, dx, dy)}
            onEstirar={(borde, dx, dy) => estirarPanel(panel.id, borde, dx, dy)}
            onSoltar={soltarPanel}
            onCerrar={() => setPaneles((p) => p.filter((x) => x.id !== panel.id))}
            onMaximizar={() => agrandarPanel(panel.id)}
            maximizada={panel.antesDeAgrandar !== undefined}
          >
            <ContenidoDeLaVentana
              panel={panel}
              vista={vista}
              aLaVista={aLaVista}
              worktreeId={worktreeId}
              base={base}
              falla={falla}
              repoPath={repoPath}
              oscuro={oscuro}
              alFrente={panel.id === activo}
              alCerrar={() => setPaneles((p) => p.filter((x) => x.id !== panel.id))}
            />
          </PanelFlotante>
        ))}
        <Guias guias={guias} vista={vista} />
      </div>

      {/* Lo de alrededor flota sobre el plano y no se acerca con él: es el chrome, no la escena. */}
      <div className="pointer-events-none absolute inset-0">
        <IslaDelProyecto
          proyecto={repo?.displayName ?? null}
          proyectos={proyectosAbiertos}
          rama={nombreDeRama(worktree?.branch)}
          ramas={ramasDelProyecto}
          vidrio={VIDRIO}
          seEnciende={SE_ENCIENDE}
          alElegirProyecto={elegirProyecto}
          alElegirRama={elegirRama}
        />
        <RailDeVentanas paneles={paneles} alTocar={irALaVentana} />
        <RailDeHerramientas cuales={paginasDelProyecto()} alMostrarOAbrir={mostrarOAbrir} />
        <BarraDelLienzo alAbrir={abrir} />
        <SalidaDelLienzo alSalir={() => setActiveView('terminal')} />
        <EsquinaDelZoom
          zoom={vista.zoom}
          alAlejar={() => zoomAlMedio(siguienteZoom(vista.zoom, -1))}
          alAcercar={() => zoomAlMedio(siguienteZoom(vista.zoom, 1))}
          alTamanoReal={() => zoomAlMedio(1)}
          alVerTodo={verTodo}
          mapa={
            <Minimapa
              paneles={paneles}
              vista={vista}
              medida={medida()}
              activo={activo}
              alIr={volarA}
            />
          }
        />
      </div>
    </div>
  )
}
