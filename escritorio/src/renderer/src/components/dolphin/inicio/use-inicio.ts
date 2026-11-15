import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/index'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { useWorktreeActivityStatuses } from '@/components/sidebar/workspace-card/activity/use-worktree-activity-statuses'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import { proyectosDelTablero } from '../tablero/proyectos-del-tablero'
import type { ProyectoDelTablero } from '../tablero/TableroDelInicio'
import { useLecturaDelTablero, type LecturaDelTablero } from '../tablero/use-tablero'
import {
  esCarpetaPersonal,
  espaciosDelInicio,
  loDeHoy,
  loQueTeNecesita,
  type EspacioConEstado,
  type EspacioDelInicio
} from './estado-del-inicio'

export type DatosDelInicio = {
  /** Los proyectos de la persona: sin la carpeta personal que la base agrega sola. */
  repos: readonly { id: string; displayName: string }[]
  /** Falso mientras no se sabe cuál es la carpeta personal: no se puede decidir qué mostrar. */
  listo: boolean
  espacios: EspacioDelInicio[]
  estados: ReadonlyMap<string, WorktreeStatus>
  teNecesita: EspacioConEstado[]
  hoy: EspacioConEstado[]
  /** Cuándo se abrió cada espacio: de eso sale el mapa de actividad. */
  cuandoTrabajaste: number[]
  proyectos: ProyectoDelTablero[]
  /** Leyendo, ninguno tiene tarjetas, no se pudo leer, o el tablero de un proyecto. */
  tablero: LecturaDelTablero
  /** La hora contra la que se decide qué es «hoy». */
  ahora: number
}

/** La hora de referencia de «hoy»: se fija al montar y se renueva al volver a la ventana. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const alVolver = (): void => setAhora(Date.now())
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [])
  return ahora
}

/** La carpeta personal según el proceso principal; `undefined` mientras se pregunta. */
function useCarpetaPersonal(): string | null | undefined {
  const [carpeta, setCarpeta] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vigente = true
    const preguntar = window.api?.dolphin?.carpetaPersonal
    // Sin el puente (cliente web, o un preload viejo) no hay home que comparar: nada se excluye.
    void (preguntar ? preguntar().catch(() => null) : Promise.resolve(null)).then((ruta) => {
      if (vigente) {
        setCarpeta(ruta ?? null)
      }
    })
    return () => {
      vigente = false
    }
  }, [])
  return carpeta
}

/** Todo lo que el inicio sabe de verdad, leído de los mismos lugares que la barra lateral. */
export function useDatosDelInicio(): { datos: DatosDelInicio; releerTablero: () => void } {
  const todos = useAppStore((s) => s.repos)
  const todosLosEspacios = useAppStore(selectWorktreesByRepo)
  const carpetaPersonal = useCarpetaPersonal()
  const ahora = useAhora()

  // Fuera la carpeta personal: no es un proyecto que la persona eligió, y «~» no le dice nada. Con
  // sólo esa carpeta, el inicio es el de un perfil nuevo.
  const repos = useMemo(() => {
    const sinMayusculas = window.api?.platform?.get?.().platform !== 'linux'
    return todos.filter((repo) => !esCarpetaPersonal(repo, carpetaPersonal ?? null, sinMayusculas))
  }, [todos, carpetaPersonal])
  const worktreesPorRepo = useMemo(
    () => Object.fromEntries(repos.map((repo) => [repo.id, todosLosEspacios[repo.id] ?? []])),
    [repos, todosLosEspacios]
  )

  const espacios = useMemo(
    () => espaciosDelInicio(repos, worktreesPorRepo),
    [repos, worktreesPorRepo]
  )
  // El hook de estados compara por identidad del array: tiene que ser el mismo entre renders.
  const ids = useMemo(() => espacios.map((espacio) => espacio.id), [espacios])
  const estados = useWorktreeActivityStatuses(ids)

  const teNecesita = useMemo(() => loQueTeNecesita(espacios, estados), [espacios, estados])
  const hoy = useMemo(
    () => loDeHoy(espacios, estados, ahora, new Set(teNecesita.map(({ espacio }) => espacio.id))),
    [espacios, estados, ahora, teNecesita]
  )
  // Con los archivados también: el mapa es historia. Un espacio sin fecha (de antes de que se
  // guardara) no entra: contarlo como hoy sería inventar un día.
  const cuandoTrabajaste = useMemo(
    () =>
      Object.values(worktreesPorRepo)
        .flat()
        .flatMap((worktree) =>
          typeof worktree.createdAt === 'number' ? [worktree.createdAt] : []
        ),
    [worktreesPorRepo]
  )

  const proyectos = useMemo(
    () => proyectosDelTablero(repos, worktreesPorRepo),
    [repos, worktreesPorRepo]
  )
  const worktreeIds = useMemo(() => proyectos.map((p) => p.worktreeId), [proyectos])
  const { tablero, releer } = useLecturaDelTablero(worktreeIds)

  return {
    datos: {
      repos,
      listo: carpetaPersonal !== undefined,
      espacios,
      estados,
      teNecesita,
      hoy,
      cuandoTrabajaste,
      proyectos,
      tablero,
      ahora
    },
    releerTablero: releer
  }
}
