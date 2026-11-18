import type { Delfin, PlantillaDeDelfin } from '../../../../../shared/delfines-types'

/**
 * Lo que la página de delfines decide sin React: en qué estado se lee cada bot, cuánto del tope se
 * gastó y cómo se dice la próxima rutina. Probado aparte (delfines-formato.test.ts).
 */

export type EstadoDeDelfin =
  /** Prendido y con presupuesto: lo único que se mueve en la página. */
  | 'corriendo'
  /** El servicio de su máquina está apagado. */
  | 'parado'
  /** Cruzó el tope (o el aviso) del mes: espera tu «seguí». */
  | 'pausado'
  /** Pidió permiso y espera tu «dale». */
  | 'espera'
  /** Vive en un servidor que ahora no contesta: lo que se ve es lo último que se supo. */
  | 'sin-respuesta'

export function estadoDeDelfin(delfin: Delfin): EstadoDeDelfin {
  if (delfin.donde.tipo === 'servidor' && delfin.donde.sinRespuesta) {
    return 'sin-respuesta'
  }
  if (delfin.pausa) {
    return 'pausado'
  }
  if (delfin.pendiente) {
    return 'espera'
  }
  return delfin.corriendo ? 'corriendo' : 'parado'
}

export type Presupuesto = {
  /** De 0 a 1 contra el tope, o null si no tiene tope (no hay barra que llenar). */
  fraccion: number | null
  usado: number
  tope: number | null
  unidad: 'usd' | 'corridas'
}

/**
 * La barra se escala al tope en dólares si lo hay; si no, al de corridas. Escalarla a otra cosa
 * hacía ver lleno a un bot con medio mes por delante (idea de «Budget Guard», 21st.dev).
 */
export function presupuestoDe(delfin: Pick<Delfin, 'gasto' | 'tope'>): Presupuesto {
  if (delfin.tope?.usd) {
    return {
      fraccion: Math.min(1, delfin.gasto.usd / delfin.tope.usd),
      usado: delfin.gasto.usd,
      tope: delfin.tope.usd,
      unidad: 'usd'
    }
  }
  if (delfin.tope?.corridas) {
    return {
      fraccion: Math.min(1, delfin.gasto.corridas / delfin.tope.corridas),
      usado: delfin.gasto.corridas,
      tope: delfin.tope.corridas,
      unidad: 'corridas'
    }
  }
  return { fraccion: null, usado: delfin.gasto.usd, tope: null, unidad: 'usd' }
}

const UNIDADES: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000]
]

/** «en 12 minutos», «hace 3 horas»: la unidad más grande que entra entera. */
export function horaRelativa(iso: string, ahora: number, locale: string): string {
  const diferencia = Date.parse(iso) - ahora
  if (!Number.isFinite(diferencia)) {
    return ''
  }
  const formato = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unidad, ms] of UNIDADES) {
    if (Math.abs(diferencia) >= ms) {
      return formato.format(Math.round(diferencia / ms), unidad)
    }
  }
  return formato.format(0, 'minute')
}

/** Las plantillas, en el orden en que se ofrecen: del que más se usa al que menos. */
export const ORDEN_DE_PLANTILLAS: readonly PlantillaDeDelfin[] = [
  'vigia',
  'parte',
  'investigador',
  'escritor'
]

/** De qué plantilla salió un bot, por su id: es lo que le pone el ícono. */
export function plantillaDe(delfin: Pick<Delfin, 'id' | 'permiso'>): PlantillaDeDelfin | null {
  return ORDEN_DE_PLANTILLAS.find((plantilla) => delfin.id.startsWith(plantilla)) ?? null
}

/** Los que necesitan algo tuyo primero, después los que corren, y el resto. */
export function ordenarManada(delfines: readonly Delfin[]): Delfin[] {
  const peso: Record<EstadoDeDelfin, number> = {
    espera: 0,
    pausado: 1,
    corriendo: 2,
    'sin-respuesta': 3,
    parado: 4
  }
  return [...delfines].sort(
    (a, b) => peso[estadoDeDelfin(a)] - peso[estadoDeDelfin(b)] || a.nombre.localeCompare(b.nombre)
  )
}
