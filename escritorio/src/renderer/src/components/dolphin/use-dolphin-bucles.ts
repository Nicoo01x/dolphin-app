import { useSyncExternalStore } from 'react'
import type { DolphinBucleAviso, DolphinBucleEvento } from '../../../../shared/dolphin-bucles-types'

type Estado = {
  avisos: ReadonlyMap<string, DolphinBucleAviso>
  panesActivos: ReadonlySet<string>
}

let estado: Estado = { avisos: new Map(), panesActivos: new Set() }
const suscriptores = new Set<() => void>()
let desuscribir: (() => void) | null = null

function publicar(evento: DolphinBucleEvento): void {
  if (evento.tipo === 'detectado') {
    const avisos = new Map(estado.avisos)
    avisos.set(evento.aviso.id, evento.aviso)
    const panesActivos = new Set(estado.panesActivos)
    panesActivos.add(evento.aviso.paneKey)
    estado = { avisos, panesActivos }
  } else {
    const panesActivos = new Set(estado.panesActivos)
    panesActivos.delete(evento.paneKey)
    const avisos = new Map(
      [...estado.avisos].filter(([, aviso]) => aviso.paneKey !== evento.paneKey)
    )
    estado = { avisos, panesActivos }
  }
  for (const suscriptor of suscriptores) {
    suscriptor()
  }
}

function conectar(): void {
  if (desuscribir || typeof window === 'undefined') {
    return
  }
  const api = window.api
  if (!api?.dolphin) {
    return
  }
  desuscribir = api.dolphin.onBucle?.(publicar) ?? null
}

function suscribirse(suscriptor: () => void): () => void {
  conectar()
  suscriptores.add(suscriptor)
  return () => suscriptores.delete(suscriptor)
}

const leerEstado = (): Estado => estado

export function useDolphinBucles(): Estado {
  return useSyncExternalStore(suscribirse, leerEstado, leerEstado)
}
