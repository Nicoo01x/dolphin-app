import type { ReactNode } from 'react'
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import {
  Arriba,
  Entra,
  Pantalla,
  S,
  SALIDA,
  Titular,
  Vineta,
  clamp
} from './Lanzamiento'
import { LogoDeDolphin } from './logos'
import { MarDePuntos } from './mar-de-puntos'
import { LETRA, MONO, PALETA } from './paleta'

/**
 * El spot de la app de escritorio, 30 s para Twitter.
 *
 * Nico, 24/11/2026: «todo sobre escritorio, no el CLI; mostrá los issues; la potencia de un chat
 * bonito con la potencia de la PowerShell; que se vean los mejores componentes». Cada imagen es un
 * fixture de la app (`pnpm fixtures:shot`, tema oscuro, 2x): los componentes de verdad, con los
 * datos de demo de tienda-web y nada de los proyectos de nadie.
 *
 * Una sola historia de punta a punta: el test de precios falla en Safari → la terminal lo corre →
 * Codex lo arregla («Lo que hizo») → PR #491. Misma música y misma grilla de golpes que el otro
 * spot: 0, 2, 4, 6, el golpe fuerte en 8, el drop en 16, golpes en 20 y 24 y el cierre en 27.
 */
export const DURACION_DEL_ESCRITORIO = S(30)

export function Escritorio(): ReactNode {
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, fontFamily: LETRA, color: PALETA.texto }}>
      <Sequence from={0} durationInFrames={S(8)}>
        <ChatYTerminal />
      </Sequence>
      <Sequence from={S(8)} durationInFrames={S(4)}>
        <ElIssue />
      </Sequence>
      <Sequence from={S(12)} durationInFrames={S(4)}>
        <TarjetasDeGithub />
      </Sequence>
      <Sequence from={S(16)} durationInFrames={S(4)}>
        <LoQueHizo />
      </Sequence>
      <Sequence from={S(20)} durationInFrames={S(4)}>
        <ElTablero />
      </Sequence>
      <Sequence from={S(24)} durationInFrames={S(3)}>
        <ElControl />
      </Sequence>
      <Sequence from={S(27)} durationInFrames={S(3)}>
        <Cierre />
      </Sequence>
      <Vineta />
    </AbsoluteFill>
  )
}

/* ─── La PowerShell ──────────────────────────────────────────────────────────────────────── */

type Renglon = { texto: string; comando?: boolean; color?: string }

const PROMPT = 'PS C:\\tienda-web> '

const RENGLONES: Renglon[] = [
  { texto: 'pnpm test pricing', comando: true },
  { texto: ' ✓ src/pricing/plan-picker.spec.ts (12 tests)', color: PALETA.listo },
  { texto: ' Test Files  1 passed   Tests  12 passed', color: PALETA.tenue },
  { texto: 'git push -u origin fix/precio-safari', comando: true },
  { texto: ' * [new branch]  fix/precio-safari -> fix/precio-safari', color: PALETA.tenue },
  { texto: 'gh pr create --fill', comando: true },
  { texto: ' https://github.com/tienda-ejemplo/tienda-web/pull/491', color: PALETA.electrico }
]

