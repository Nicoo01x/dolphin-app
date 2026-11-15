/**
 * La actividad de los últimos meses, día por día, lista para dibujar como un mapa de calor.
 *
 * Puro y sin React a propósito: lo que tiene lógica acá es el calendario, y el calendario es donde
 * están los errores de verdad —la semana que arranca en el día equivocado, el mes etiquetado en la
 * columna de al lado, el día de hoy dibujado como un día sin nada—. Eso se fija con tests; el
 * componente sólo pinta cuadraditos.
 */

/** Un día del mapa: su fecha, cuántas cosas pasaron y en qué escalón de color cae. */
export type DiaDeActividad = {
  /** `aaaa-mm-dd` en hora local, que es la que la persona ve en su calendario. */
  readonly fecha: string
  readonly cuantas: number
  /** 0 = ninguna; 1 a 4 = los cuatro escalones de color. */
  readonly nivel: 0 | 1 | 2 | 3 | 4
}

/** Una columna del mapa: siete casilleros, con `null` en los que caen fuera del rango. */
export type SemanaDeActividad = readonly (DiaDeActividad | null)[]

export type MapaDeActividad = {
  readonly semanas: readonly SemanaDeActividad[]
  /** Qué mes empieza en qué columna, para la fila de etiquetas de arriba. */
  readonly meses: readonly { readonly etiqueta: string; readonly semana: number }[]
  /** El total del período, para poder decirlo en una línea. */
  readonly total: number
}

/** `aaaa-mm-dd` de una fecha, en hora local. */
export function claveDelDia(fecha: Date): string {
  const mes = `${fecha.getMonth() + 1}`.padStart(2, '0')
  const dia = `${fecha.getDate()}`.padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/**
 * Cuántos días hay que retroceder para caer en el lunes de esa semana.
 *
 * Why lunes y no domingo: GitHub arranca en domingo porque es su convención, y acá la semana
 * empieza el lunes como en el calendario que la persona tiene al lado.
 */
function haciaElLunes(fecha: Date): number {
  return (fecha.getDay() + 6) % 7
}

/**
 * Los cuatro escalones, por el PUESTO que ocupa cada cantidad entre las distintas del período.
 *
 * Why por puesto y no por un corte fijo (1, 3, 6, 10): alguien que abre dos cosas por día vería el
 * mapa entero del mismo color, y el mapa no diría nada. Y why por puesto y no por cuartiles: con
 * cuartiles usados como tope, el día más fuerte cae siempre en el escalón de abajo del último
 * —lo encontró su test—, y el mejor día de la persona tiene que ser el más oscuro.
 */
function escalaDeNiveles(cuentas: readonly number[]): (cuantas: number) => DiaDeActividad['nivel'] {
  const distintos = [...new Set(cuentas.filter((n) => n > 0))].sort((a, b) => a - b)
  if (distintos.length <= 1) {
    return (cuantas) => (cuantas > 0 ? 4 : 0)
  }
  return (cuantas) => {
    if (cuantas <= 0) {
      return 0
    }
    const puesto = distintos.indexOf(cuantas)
    const relativo = puesto === -1 ? distintos.length - 1 : puesto
    const nivel = 1 + Math.round((relativo / (distintos.length - 1)) * 3)
    return Math.min(4, Math.max(1, nivel)) as DiaDeActividad['nivel']
  }
}

/**
 * Arma el mapa.
 *
 * `hasta` es el día que cierra el período (normalmente hoy), y `semanas` cuántas columnas se
 * muestran. Los días posteriores a `hasta` dentro de la última semana quedan en `null` y no en
 * cero: un día que todavía no pasó no es un día sin actividad.
 */
export function mapaDeActividad(
  cuando: readonly number[],
  opciones: { readonly hasta: number; readonly semanas: number; readonly locale?: string }
): MapaDeActividad {
  const semanas = Math.max(1, Math.floor(opciones.semanas))
  const fin = new Date(opciones.hasta)
  fin.setHours(0, 0, 0, 0)
  // El primer día del mapa: el lunes de la semana en la que cae `hasta`, menos las semanas pedidas.
  const inicio = new Date(fin)
  inicio.setDate(inicio.getDate() - haciaElLunes(fin) - (semanas - 1) * 7)

  const porDia = new Map<string, number>()
  for (const momento of cuando) {
    const fecha = new Date(momento)
    fecha.setHours(0, 0, 0, 0)
    if (fecha < inicio || fecha > fin) {
      continue
    }
    const clave = claveDelDia(fecha)
    porDia.set(clave, (porDia.get(clave) ?? 0) + 1)
  }
  const nivelDe = escalaDeNiveles([...porDia.values()])

  const columnas: SemanaDeActividad[] = []
  const meses: { etiqueta: string; semana: number }[] = []
  const nombreDelMes = new Intl.DateTimeFormat(opciones.locale ?? 'es', { month: 'short' })
  let mesEtiquetado = -1
  const dia = new Date(inicio)
  for (let semana = 0; semana < semanas; semana += 1) {
    const columna: (DiaDeActividad | null)[] = []
    for (let indice = 0; indice < 7; indice += 1) {
      if (dia > fin) {
        columna.push(null)
      } else {
        const clave = claveDelDia(dia)
        const cuantas = porDia.get(clave) ?? 0
        columna.push({ fecha: clave, cuantas, nivel: nivelDe(cuantas) })
        // La etiqueta del mes va en la columna donde ese mes aparece por primera vez, y una sola
        // vez: etiquetando cada columna que lo contiene, «nov» se repetiría cuatro veces seguidas.
        if (dia.getMonth() !== mesEtiquetado) {
          mesEtiquetado = dia.getMonth()
          meses.push({ etiqueta: nombreDelMes.format(dia), semana })
        }
      }
      dia.setDate(dia.getDate() + 1)
    }
    columnas.push(columna)
  }
  let total = 0
  for (const cuantas of porDia.values()) {
    total += cuantas
  }
  return { semanas: columnas, meses: dedupeDeMeses(meses), total }
}

/**
 * Una etiqueta por mes y nunca dos en la misma columna.
 *
 * Un mes que empieza y termina dentro de la misma columna —pasa con los meses cortos cuando el
 * mapa es angosto— pondría dos nombres encima del mismo cuadradito.
 */
function dedupeDeMeses(
  meses: readonly { etiqueta: string; semana: number }[]
): readonly { etiqueta: string; semana: number }[] {
  const vistos = new Set<number>()
  return meses.filter((mes) => {
    if (vistos.has(mes.semana)) {
      return false
    }
    vistos.add(mes.semana)
    return true
  })
}
