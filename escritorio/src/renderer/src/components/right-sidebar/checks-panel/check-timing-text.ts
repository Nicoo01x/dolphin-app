import type { CheckTiming } from '../../../../../shared/github/check-timing'

/**
 * Cómo se escribe el tiempo de un check: `3m 12s · hace 2 h`.
 *
 * Why con `Intl` y no con letras escritas a mano: «m» y «s» no son «m» y «s» en todos los
 * idiomas, y «hace 2 h» tampoco se arma pegando palabras. Las dos formas salen del mismo locale
 * que ya usa el resto de la app, así que no hay claves nuevas que traducir.
 */
const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

type Unidad = 'second' | 'minute' | 'hour' | 'day'

const cacheDeUnidades = new Map<string, Intl.NumberFormat>()
let cacheRelativo: { locale: string; formato: Intl.RelativeTimeFormat } | null = null

function numeroConUnidad(locale: string, unidad: Unidad): Intl.NumberFormat {
  const clave = `${locale}:${unidad}`
  const guardado = cacheDeUnidades.get(clave)
  if (guardado) {
    return guardado
  }
  const formato = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: unidad,
    unitDisplay: 'narrow',
    maximumFractionDigits: 0
  })
  cacheDeUnidades.set(clave, formato)
  return formato
}

/**
 * Why `short` y no `narrow`, que sería un carácter más corto en inglés: en francés el narrow de
 * CLDR es `-2 h`, un signo menos suelto que no se lee como «hace dos horas». El short dice
 * `il y a 2 h`, y en los otros seis idiomas que trae la app es igual o casi igual al narrow.
 */
function relativo(locale: string): Intl.RelativeTimeFormat {
  if (!cacheRelativo || cacheRelativo.locale !== locale) {
    cacheRelativo = {
      locale,
      formato: new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' })
    }
  }
  return cacheRelativo.formato
}

/**
 * `3m 12s`, `2h 5m`, `45s`.
 *
 * Why dos unidades y no tres: con tres, la fila se ensancha justo en el caso que menos importa
 * —un check de horas— y el nombre del check pierde lugar. Y el resto se redondea hacia abajo a
 * propósito: un check que tardó `1m 59s` no tardó dos minutos.
 */
export function textoDeDuracion(ms: number, locale: string): string {
  if (ms < MINUTO) {
    return numeroConUnidad(locale, 'second').format(Math.floor(ms / SEGUNDO))
  }
  if (ms < HORA) {
    const minutos = Math.floor(ms / MINUTO)
    const segundos = Math.floor((ms % MINUTO) / SEGUNDO)
    const texto = numeroConUnidad(locale, 'minute').format(minutos)
    return segundos === 0 ? texto : `${texto} ${numeroConUnidad(locale, 'second').format(segundos)}`
  }
  const horas = Math.floor(ms / HORA)
  const minutos = Math.floor((ms % HORA) / MINUTO)
  const texto = numeroConUnidad(locale, 'hour').format(horas)
  return minutos === 0 ? texto : `${texto} ${numeroConUnidad(locale, 'minute').format(minutos)}`
}

/** `hace 2 h`. Debajo del minuto no se cuentan segundos: la fila cambiaría cada vez que mirás. */
export function textoDeEdad(ms: number, locale: string): string {
  const formato = relativo(locale)
  if (ms < MINUTO) {
    return formato.format(0, 'minute')
  }
  if (ms < HORA) {
    return formato.format(-Math.floor(ms / MINUTO), 'minute')
  }
  if (ms < DIA) {
    return formato.format(-Math.floor(ms / HORA), 'hour')
  }
  return formato.format(-Math.floor(ms / DIA), 'day')
}

/**
 * Las dos piezas de la fila, separadas para que la angosta pueda soltar la duración.
 *
 * Why se suelta la duración y no la edad: lo que decide si una fila roja importa es cuándo
 * pasó, no cuánto tardó. Un fallo de hace dos horas y uno de hace un minuto se ven igual sin
 * esto, que es justo el problema que esta pieza vino a resolver.
 */
export function textosDelTiempoDeCheck(
  timing: CheckTiming,
  locale: string
): { duracion: string | null; edad: string | null } {
  return {
    duracion: timing.duracionMs === null ? null : textoDeDuracion(timing.duracionMs, locale),
    edad: timing.desdeElFinalMs === null ? null : textoDeEdad(timing.desdeElFinalMs, locale)
  }
}
