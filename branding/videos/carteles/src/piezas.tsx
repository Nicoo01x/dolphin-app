import type { CSSProperties, ReactNode } from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { LETRA, MONO, PALETA } from './paleta'
import { MarDePuntos } from './mar-de-puntos'
import { LogoDeDolphin } from './logos'

/**
 * Cómo entra todo en estos clips: un resorte corto, sin rebote de más.
 *
 * Why un resorte y no un fade: lo que el cartel tiene que contar es que las cosas APARECEN solas.
 * Un fade lineal se lee como una transición; un resorte se lee como algo que se crea.
 */
export function useEntrada(desde: number): { avance: number; y: number; escala: number } {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const avance = spring({
    frame: frame - desde,
    fps,
    config: { damping: 200, mass: 0.6, stiffness: 120 }
  })
  return {
    avance,
    y: interpolate(avance, [0, 1], [14, 0]),
    escala: interpolate(avance, [0, 1], [0.96, 1])
  }
}

/** Visible solo desde `desde`: lo que todavía no nació no ocupa lugar en pantalla. */
export function Aparece({
  desde,
  children,
  style
}: {
  desde: number
  children: ReactNode
  style?: CSSProperties
}): ReactNode {
  const frame = useCurrentFrame()
  const { avance, y, escala } = useEntrada(desde)
  if (frame < desde) {
    return null
  }
  return (
    <div
      style={{
        ...style,
        opacity: avance,
        transform: `translateY(${y}px) scale(${escala})`
      }}
    >
      {children}
    </div>
  )
}

/** La ventana de Dolphin: lo que el clip muestra pasa adentro de la app, no en un fondo abstracto. */
export function Ventana({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: PALETA.fondo,
        fontFamily: LETRA,
        color: PALETA.texto,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* El mar de puntos, el mismo de la pantalla de inicio: la marca es esta, no un degradado. */}
      <MarDePuntos />
      {/* Why position+zIndex: el mar es un absoluto, y sin esto se pinta ENCIMA de sus hermanos
          estáticos y tapa la ventana entera. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '18px 26px',
          borderBottom: `1px solid ${PALETA.linea}`
        }}
      >
        <LogoDeDolphin alto={26} />
        <span style={{ fontSize: 27, fontWeight: 600, letterSpacing: -0.2 }}>dolphin-app</span>
        <span style={{ fontSize: 24, color: PALETA.tenue }}>· master</span>
      </div>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          padding: 30,
          display: 'flex'
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** El compositor del chat, abajo, con lo que la persona escribió. */
export function Compositor({
  texto,
  palabrasVisibles,
  enviadoEn
}: {
  texto: string
  palabrasVisibles: number
  enviadoEn: number
}): ReactNode {
  const frame = useCurrentFrame()
  const palabras = texto.split(' ')
  const mostrado = palabras.slice(0, palabrasVisibles).join(' ')
  const enviado = frame >= enviadoEn
  // El pulso del envío: el borde se prende en azul y se apaga en medio segundo.
  const pulso = enviado ? interpolate(frame - enviadoEn, [0, 10], [1, 0], { extrapolateRight: 'clamp' }) : 0
  return (
    <div
      style={{
        position: 'absolute',
        left: 26,
        right: 26,
        bottom: 26,
        // Why 2: la ventana levantó su contenido a 1 para quedar sobre el mar; sin esto el
        // compositor queda debajo de ese contenido.
        zIndex: 2,
        borderRadius: 18,
        background: PALETA.tarjeta,
        border: `1px solid ${pulso > 0 ? PALETA.electrico : PALETA.linea}`,
        boxShadow: pulso > 0 ? `0 0 0 ${pulso * 6}px ${PALETA.electrico}22` : 'none',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}
    >
      <span style={{ fontSize: 30, color: enviado ? PALETA.tenue : PALETA.texto, flex: 1 }}>
        {enviado ? 'Escribile a Dolphin…' : mostrado}
        {!enviado && palabrasVisibles < palabras.length ? (
          <span style={{ color: PALETA.electrico }}>▌</span>
        ) : null}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 999,
          background: PALETA.espuma,
          color: PALETA.fondo,
          fontSize: 24,
          fontWeight: 700
        }}
      >
        ↑
      </span>
    </div>
  )
}

/** Una tarea del plan del líder, con el modelo que le toca. */
export function ChipDeTarea({
  desde,
  numero,
  nombre,
  modelo
}: {
  desde: number
  numero: number
  nombre: string
  modelo: string
}): ReactNode {
  return (
    <Aparece desde={desde}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderRadius: 999,
          background: PALETA.tarjeta,
          border: `1px solid ${PALETA.linea}`,
          fontSize: 26
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 999,
            background: PALETA.marHondo,
            color: PALETA.electrico,
            fontSize: 20,
            fontWeight: 700
          }}
        >
          {numero}
        </span>
        <span>{nombre}</span>
        <span style={{ color: PALETA.tenue, fontFamily: MONO, fontSize: 22 }}>{modelo}</span>
      </div>
    </Aparece>
  )
}
