import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { translate } from '@/i18n/i18n'
import StatusIndicator from '@/components/sidebar/workspace-card/surface/StatusIndicator'
import { GrabadoEnPuntos, type GrabadoCongelado } from '../mundo/GrabadoEnPuntos'
import type { ArribaDelInicio, Cifra } from './cifras-del-inicio'
import { BotonAgregarProyecto } from './InventarioDelInicio'

/**
 * El alto de la franja no es fijo: se queda con lo que sobra del área después del tablero y de
 * «Hoy», para que no quede un hueco muerto entre el tablero y el compositor. Nunca menos que lo que
 * el mar necesita para respirar, ni más que el 72 % del área: en una ventana muy alta la ola no se
 * come la pantalla. `cqh` es el alto del área del inicio (el contenedor con scroll declara su
 * tamaño). Cuando lo de abajo no entra, la franja queda en su mínimo y el área hace scroll.
 *
 * Crece con un peso enorme frente al resto (que crece con 1): se lleva todo el sobrante hasta su
 * tope, y recién lo que pasa del tope le queda a la zona del tablero, cuyas columnas se estiran
 * hasta abajo (sin fondo en reposo: no se ve una caja vacía; al arrastrar, la zona de destino
 * llega hasta el compositor). Con el tope en 58 % quedaban de 126 a 230 px muertos en alturas
 * comunes.
 */
const ALTO_MINIMO = 300
const ALTO_DE_LA_FRANJA: CSSProperties = {
  flexGrow: 1000,
  flexShrink: 0,
  flexBasis: ALTO_MINIMO,
  minHeight: ALTO_MINIMO,
  maxHeight: '72cqh'
}

/** Cuánto más allá del borde de las cifras queda todavía apagado, y en cuánto vuelve la trama. */
const DESPEJE = 24
const FUNDIDO_LATERAL = 96

/**
 * La máscara del grabado. El pie se funde con el lienzo para que la ola no termine en una raya recta
 * sobre el tablero; y si hay cifras (o el botón), la trama se apaga debajo de ellas y un poco a su
 * derecha, en un fundido horizontal: el texto nunca va encima de una zona densa del grabado.
 */
function mascaraDelGrabado(finDelTexto: number | null): CSSProperties {
  const pie = 'linear-gradient(to bottom, black 90%, transparent)'
  if (finDelTexto === null) {
    return { maskImage: pie, WebkitMaskImage: pie }
  }
  const desde = finDelTexto + DESPEJE
  const lado = `linear-gradient(to right, transparent ${desde}px, black ${desde + FUNDIDO_LATERAL}px)`
  return {
    maskImage: `${pie}, ${lado}`,
    WebkitMaskImage: `${pie}, ${lado}`,
    maskComposite: 'intersect',
    WebkitMaskComposite: 'source-in'
  }
}

/**
 * Dónde termina, a la derecha, lo que va escrito encima del grabado: el borde del último hijo de
 * `bloque`, medido desde el borde izquierdo de la franja. Se mide el texto de verdad (las cifras
 * cambian de ancho con el número, el idioma y la fuente al terminar de cargar) y se vuelve a medir
 * cuando cambia cualquiera de los dos tamaños.
 */
