import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { LogoDeDolphin } from './logos'
import { MarDePuntos } from './mar-de-puntos'
import { LETRA, PALETA } from './paleta'

/**
 * El spot de lanzamiento para Twitter: 30 s, 1920×1080, con capturas reales de Dolphin.
 *
 * Why capturas y no imágenes generadas: Nico, 24/11/2026: «usá fotos del programa». Un modelo de
 * video deforma la interfaz y sus letras; acá la cámara se mueve en 3D sobre la app de verdad.
 *
 * La música (ElevenLabs Music, generada en Higgsfield) va a 120 BPM y tiene sus golpes en 0, 2, 4…,
 * un golpe fuerte en 8, el drop en 16, golpes en 20 y 24 y el cierre en 27. Cada escena corta en
 * uno de esos golpes: los números de abajo son esos segundos × 30.
 */
export const S = (segundos: number): number => Math.round(segundos * 30)
export const SALIDA = Easing.bezier(0.16, 1, 0.3, 1)

export const DURACION_DEL_SPOT = S(30)

export function Lanzamiento(): ReactNode {
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, fontFamily: LETRA, color: PALETA.texto }}>
      <Audio src={staticFile('spot/musica.mp3')} />
      <Sequence from={0} durationInFrames={S(4)}>
        <Apertura />
      </Sequence>
      <Sequence from={S(4)} durationInFrames={S(4)}>
        <ElPlan />
      </Sequence>
      <Sequence from={S(8)} durationInFrames={S(8)}>
        <ElEquipo />
      </Sequence>
      <Sequence from={S(16)} durationInFrames={S(4)}>
        <Listo />
      </Sequence>
      <Sequence from={S(20)} durationInFrames={S(4)}>
        <ElEscritorio />
      </Sequence>
      <Sequence from={S(24)} durationInFrames={S(3)}>
        <Pantallas />
      </Sequence>
      <Sequence from={S(27)} durationInFrames={S(3)}>
        <Cierre />
      </Sequence>
      <Vineta />
    </AbsoluteFill>
  )
}

/* ─── Piezas ─────────────────────────────────────────────────────────────────────────────── */

/** Una frase que entra palabra por palabra (sube y se enfoca) y sale con un fundido corto. */
export function Titular({
  texto,
  desde = 0,
  hasta,
  tamano = 92,
  estilo
}: {
  texto: string
  desde?: number
  hasta?: number
  tamano?: number
  estilo?: CSSProperties
}): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const salida =
    hasta === undefined ? 1 : interpolate(frame, [hasta - 8, hasta], [1, 0], clamp)
  if (frame < desde || salida <= 0) {
    return null
  }
  return (
    <div
      style={{
        fontSize: tamano,
        fontWeight: 650,
        letterSpacing: '-0.035em',
        lineHeight: 1.05,
        opacity: salida,
        filter: `blur(${(1 - salida) * 8}px)`,
        ...estilo
      }}
    >
      {texto.split(' ').map((palabra, i) => {
        const p = spring({ frame: frame - desde - i * 3, fps, config: { damping: 200 } })
        return (
          <span
            key={`${palabra}-${i}`}
            style={{
              display: 'inline-block',
              marginRight: '0.24em',
              opacity: p,
              transform: `translateY(${(1 - p) * 0.45}em)`,
              filter: `blur(${(1 - p) * 10}px)`
            }}
          >
            {palabra}
          </span>
        )
      })}
    </div>
  )
}

export type Camara = {
  /** Cuadros de la escena donde la cámara llega a cada toma. */
  en: number[]
  rx: number[]
  ry: number[]
  escala: number[]
  /** Hacia dónde mira la cámara, en % de la captura. */
  x: number[]
  y: number[]
}

/** Una captura real dentro de su ventana, con la cámara moviéndose en 3D sobre ella. */
export function Pantalla({
  src,
  ancho,
  camara,
  arriba = 250,
  sombra = true
}: {
  src: string
  ancho: number
  camara: Camara
  arriba?: number
  sombra?: boolean
}): ReactNode {
  const frame = useCurrentFrame()
  const v = (valores: number[]): number =>
    interpolate(frame, camara.en, valores, { ...clamp, easing: SALIDA })
  const escala = v(camara.escala)
  const x = v(camara.x)
  const y = v(camara.y)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        perspective: 1800,
        perspectiveOrigin: '50% 40%'
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: arriba,
          width: ancho,
          marginLeft: -ancho / 2,
          transformOrigin: `${x}% ${y}%`,
          transform: `rotateX(${v(camara.rx)}deg) rotateY(${v(camara.ry)}deg) scale(${escala})`,
          borderRadius: 22,
          overflow: 'hidden',
          background: PALETA.tarjeta,
          boxShadow: sombra
            ? '0 0 0 1px rgba(255,255,255,0.10), 0 60px 140px rgba(0,0,0,0.75), 0 0 120px rgba(25,185,255,0.10)'
            : undefined
        }}
      >
        <Img src={staticFile(src)} style={{ display: 'block', width: '100%' }} />
        <Barrido />
      </div>
    </div>
  )
}

