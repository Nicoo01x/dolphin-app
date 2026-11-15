import { readFile, rename, writeFile } from 'node:fs/promises'
import type { PreferenciasDeIsla } from '../../shared/dolphin-isla-types'

export type GuardaDePreferencias = {
  /** Null si el archivo existe y no se puede leer: la isla deja la nota en solo lectura. */
  leer: () => Promise<PreferenciasDeIsla | null>
  guardar: (parcial: PreferenciasDeIsla) => Promise<void>
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const codigo = (error: unknown): string | undefined => (error as NodeJS.ErrnoException)?.code
const esperar = (ms: number): Promise<void> => new Promise((listo) => setTimeout(listo, ms))

// En Windows un antivirus o el indexador pueden tener el archivo abierto un rato: se reintenta
// (como la escritura de dolphin-app, que lo midió) en vez de perder el cambio.
const OCUPADO = new Set(['EPERM', 'EBUSY', 'EACCES'])
const REINTENTOS = 15
const PAUSA_MS = 200

async function conReintento<T>(hacer: () => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await hacer()
    } catch (error) {
      if (intento >= REINTENTOS || !OCUPADO.has(codigo(error) ?? '')) {
        throw error
      }
      await esperar(PAUSA_MS)
    }
  }
}

/**
 * Lo guardado, o null si el archivo existe y no se pudo leer: ahí no se escribe encima, porque se
 * pisaría lo que tiene (tocar la nota borraría el armado). Que no exista o esté roto es arrancar de cero.
 */
async function leerDelDisco(ruta: string): Promise<PreferenciasDeIsla | null> {
  try {
    const leido: unknown = JSON.parse(await conReintento(() => readFile(ruta, 'utf8')))
    return esObjeto(leido) ? (leido as PreferenciasDeIsla) : {}
  } catch (error) {
    return codigo(error) === 'ENOENT' || error instanceof SyntaxError ? {} : null
  }
}

/**
 * Las preferencias de la isla (cómo se arma y su nota) en un archivo propio. Se escribe en cada
 * cambio, de a una escritura por vez: si llega otra mientras escribe, vuelve a escribir al terminar
 * con lo último. Escribe en un temporal y lo renombra, así un corte no deja el archivo a medias.
 */
export function crearPreferenciasDeIsla(ruta: string): GuardaDePreferencias {
  let datos: PreferenciasDeIsla | null = null
  // Lo que se cambió mientras el archivo no se podía leer: se suma cuando se pueda.
  let pendiente: PreferenciasDeIsla = {}
  // Una sola lectura del disco aunque lleguen varios pedidos juntos.
  let lectura: Promise<PreferenciasDeIsla | null> | null = null
  let escribiendo: Promise<void> | null = null
  let otraVez = false

  const leer = async (): Promise<PreferenciasDeIsla | null> => {
    if (datos) {
      return datos
    }
    lectura ??= leerDelDisco(ruta)
    const leidas = await lectura
    if (leidas === null) {
      // La próxima vez se vuelve a intentar.
      lectura = null
      return null
    }
    datos ??= { ...leidas, ...pendiente }
    return datos
  }

  const volcar = (): Promise<void> => {
    if (escribiendo) {
      otraVez = true
      return escribiendo
    }
    escribiendo = (async () => {
      do {
        otraVez = false
        try {
          const temporal = `${ruta}.tmp`
          await conReintento(() => writeFile(temporal, JSON.stringify(datos ?? {}), 'utf8'))
          await conReintento(() => rename(temporal, ruta))
        } catch (error) {
          // Lo último sigue en memoria: el próximo cambio lo vuelve a intentar entero.
          console.warn('[dolphin] no se pudo guardar la isla:', error)
        }
      } while (otraVez)
    })().finally(() => {
      escribiendo = null
    })
    return escribiendo
  }

  const guardar = async (parcial: PreferenciasDeIsla): Promise<void> => {
    pendiente = { ...pendiente, ...parcial }
    await leer()
    if (!datos) {
      return
    }
    // Se suma sobre lo que haya en memoria al volver de la espera, no sobre una copia de antes.
    datos = { ...datos, ...pendiente }
    pendiente = {}
    await volcar()
  }

  return { leer, guardar }
}