function useFinDelTexto(
  franja: RefObject<HTMLDivElement | null>,
  bloque: RefObject<HTMLDivElement | null>,
  clave: string
): number | null {
  const [fin, setFin] = useState<number | null>(null)
  useLayoutEffect(() => {
    const caja = franja.current
    const texto = bloque.current
    if (!caja || !texto) {
      setFin(null)
      return
    }
    const medir = (): void => {
      const izquierda = caja.getBoundingClientRect().left
      let derecha = 0
      for (const hijo of Array.from(texto.children)) {
        derecha = Math.max(derecha, hijo.getBoundingClientRect().right - izquierda)
      }
      setFin(derecha > 0 ? Math.round(derecha) : null)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const alCambiar = new ResizeObserver(medir)
    alCambiar.observe(caja)
    for (const hijo of Array.from(texto.children)) {
      alCambiar.observe(hijo)
    }
    return () => alCambiar.disconnect()
  }, [franja, bloque, clave])
  return fin
}

function etiquetaDe(cifra: Cifra): string {
  switch (cifra.clave) {
    case 'corriendo':
      return translate('auto.components.dolphin.inicio.cifraRunning', 'running')
    case 'para-revisar':
      return translate('auto.components.dolphin.inicio.cifraToReview', 'to review')
    case 'te-necesita':
      return cifra.valor === 1
        ? translate('auto.components.dolphin.inicio.cifraNeedsYou', 'needs you')
        : translate('auto.components.dolphin.inicio.cifraNeedYou', 'need you')
    case 'proyectos':
      return cifra.valor === 1
        ? translate('auto.components.dolphin.inicio.cifraProject', 'project')
        : translate('auto.components.dolphin.inicio.cifraProjects', 'projects')
    case 'ultima':
      return cifra.unidad === 'ahora'
        ? translate('auto.components.dolphin.inicio.cifraLastChange', 'last change')
        : translate('auto.components.dolphin.inicio.cifraSinceLast', 'since the last change')
  }
}

function valorDe(cifra: Cifra): { numero: string; unidad?: string } {
  if (cifra.clave !== 'ultima') {
    return { numero: String(cifra.valor) }
  }
  switch (cifra.unidad) {
    case 'ahora':
      return { numero: translate('auto.components.dolphin.inicio.cifraNow', 'now') }
    case 'min':
      return {
        numero: String(cifra.valor),
        unidad: translate('auto.components.dolphin.inicio.unitMin', 'min')
      }
    case 'h':
      return {
        numero: String(cifra.valor),
        unidad: translate('auto.components.dolphin.inicio.unitHour', 'h')
      }
    case 'd':
      return {
        numero: String(cifra.valor),
        unidad: translate('auto.components.dolphin.inicio.unitDay', 'd')
      }
  }
}

function CifraGrande({ cifra }: { cifra: Cifra }): React.JSX.Element {
  const { numero, unidad } = valorDe(cifra)
  const etiqueta = etiquetaDe(cifra)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {numero}
        {unidad ? <span className="ml-1 text-[24px] font-medium">{unidad}</span> : null}
      </span>
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {'estado' in cifra ? (
          <StatusIndicator status={cifra.estado} showTooltip={false} aria-hidden="true" />
        ) : null}
        {etiqueta}
      </span>
    </div>
  )
}

/**
 * Arriba de todo, el mundo de Dolphin: una lámina de dominio público dibujada como trama de puntos
 * (con el catalejo bajo el cursor) y, abajo a la izquierda, sobre una zona despejada, lo que está
 * pasando en cifras grandes. En un perfil nuevo, en lugar de cifras en cero, el botón para agregar
 * el primer proyecto. Va dentro de una columna flexible: su alto lo decide lo que sobra (ver
 * ALTO_DE_LA_FRANJA), y el canvas se vuelve a encuadrar solo cuando cambia.
 */
export function FranjaDelMundo({
  arriba,
  congelado
}: {
  arriba: ArribaDelInicio
  congelado?: GrabadoCongelado
}): React.JSX.Element {
  const franja = useRef<HTMLDivElement>(null)
  const bloque = useRef<HTMLDivElement>(null)
  const finDelTexto = useFinDelTexto(franja, bloque, JSON.stringify(arriba))
  return (
    <div ref={franja} className="relative w-full overflow-hidden" style={ALTO_DE_LA_FRANJA}>
      <div aria-hidden="true" className="absolute inset-0" style={mascaraDelGrabado(finDelTexto)}>
        <GrabadoEnPuntos congelado={congelado} />
      </div>
      <div className="absolute inset-0 flex items-end px-6 pb-8">
        {arriba.tipo === 'accion' ? (
          <div ref={bloque} className="flex">
            <BotonAgregarProyecto />
          </div>
        ) : arriba.tipo === 'cifras' ? (
          <div
            ref={bloque}
            className="flex flex-wrap items-end gap-x-12 gap-y-4"
            role="group"
            aria-label={translate('auto.components.dolphin.inicio.now', 'Right now')}
          >
            {arriba.cifras.map((cifra) => (
              <CifraGrande key={cifra.clave} cifra={cifra} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