/** Un reflejo que cruza el vidrio de la ventana: da volumen sin cambiar lo que se lee. */
function Barrido(): ReactNode {
  const frame = useCurrentFrame()
  const pos = interpolate(frame, [0, 70], [-60, 160], clamp)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(105deg, transparent ${pos - 20}%, rgba(255,255,255,0.07) ${pos}%, transparent ${pos + 20}%)`
      }}
    />
  )
}

/** Fundido de entrada de cada escena: corta en el golpe, pero sin un salto seco de luz. */
export function Entra({ children }: { children: ReactNode }): ReactNode {
  const frame = useCurrentFrame()
  const o = interpolate(frame, [0, 6], [0, 1], clamp)
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}

/**
 * El título de arriba, sobre una franja que oscurece la captura que pasa por detrás: sin ella, la
 * cámara en 3D sube la interfaz hasta el título y las dos letras se pisan.
 */
export function Arriba({ children }: { children: ReactNode }): ReactNode {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 340,
          background: `linear-gradient(to bottom, ${PALETA.fondo} 0%, rgba(10,10,10,0.94) 48%, rgba(10,10,10,0.6) 72%, transparent 100%)`
        }}
      />
      <div style={{ position: 'absolute', top: 86, left: 0, right: 0, textAlign: 'center' }}>
        {children}
      </div>
    </>
  )
}

/** Oscurece bordes y suma grano fino: la imagen se lee como cine y no como captura plana. */
export function Vineta(): ReactNode {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background:
          'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)'
      }}
    />
  )
}

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/* ─── Escenas ────────────────────────────────────────────────────────────────────────────── */

function Apertura(): ReactNode {
  const frame = useCurrentFrame()
  const mar = interpolate(frame, [0, 40], [0, 0.7], clamp)
  return (
    <AbsoluteFill>
      <MarDePuntos opacidad={mar} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <Titular
          texto="You don't need a better agent."
          desde={S(0.4)}
          hasta={S(1.95)}
          tamano={84}
          estilo={{ color: PALETA.tenue }}
        />
        <Titular texto="You need a team." desde={S(2)} tamano={124} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function ElPlan(): ReactNode {
  return (
    <Entra>
      <Pantalla
        src="spot/plan.webp"
        ancho={1500}
        arriba={270}
        camara={{
          en: [0, 50, 120],
          rx: [26, 10, 4],
          ry: [-18, -6, -2],
          escala: [0.8, 1.05, 1.45],
          x: [40, 40, 36],
          y: [50, 52, 52]
        }}
      />
      <Arriba>
        <Titular texto="One request." tamano={84} hasta={S(1.95)} />
        <Titular
          texto="Dolphin plans it."
          desde={S(2)}
          tamano={84}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      </Arriba>
    </Entra>
  )
}

function ElEquipo(): ReactNode {
  return (
    <Entra>
      <Pantalla
        src="spot/equipo.webp"
        ancho={1560}
        arriba={250}
        camara={{
          en: [0, 60, 120, 180, 240],
          rx: [18, 8, 6, 6, 4],
          ry: [16, 6, -6, -4, 0],
          escala: [1.15, 1.55, 1.6, 1.5, 1.25],
          x: [10, 25, 75, 85, 30],
          y: [36, 36, 36, 70, 12]
        }}
      />
      <Arriba>
        <Titular texto="A team of agents." tamano={80} hasta={S(1.95)} />
        <Titular
          texto="Working in parallel."
          desde={S(2)}
          hasta={S(3.95)}
          tamano={80}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <Titular
          texto="Each in its own branch."
          desde={S(4)}
          hasta={S(5.95)}
          tamano={80}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <Titular
          texto="plan → spawn → work → merge → review → ship"
          desde={S(6)}
          tamano={64}
          estilo={{
            position: 'absolute',
            top: 10,
            left: 0,
            right: 0,
            color: PALETA.electrico,
            fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
            letterSpacing: '-0.02em'
          }}
        />
      </Arriba>
    </Entra>
  )
}

function Listo(): ReactNode {
  const frame = useCurrentFrame()
  // El drop: un golpe de escala en el primer cuadro, como un corte de cámara en el beat.
  const golpe = interpolate(frame, [0, 10], [1.08, 1], { ...clamp, easing: SALIDA })
  return (
    <AbsoluteFill style={{ transform: `scale(${golpe})` }}>
      <Pantalla
        src="spot/listo.webp"
        ancho={1560}
        arriba={240}
        camara={{
          en: [0, 55, 120],
          rx: [4, 4, 8],
          ry: [-4, 0, 4],
          escala: [2.1, 1.7, 1.2],
          x: [86, 60, 50],
          y: [57, 82, 60]
        }}
      />
      <Arriba>
        <Titular texto="Tested. Reviewed. Ready to merge." tamano={84} />
      </Arriba>
    </AbsoluteFill>
  )
}

function ElEscritorio(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const agentes = [
    { src: 'spot/claude.svg', nombre: 'Claude' },
    { src: 'spot/codex.webp', nombre: 'Codex' },
    { src: 'spot/gemini.png', nombre: 'Gemini' }
  ]
  return (
    <Entra>
      <Pantalla
        src="spot/app-trabajando.webp"
        ancho={1480}
        arriba={300}
        camara={{
          en: [0, 120],
          rx: [14, 6],
          ry: [-22, -8],
          escala: [0.95, 1.08],
          x: [50, 50],
          y: [40, 40]
        }}
      />
      <Arriba>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 64, alignItems: 'center' }}>
          {agentes.map((a, i) => {
            const p = spring({ frame: frame - i * 30, fps, config: { damping: 14, mass: 0.6 } })
            return (
              <div
                key={a.nombre}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  opacity: Math.min(1, p),
                  transform: `translateY(${(1 - p) * 40}px) scale(${0.8 + p * 0.2})`
                }}
              >
                <Img src={staticFile(a.src)} style={{ width: 72, height: 72, borderRadius: 16 }} />
                <span style={{ fontSize: 76, fontWeight: 650, letterSpacing: '-0.035em' }}>
                  {a.nombre}
                </span>
              </div>
            )
          })}
        </div>
        <Titular
          texto="Side by side, in one window."
          desde={S(3)}
          tamano={44}
          estilo={{ marginTop: 22, color: PALETA.tenue, fontWeight: 500 }}
        />
      </Arriba>
    </Entra>
  )
}

function Pantallas(): ReactNode {
  const frame = useCurrentFrame()
  const capas = [
    { src: 'spot/terminal.webp', desde: 0 },
    { src: 'spot/vista-orquestacion.webp', desde: 12 },
    { src: 'spot/vista-delfines.webp', desde: 24 }
  ]
  return (
    <Entra>
      <AbsoluteFill style={{ perspective: 1600 }}>
        {capas.map((c, i) => {
          const local = frame - c.desde
          const z = interpolate(local, [0, 60], [-1400, 120], { ...clamp, easing: SALIDA })
          const o = interpolate(local, [0, 10, 52, 66], [0, 1, 1, 0], clamp)
          return (
            <div
              key={c.src}
              style={{
                position: 'absolute',
                left: '50%',
                top: 300 + i * 40,
                width: 1300,
                marginLeft: -650,
                transform: `translateZ(${z}px) rotateY(${(i - 1) * 10}deg) rotateX(6deg)`,
                opacity: o,
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 50px 120px rgba(0,0,0,0.8)'
              }}
            >
              <Img src={staticFile(c.src)} style={{ display: 'block', width: '100%' }} />
            </div>
          )
        })}
      </AbsoluteFill>
      <Arriba>
        <Titular texto="Desktop. Terminal. Your own server." tamano={80} />
      </Arriba>
    </Entra>
  )
}

function Cierre(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame, fps, config: { damping: 200 } })
  const fin = interpolate(frame, [S(2.4), S(3)], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: fin }}>
      <MarDePuntos opacidad={0.75} />
      <AbsoluteFill
        style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 28 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            opacity: logo,
            transform: `scale(${0.9 + logo * 0.1})`,
            filter: `blur(${(1 - logo) * 12}px)`
          }}
        >
          <LogoDeDolphin alto={118} />
          <span style={{ fontSize: 132, fontWeight: 700, letterSpacing: '-0.05em' }}>dolphin</span>
        </div>
        <Titular texto="Your own fleet of coding agents." desde={10} tamano={56} />
        <Titular
          texto="odolphin.tech  ·  open source"
          desde={22}
          tamano={36}
          estilo={{ color: PALETA.electrico, fontWeight: 550, letterSpacing: '-0.01em' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
