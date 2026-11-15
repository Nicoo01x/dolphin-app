import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardCard, DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'
import type { DolphinChoque } from '../../../../../shared/dolphin-choques'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { useDolphinBucles } from '../use-dolphin-bucles'
import {
  avisosVigentes,
  detectarAvisos,
  detectarAvisosDeChoques,
  encolarAvisos,
  pasarEnfriamiento,
  type Aviso,
  type MemoriaDeAvisos,
  type MemoriaDeChoques
} from './avisos-isla'

/** Cuánto queda un aviso a la vista si no lo tocás; con el puntero encima, espera. */
const DURACION_AVISO_MS = 6_000
/** Los que esperan su turno; más que eso, los más viejos ya no importan. */
const MAXIMO_AVISOS = 4
/**
 * Lo que espera un aviso para confirmarse. El parche en vivo que recibe la isla no sabe qué viste
 * (marca todo como no visto) y el tablero completo de la ventana principal, que sí lo sabe, llega
 * enseguida: sin esta espera, un agente que terminaba a la vista avisaba igual.
 */
const ESPERA_CONFIRMACION_MS = 700
/** Cada cuánto se le piden los choques a main, que los recalcula si tienen más de dos minutos. */
const INTERVALO_CHOQUES_MS = 120_000

export type AvisosDeIsla = {
  /** El que está a la vista, o null. */
  aviso: Aviso | null
  /** El que dibuja la capa: el de la vista o, mientras se va, el último. */
  enCapa: Aviso | null
  /** Cuántos esperan detrás del que está a la vista. */
  enEspera: number
  descartar: () => void
  vaciar: () => void
}

export function useChoquesDeIsla(): readonly DolphinChoque[] | null {
  const [choques, setChoques] = useState<readonly DolphinChoque[] | null>(null)
  useEffect(() => {
    const cargar = (): void => {
      const pedir = window.api.dolphin.orquestacionChoques
      if (!pedir) {
        return
      }
      void pedir()
        .then((resultado) => {
          if (resultado.disponible) {
            setChoques(resultado.repos.flatMap((repo) => repo.choques))
          } else {
            setChoques([])
          }
        })
        .catch(() => undefined)
    }
    // Why: con la isla oculta nadie ve un choque nuevo; al volver a la vista se pide ya.
    return installWindowVisibilityInterval({ run: cargar, intervalMs: INTERVALO_CHOQUES_MS })
  }, [])
  return choques
}

/**
 * La cola de avisos de la isla. Con cada tablero se pone al día: se va lo que ya viste, lo que
 * contestaste o lo que volvió a trabajar, y lo nuevo entra si sigue valiendo al confirmarse.
 */
