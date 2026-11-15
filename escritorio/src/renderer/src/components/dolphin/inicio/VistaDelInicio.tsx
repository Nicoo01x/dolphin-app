import type { ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import type { GrabadoCongelado } from '../mundo/GrabadoEnPuntos'
import { TableroDelInicio, type MoverTarjeta } from '../tablero/TableroDelInicio'
import { arribaDelInicio } from './cifras-del-inicio'
import { SeccionDeEspacios } from './FilasDeEspacios'
import { FranjaDeHoy } from './FranjaDeHoy'
import { FranjaDelMundo } from './FranjaDelMundo'
import { RanuraDelCompositor } from './RanuraDelCompositor'
import type { DatosDelInicio } from './use-inicio'

/**
 * La pantalla de inicio, sin saber de dónde salen los datos (docs/reforma/inicio-v2.md). De arriba
 * abajo:
 *   1. la franja del mundo: el grabado en puntos y, encima, lo que pasa ahora en cifras grandes
 *      (en un perfil nuevo, el botón de agregar un proyecto). Su alto es el que sobra después de
 *      lo de abajo, entre un mínimo y un tope: con pocas tarjetas no queda un hueco muerto;
 *   2. lo que te necesita, si hay; después el tablero, siempre a la vista: el de verdad o, sin
 *      tarjetas, la tarjeta de ejemplo que recorre el ciclo sola. Lo que la franja deja pasado su
 *      tope es del tablero: sus columnas se estiran hasta abajo;
 *   3. lo de hoy, si hubo algo, con el mapa de actividad al lado si tiene datos;
 *   4. el compositor, fijo abajo (fuera del scroll: nunca tapa el contenido). Mientras carga, su
 *      lugar queda reservado: si no, la franja arrancaría más alta y saltaría al aparecer.
 *
 * Sin cajas: cada sección es un encabezado (TITULO_DE_SECCION) sobre el lienzo y lo suyo debajo, y
 * las secciones van separadas siempre por lo mismo (gap-8). Las únicas superficies son las tarjetas.
 * Sin saludo, sin eslogan y sin texto que explique: la tarjeta de ejemplo explica.
 */
export function VistaDelInicio({
  datos,
  aviso,
  pie,
  compositor,
  onElegir,
  mover,
  onReleer,
  congelado
}: {
  datos: DatosDelInicio
  /** Lo que falta en la máquina para trabajar (git, gh): va arriba del tablero. */
  aviso?: ReactNode
  /** Lo que la base pone al pie del inicio (la estrella de GitHub). */
  pie?: ReactNode
  /** El compositor; sin proyectos no se muestra (no podría hacer nada). Al cargar, guarda su lugar. */
  compositor?: ReactNode
  onElegir: (repoId: string, tarjeta: TarjetaDelTablero) => void
  mover?: MoverTarjeta
  onReleer?: () => void
  /** Para las capturas: el grabado y la tarjeta de ejemplo quietos en un instante. */
  congelado?: { grabado?: GrabadoCongelado; ejemplo?: number }
}): React.JSX.Element {
  const { listo, repos, tablero } = datos
  const perfilNuevo = listo && repos.length === 0
  const arriba = arribaDelInicio({
    listo,
    proyectos: repos.length,
    espacios: datos.espacios,
    estados: datos.estados,
    teNecesita: datos.teNecesita,
    tarjetas: tablero && tablero !== 'error' ? tablero.tarjetas : null,
    ahora: datos.ahora
  })

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <h1 className="sr-only">{translate('auto.components.dolphin.inicio.title', 'Home')}</h1>

      {/* Declara su tamaño (`container-type: size`): la franja del mundo mide su tope en `cqh`. */}
      <div className="scrollbar-sleek relative min-h-0 flex-1 overflow-y-auto [container-type:size]">
        <div className="@container flex min-h-full w-full flex-col pb-8">
          {/* Se queda con el alto que sobra: no hay hueco entre el tablero y el compositor. */}
          <FranjaDelMundo arriba={arriba} congelado={congelado?.grabado} />

          <div className="flex shrink-0 grow basis-auto flex-col gap-8 px-6">
            {aviso}

            <SeccionDeEspacios
              id="dolphin-inicio-te-necesita"
              titulo={translate('auto.components.dolphin.inicio.needsYou', 'Needs you')}
              items={datos.teNecesita}
              ahora={datos.ahora}
              // Una fila de 30 px no se estira a todo el lienzo: la hora queda cerca de su nombre.
              className="max-w-2xl"
            />

            <TableroDelInicio
              // Sin saber todavía si hay proyectos, el tablero se está leyendo.
              tablero={listo ? tablero : undefined}
              proyectos={datos.proyectos}
              espacios={datos.espacios}
              estados={datos.estados}
              onElegir={onElegir}
              mover={mover}
              onReleer={onReleer}
              instanteDelEjemplo={congelado?.ejemplo}
              // Lo que el mundo deja pasado su tope lo ocupa el tablero (sus columnas llegan hasta
              // «Hoy» o el compositor), en vez de quedar como aire entre el tablero y el compositor.
              llenar
            />

            {listo ? (
              <FranjaDeHoy
                hoy={datos.hoy}
                ahora={datos.ahora}
                cuandoTrabajaste={datos.cuandoTrabajaste}
                conMapa={!perfilNuevo}
              />
            ) : null}

            {pie ? <div className="flex justify-center">{pie}</div> : null}
          </div>
        </div>
      </div>

      <RanuraDelCompositor listo={listo} perfilNuevo={perfilNuevo} compositor={compositor} />
    </div>
  )
}