/** Una PowerShell que escribe sus comandos letra por letra y larga la salida de golpe. */
function PowerShell({ desde }: { desde: number }): ReactNode {
  const frame = useCurrentFrame()
  const t = frame - desde
  // Cada comando se tipea a 2 letras por cuadro; la salida tarda 6 cuadros en llegar.
  let reloj = 4
  const vistos: { texto: string; color: string }[] = []
  for (const r of RENGLONES) {
    if (r.comando) {
      const letras = Math.max(0, Math.min(r.texto.length, Math.floor((t - reloj) * 2)))
      if (t >= reloj) {
        vistos.push({ texto: PROMPT + r.texto.slice(0, letras), color: PALETA.espuma })
      }
      reloj += Math.ceil(r.texto.length / 2) + 6
    } else {
      if (t >= reloj) {
        vistos.push({ texto: r.texto, color: r.color ?? PALETA.tenue })
      }
      reloj += 3
    }
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        background: '#0c0c0c',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.10), 0 60px 140px rgba(0,0,0,0.75)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 22px',
          background: PALETA.tarjeta,
          fontSize: 22,
          color: PALETA.tenue
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            color: PALETA.electrico,
            fontWeight: 700,
            fontSize: 20
          }}
        >
          {'>_'}
        </span>
        <span style={{ color: PALETA.texto, fontWeight: 600 }}>PowerShell</span>
        <span>· tienda-web · fix/precio-safari</span>
      </div>
      <div
        style={{
          padding: '22px 24px',
          fontFamily: MONO,
          fontSize: 18.5,
          lineHeight: 1.75,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {vistos.map((v, i) => (
          <span key={i} style={{ color: v.color, whiteSpace: 'pre', overflow: 'hidden' }}>
            {v.texto}
            {i === vistos.length - 1 && frame % 30 < 18 ? (
              <span style={{ color: PALETA.electrico }}>▌</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── Escenas ────────────────────────────────────────────────────────────────────────────── */

/** 0–8 s: el chat solo, después la terminal al lado, y las dos en una ventana. */
function ChatYTerminal(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // A los 2 s el chat se corre a la izquierda para dejarle lugar a la terminal.
  const lado = spring({ frame: frame - S(2), fps, config: { damping: 200 } })
  const terminal = spring({ frame: frame - S(2) - 4, fps, config: { damping: 200 } })
  const entrada = interpolate(frame, [0, 40], [0.92, 1], { ...clamp, easing: SALIDA })
  const chatAncho = interpolate(lado, [0, 1], [1560, 1030])
  const chatX = interpolate(lado, [0, 1], [(1920 - 1560) / 2, 70])
  const alto = chatAncho * (1720 / 2560)
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 270 + (1 - entrada) * 60,
          left: chatX,
          width: chatAncho,
          height: alto,
          borderRadius: 22,
          overflow: 'hidden',
          transform: `scale(${entrada})`,
          transformOrigin: '50% 30%',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.10), 0 60px 140px rgba(0,0,0,0.75)'
        }}
      >
        <Img src={staticFile('spot2/chat.png')} style={{ width: '100%', display: 'block' }} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 270,
          left: 1130 + (1 - terminal) * 800,
          width: 720,
          height: 1030 * (1720 / 2560),
          opacity: terminal
        }}
      >
        <PowerShell desde={S(2.3)} />
      </div>
      <Arriba>
        <Titular texto="The beauty of a chat." desde={S(0.3)} hasta={S(1.95)} tamano={88} />
        <Titular
          texto="The power of a terminal."
          desde={S(2)}
          hasta={S(3.95)}
          tamano={88}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <Titular
          texto="In one window."
          desde={S(4)}
          hasta={S(5.95)}
          tamano={88}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <Presenta />
      </Arriba>
    </AbsoluteFill>
  )
}

/** A los 6 s: el logo de Dolphin entra donde estaban los títulos. */
function Presenta(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - S(6), fps, config: { damping: 200 } })
  if (frame < S(6)) {
    return null
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: -6,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 22,
        opacity: p,
        filter: `blur(${(1 - p) * 10}px)`,
        transform: `scale(${0.92 + p * 0.08})`
      }}
    >
      <LogoDeDolphin alto={84} />
      <span style={{ fontSize: 100, fontWeight: 700, letterSpacing: '-0.05em' }}>dolphin</span>
    </div>
  )
}

/** 8–12 s: un issue de GitHub adentro de Dolphin, y el botón que le pone un agente. */
function ElIssue(): ReactNode {
  return (
    <Entra>
      <Pantalla
        src="spot2/issue.png"
        ancho={1600}
        arriba={260}
        camara={{
          en: [0, 50, 120],
          rx: [20, 6, 4],
          ry: [-14, -4, 2],
          escala: [0.9, 1.15, 1.55],
          x: [30, 40, 82],
          y: [20, 22, 19]
        }}
      />
      <Arriba>
        <Titular texto="Your GitHub issues, inside." tamano={84} hasta={S(1.95)} />
        <Titular
          texto="One click puts an agent on it."
          desde={S(2)}
          tamano={84}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      </Arriba>
    </Entra>
  )
}

/** 12–16 s: la tarjeta de un PR y la de un issue, vivas en el chat. */
function TarjetasDeGithub(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tarjetas = [
    { src: 'spot2/tarjeta-pr.png', ancho: 780, x: 170, y: 300, giro: 8, desde: 0 },
    { src: 'spot2/tarjeta-issue.png', ancho: 780, x: 990, y: 420, giro: -8, desde: 12 }
  ]
  return (
    <Entra>
      <AbsoluteFill style={{ perspective: 1600 }}>
        {tarjetas.map((t) => {
          const p = spring({ frame: frame - t.desde, fps, config: { damping: 18, mass: 0.8 } })
          const flota = Math.sin((frame + t.desde * 3) / 18) * 6
          return (
            <div
              key={t.src}
              style={{
                position: 'absolute',
                left: t.x,
                top: t.y + flota,
                width: t.ancho,
                opacity: Math.min(1, p),
                transform: `translateZ(${(1 - p) * -600}px) rotateY(${t.giro * (1 - p * 0.6)}deg) rotateX(${4 * (1 - p)}deg)`,
                borderRadius: 32,
                overflow: 'hidden',
                boxShadow: '0 50px 120px rgba(0,0,0,0.8)'
              }}
            >
              <Img src={staticFile(t.src)} style={{ display: 'block', width: '100%' }} />
            </div>
          )
        })}
      </AbsoluteFill>
      <Arriba>
        <Titular texto="PRs, checks and reviews. Live." tamano={84} />
      </Arriba>
    </Entra>
  )
}

