import { useEffect, useSyncExternalStore } from 'react'
import { esCandidatoWinForms } from '../../../../shared/winforms/winforms-form-detection'

/**
 * Qué .cs del explorador son formularios. El explorador sólo tiene nombres: un `X.cs` con su
 * `X.Designer.cs` al lado es candidato, y main lee el código (en lotes, una vez por archivo) para
 * separar formularios y controles de reportes y DataSets, que también tienen diseñador.
 */

export type TipoWinForms = 'formulario' | 'control' | null

const conocidos = new Map<string, TipoWinForms>()
const pendientes = new Set<string>()
const oyentes = new Set<() => void>()
let lote: ReturnType<typeof setTimeout> | null = null
const hermanosPorLista = new WeakMap<readonly { name: string }[], Set<string>>()

function avisar(): void {
  oyentes.forEach((oyente) => oyente())
}

function pedirLote(): void {
  lote = null
  const api = window.api?.winforms
  const rutas = [...pendientes].slice(0, 200)
  rutas.forEach((r) => pendientes.delete(r))
  if (!api || rutas.length === 0) {
    return
  }
  void api
    .clasificar(rutas)
    .then((resultado) => {
      for (const ruta of rutas) {
        conocidos.set(ruta, resultado[ruta] ?? null)
      }
    })
    .catch(() => rutas.forEach((ruta) => conocidos.set(ruta, null)))
    .finally(() => {
      avisar()
      if (pendientes.size > 0 && !lote) {
        lote = setTimeout(pedirLote, 60)
      }
    })
}

function pedir(ruta: string): void {
  if (conocidos.has(ruta) || pendientes.has(ruta)) {
    return
  }
  pendientes.add(ruta)
  lote ??= setTimeout(pedirLote, 60)
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

/** Si la fila es un candidato, pide clasificarla y devuelve lo que se sabe (undefined: todavía no). */
export function useTipoWinForms(ruta: string, candidato: boolean): TipoWinForms | undefined {
  useEffect(() => {
    if (candidato) {
      pedir(ruta)
    }
  }, [ruta, candidato])
  return useSyncExternalStore(suscribir, () => (candidato ? conocidos.get(ruta) : null))
}

/** Candidato por nombre, con los nombres de la carpeta cacheados por listado (filas virtualizadas). */
export function esCandidatoEnCarpeta(
  nombre: string,
  hermanos: readonly { name: string }[] | undefined
): boolean {
  if (!hermanos || !/\.cs$/i.test(nombre) || /\.Designer\.cs$/i.test(nombre)) {
    return false
  }
  let nombres = hermanosPorLista.get(hermanos)
  if (!nombres) {
    nombres = new Set(hermanos.map((h) => h.name.toLowerCase()))
    hermanosPorLista.set(hermanos, nombres)
  }
  return esCandidatoWinForms(nombre, nombres)
}