export function useAvisosDeIsla({
  snapshot,
  choques,
  activos,
  abierta,
  encima
}: {
  snapshot: DashboardSnapshot | null
  choques?: readonly DolphinChoque[] | null
  /** Si la persona los quiere (se apagan al armar la isla). */
  activos: boolean
  abierta: boolean
  /** El puntero sobre la isla: el aviso a la vista no se va. */
  encima: boolean
}): AvisosDeIsla {
  const [cola, setCola] = useState<readonly Aviso[]>([])
  const [candidatos, setCandidatos] = useState<readonly Aviso[]>([])
  const memoria = useRef<MemoriaDeAvisos | null>(null)
  const memoriaChoques = useRef<MemoriaDeChoques | null>(null)
  const ultimasCards = useRef<readonly DashboardCard[]>([])
  const ultimosChoques = useRef<readonly DolphinChoque[]>([])
  // Cuándo se mostró cada cosa de cada agente, para el enfriamiento.
  const mostrados = useRef<ReadonlyMap<string, number>>(new Map())
  const bucles = useDolphinBucles()

  useEffect(() => {
    // El primer tablero es uno vacío de relleno: anotarlo como «lo que ya pasaba» hacía que el
    // real, al llegar, avisara de golpe de todo lo que ya esperaba.
    const tableroListo = snapshot !== null && snapshot.generatedAt !== 0
    const cards = tableroListo ? snapshot.cards : ultimasCards.current
    let nuevosAgentes: Aviso[] = []
    if (tableroListo) {
      ultimasCards.current = cards
      const resultado = detectarAvisos(memoria.current, cards, Date.now())
      memoria.current = resultado.memoria
      nuevosAgentes = resultado.avisos
    }
    const choquesActuales = choques ?? ultimosChoques.current
    let nuevosChoques: Aviso[] = []
    if (choques !== null && choques !== undefined) {
      const resultado = detectarAvisosDeChoques(memoriaChoques.current, choques, Date.now())
      memoriaChoques.current = resultado.memoria
      nuevosChoques = resultado.avisos
      ultimosChoques.current = choques
    }
    const nuevos = [...nuevosAgentes, ...nuevosChoques]
    // Un bucle deja de valer cuando el agente salió de la racha o dejó de trabajar.
    const sigueVigente = (aviso: Aviso): boolean =>
      aviso.tipo !== 'bucle' || bucles.panesActivos.has(aviso.card.paneKey)
    setCola((previa) => avisosVigentes(previa.filter(sigueVigente), cards, choquesActuales))
    setCandidatos((previos) => {
      const vigentes = avisosVigentes(previos.filter(sigueVigente), cards, choquesActuales)
      const idsPendientes = new Set([...cola, ...vigentes, ...previos].map((aviso) => aviso.id))
      const avisosDeBucles = [...bucles.avisos.values()].flatMap((bucle) => {
        const card = cards.find((cada) => cada.paneKey === bucle.paneKey)
        if (
          !card ||
          !bucles.panesActivos.has(bucle.paneKey) ||
          idsPendientes.has(bucle.id) ||
          card.bucket !== 'working'
        ) {
          return []
        }
        return [
          {
            id: bucle.id,
            tipo: 'bucle' as const,
            card,
            detectadoEn: Date.now(),
            bucle: { herramienta: bucle.toolName, repeticiones: bucle.repeticiones }
          }
        ]
      })
      // Con la isla abierta la lista ya lo muestra; con los avisos apagados, nada.
      const cambios = nuevos.length > 0 && activos && !abierta ? nuevos : []
      return activos && !abierta ? [...vigentes, ...avisosDeBucles, ...cambios] : vigentes
    })
  }, [snapshot, choques, activos, abierta, bucles, cola])

  // Lo que siguió valiendo durante la espera pasa a la cola (los tableros de mientras ya sacaron
  // lo que no).
  useEffect(() => {
    if (candidatos.length === 0) {
      return
    }
    const primero = Math.min(...candidatos.map((candidato) => candidato.detectadoEn))
    const vence = setTimeout(
      () => {
        const ahora = Date.now()
        const vencidos = candidatos.filter(
          (candidato) => ahora - candidato.detectadoEn >= ESPERA_CONFIRMACION_MS
        )
        const ids = new Set(vencidos.map((candidato) => candidato.id))
        // Contra el último tablero: uno que llegó justo antes del vencimiento pudo descartarlos sin
        // que este cierre se entere.
        const { pasan, mostrados: siguientes } = pasarEnfriamiento(
          avisosVigentes(vencidos, ultimasCards.current, ultimosChoques.current),
          mostrados.current,
          ahora
        )
        mostrados.current = siguientes
        setCandidatos((previos) => previos.filter((candidato) => !ids.has(candidato.id)))
        if (pasan.length > 0) {
          setCola((previa) => encolarAvisos(previa, pasan, MAXIMO_AVISOS))
        }
      },
      Math.max(0, primero + ESPERA_CONFIRMACION_MS - Date.now())
    )
    return () => clearTimeout(vence)
  }, [candidatos])

  const aviso = cola[0] ?? null
  const descartar = useCallback((): void => setCola((previa) => previa.slice(1)), [])
  const vaciar = useCallback((): void => {
    setCola([])
    setCandidatos([])
  }, [])

  // Un aviso se va solo; con el puntero encima o la isla abierta, espera. Va por id: la tarjeta
  // se renueva con cada tablero y eso no tiene que reiniciar la cuenta.
  const idDeAviso = aviso?.id ?? null
  useEffect(() => {
    if (!idDeAviso || abierta || encima) {
      return
    }
    const vence = setTimeout(descartar, DURACION_AVISO_MS)
    return () => clearTimeout(vence)
  }, [idDeAviso, abierta, encima, descartar])

  // La capa sigue mostrando el último mientras se va: vaciada de golpe, la forma se achicaría
  // sobre nada.
  const [ultimo, setUltimo] = useState<Aviso | null>(null)
  if (aviso && aviso !== ultimo) {
    setUltimo(aviso)
  }

  return {
    aviso,
    enCapa: aviso ?? ultimo,
    enEspera: Math.max(cola.length - 1, 0),
    descartar,
    vaciar
  }
}