/** 16–20 s, el drop: «Lo que hizo Codex», paso por paso hasta el PR. */
function LoQueHizo(): ReactNode {
  const frame = useCurrentFrame()
  const golpe = interpolate(frame, [0, 10], [1.08, 1], { ...clamp, easing: SALIDA })
  return (
    <AbsoluteFill style={{ transform: `scale(${golpe})` }}>
      <Pantalla
        src="spot2/lo-que-hizo.png"
        ancho={1180}
        arriba={250}
        sombra={false}
        camara={{
          en: [0, 60, 120],
          rx: [10, 4, 6],
          ry: [-8, 0, 4],
          escala: [1.25, 1.1, 1.3],
          x: [50, 50, 70],
          y: [20, 45, 88]
        }}
      />
      <Arriba>
        <Titular texto="Every step. Every line it changed." tamano={80} />
      </Arriba>
    </AbsoluteFill>
  )
}

/** 20–24 s: el inicio con el tablero, y los motores entrando en cada golpe. */
function ElTablero(): ReactNode {
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
        src="spot2/inicio.png"
        ancho={1500}
        arriba={290}
        camara={{
          en: [0, 120],
          rx: [16, 6],
          ry: [-16, -4],
          escala: [0.95, 1.12],
          x: [50, 55],
          y: [40, 55]
        }}
      />
      <Arriba>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 64, alignItems: 'center' }}>
          {agentes.map((a, i) => {
            const p = spring({ frame: frame - i * 20, fps, config: { damping: 14, mass: 0.6 } })
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
          texto="Every agent. One board."
          desde={S(2)}
          tamano={44}
          estilo={{ marginTop: 22, color: PALETA.tenue, fontWeight: 500 }}
        />
      </Arriba>
    </Entra>
  )
}

/** 24–27 s: lo que te pide permiso, lo que te pregunta y quién hace qué. */
function ElControl(): ReactNode {
  const frame = useCurrentFrame()
  const capas = [
    { src: 'spot2/aprobacion.png', x: 110, y: 330, ancho: 780, desde: 0, giro: 10, radio: 20 },
    { src: 'spot2/orquestacion.png', x: 1300, y: 300, ancho: 500, desde: 8, giro: -12, radio: 22 },
    { src: 'spot2/pregunta.png', x: 660, y: 600, ancho: 620, desde: 16, giro: 0, radio: 24 }
  ]
  return (
    <Entra>
      <AbsoluteFill style={{ perspective: 1600 }}>
        {capas.map((c) => {
          const local = frame - c.desde
          const z = interpolate(local, [0, 40], [-1200, 0], { ...clamp, easing: SALIDA })
          const o = interpolate(local, [0, 8], [0, 1], clamp)
          return (
            <div
              key={c.src}
              style={{
                position: 'absolute',
                left: c.x,
                top: c.y,
                width: c.ancho,
                opacity: o,
                transform: `translateZ(${z}px) rotateY(${c.giro}deg)`,
                borderRadius: c.radio,
                overflow: 'hidden',
                boxShadow: '0 50px 120px rgba(0,0,0,0.85)'
              }}
            >
              <Img src={staticFile(c.src)} style={{ display: 'block', width: '100%' }} />
            </div>
          )
        })}
      </AbsoluteFill>
      <Arriba>
        <Titular texto="You stay in control." tamano={88} />
      </Arriba>
    </Entra>
  )
}

function Cierre(): ReactNode {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame, fps, config: { damping: 200 } })
  const fin = interpolate(frame, [S(2.65), S(3)], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: fin }}>
      <MarDePuntos opacidad={0.75} />
      <AbsoluteFill
        style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 22 }}
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
        <Titular
          texto="The beauty of a chat. The power of a terminal."
          desde={3}
          tamano={52}
        />
        <Titular
          texto="Open source desktop app  ·  odolphin.tech"
          desde={12}
          tamano={36}
          estilo={{ color: PALETA.electrico, fontWeight: 550, letterSpacing: '-0.01em' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
