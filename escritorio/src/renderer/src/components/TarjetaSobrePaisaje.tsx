import type { ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import paisajePorDefecto from '../../../../resources/paisajes/niebla.webp?url'
import { cn } from '@/lib/class-names'

/**
 * Una tarjeta acrílica flotando sobre un paisaje, con una fila por cosa.
 *
 * Es la forma que eligió Nico el 09/11/2026 para mostrar funciones, en la web y acá adentro: el
 * paisaje le da aire y temperatura a una lista que, sola, es una tabla; y la tarjeta —translúcida,
 * con el fondo difuminado detrás— la separa de la imagen sin taparla. Cada fila lleva su tilde en
 * círculo, el mismo que usa la transcripción del chat para decir «esto salió», así la app habla
 * igual en todos lados.
 *
 * La foto de fondo viene con la app (resources/paisajes). Son fotos de dominio público (CC0),
 * elegidas el 09/11/2026 para que esto se vea como la referencia que pasó Nico y no como un
 * degradado: una licencia ajena adentro del producto era el motivo de no traer ninguna, y CC0 no
 * lo es. Quien quiera otra la pasa por `paisaje`; el degradado de la marca quedó de respaldo para
 * cuando no haya ninguna.
 */

export type FilaDeTarjeta = {
  readonly titulo: string
  readonly texto?: string
}

export function TarjetaSobrePaisaje({
  paisaje = paisajePorDefecto,
  encabezado,
  filas,
  className
}: {
  /** La URL de la imagen de fondo. Por defecto, la que viaja con la app. */
  readonly paisaje?: string
  readonly encabezado?: ReactNode
  readonly filas: readonly FilaDeTarjeta[]
  readonly className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn('relative overflow-hidden rounded-3xl p-6 sm:p-8', className)}
      style={
        paisaje
          ? {
              backgroundImage: `url(${paisaje})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }
          : {
              backgroundImage:
                'linear-gradient(to bottom, color-mix(in srgb, var(--primary) 18%, transparent), transparent 55%), radial-gradient(120% 80% at 50% 120%, color-mix(in srgb, var(--primary) 38%, transparent), transparent 70%)'
            }
      }
    >
      {/* Un velo tenue: sobre un fondo claro la tarjeta se lee igual que sobre uno oscuro. Sin él,
          el contraste del texto dependería de qué imagen se haya puesto. */}
      <div aria-hidden className="absolute inset-0 bg-black/10" />
      <div className="relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-xl">
        {encabezado ? (
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-sm text-muted-foreground">
            {encabezado}
          </div>
        ) : null}
        <ul>
          {filas.map((fila, i) => (
            <li
              key={fila.titulo}
              className={cn('flex gap-3 px-4 py-3', i > 0 && 'border-t border-border/60')}
            >
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{fila.titulo}</p>
                {fila.texto ? (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {fila.texto}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
