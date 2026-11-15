import { useMemo, useState } from 'react'
import { cn } from '../../lib/class-names'
import { translate } from '@/i18n/i18n'
import { uiDateTimeFormat } from '@/i18n/ui-intl-formatters'
import { mapaDeActividad, type DiaDeActividad } from './actividad-por-dia'

// Constante de módulo porque los formateadores de la UI se cachean por identidad de las opciones.
const DIA_Y_MES: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }

/**
 * El mapa de calor de la actividad: una columna por semana, un cuadradito por día.
 *
 * Why acá y no un número: «37 espacios de trabajo» no dice nada; el mapa dice cuándo trabajaste y
 * cuándo no, y eso se lee de un vistazo sin tener que entender ninguna unidad.
 *
 * El color sale de `--primary` por opacidad, que en la piel es la tinta: el mapa es un grabado más,
 * en plata sobre el panel, y no los verdes de GitHub.
 */

/** La opacidad de cada escalón. El 0 queda como un casillero apenas marcado, no vacío. */
const OPACIDAD: Readonly<Record<DiaDeActividad['nivel'], string>> = {
  0: 'bg-foreground/[0.06]',
  1: 'bg-primary/25',
  2: 'bg-primary/45',
  3: 'bg-primary/70',
  4: 'bg-primary'
}

/** En la franja baja del inicio: celdas fijas y chicas, sin caja propia. */
const CELDA_COMPACTA = 9

export function MapaDeActividad({
  cuando,
  titulo,
  semanas = 26,
  ahora,
  compacto = false
}: {
  /** Cuándo pasó cada cosa, en epoch ms. */
  readonly cuando: readonly number[]
  readonly titulo: string
  readonly semanas?: number
  /** Inyectable para los tests y las capturas; por defecto, ahora. */
  readonly ahora?: number
  /** Sin caja y con celdas chicas fijas: va adentro de otra franja, no ocupa el ancho. */
  readonly compacto?: boolean
}): React.JSX.Element {
  // Why una sola lectura del reloj y no `Date.now()` en cada pintada: el mapa no cambia dentro de
  // la misma sesión de la pantalla, y leer la hora en el render lo haría distinto en cada re-render.
  const [montadoEn] = useState(() => Date.now())
  const hasta = ahora ?? montadoEn
  const mapa = useMemo(() => mapaDeActividad(cuando, { hasta, semanas }), [cuando, hasta, semanas])
  const formatoLargo = uiDateTimeFormat(DIA_Y_MES)
  const columnas = compacto
    ? `repeat(${mapa.semanas.length}, ${CELDA_COMPACTA}px)`
    : `repeat(${mapa.semanas.length}, minmax(0, 1fr))`
  const hueco = compacto ? 'gap-[2px]' : 'gap-[3px]'

  return (
    // Un tono sobre el lienzo y sin borde: la piel separa por tono, no por línea.
    <section className={compacto ? 'shrink-0' : 'w-full rounded-xl bg-card px-4 py-3'}>
      <header
        className={cn('flex items-baseline justify-between gap-3', compacto ? 'mb-2' : 'mb-3')}
      >
        <h2
          className={cn('font-semibold text-foreground', compacto ? 'text-[13px]' : 'text-[15px]')}
        >
          {titulo}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {translate('auto.components.landing.MapaDeActividad.enElPeriodo', '{{value0}} in all', {
            value0: String(mapa.total)
          })}
        </span>
      </header>
      {/* La fila de meses y la grilla comparten el mismo ancho de columna, así el nombre cae sobre
          su propia semana. Sin la grilla compartida, cada fila se reparte el espacio por su cuenta
          y los meses terminan corridos. */}
      <div className={cn('grid', hueco)} style={{ gridTemplateColumns: columnas }}>
        {mapa.semanas.map((semana, columna) => (
          <div key={columna} className={cn('flex flex-col', hueco)}>
            {semana.map((dia, fila) =>
              dia ? (
                <div
                  key={dia.fecha}
                  // `title` y no un tooltip propio: es un dato de paso y no vale un portal por día.
                  title={`${formatoLargo.format(new Date(`${dia.fecha}T12:00:00`))} · ${dia.cuantas}`}
                  className={cn('aspect-square rounded-[2px]', OPACIDAD[dia.nivel])}
                />
              ) : (
                <div key={`vacio-${fila}`} className="aspect-square" />
              )
            )}
          </div>
        ))}
      </div>
      <div
        className={cn('grid text-[10px] text-muted-foreground', compacto ? 'mt-1.5' : 'mt-2')}
        style={{ gridTemplateColumns: columnas }}
      >
        {/* Un mes cortado al principio, con el siguiente a menos de tres semanas, no tiene dónde
            escribirse: los dos nombres se pisaban. Queda el entero. */}
        {mapa.meses
          .filter((mes, i, meses) => (meses[i + 1]?.semana ?? Infinity) - mes.semana >= 3)
          .map((mes) => (
            <span
              key={`${mes.etiqueta}-${mes.semana}`}
              className="whitespace-nowrap"
              style={{ gridColumnStart: mes.semana + 1 }}
            >
              {mes.etiqueta}
            </span>
          ))}
      </div>
    </section>
  )
}
