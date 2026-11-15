import type { ReactNode } from 'react'
import { useCurrentFrame } from 'remotion'
import { MONO, PALETA } from './paleta'
import { Aparece } from './piezas'
import { LogoDeClaude } from './logos'

export type RenglonDeTerminal = {
  texto: string
  /** Un renglón de salida del agente; sin esto es lo que el agente escribió al prompt. */
  tenue?: boolean
  listo?: boolean
}

/**
 * Una terminal de compañero, como la dibuja Dolphin: su título con el modelo, y su salida.
 *
 * Los renglones no aparecen de golpe: uno cada `cadaCuanto` cuadros, que es lo que hace que se lea
 * como una terminal trabajando y no como una captura.
 */
export function Terminal({
  desde,
  titulo,
  modelo,
  renglones,
  cadaCuanto = 9,
  aLaVista = 5,
  terminaEn
}: {
  desde: number
  titulo: string
  modelo: string
  renglones: readonly RenglonDeTerminal[]
  cadaCuanto?: number
  /** Cuántos renglones entran: los de más arriba se van, como en una terminal de verdad. */
  aLaVista?: number
  /** Cuándo le aparece el visto: la tarea salió bien. */
  terminaEn: number
}): ReactNode {
  const frame = useCurrentFrame()
  // +4: el primer renglón entra con la terminal ya abierta, no pegado al resorte.
  const visibles = Math.max(0, Math.floor((frame - desde - 4) / cadaCuanto))
  // Why la cola y no los primeros: una terminal que llega al borde de su caja sube, no se corta.
  // Así la cantidad de renglones del guion no depende del alto del clip.
  const mostrados = renglones.slice(0, visibles).slice(-aLaVista)
  const termino = frame >= terminaEn
  return (
    <Aparece desde={desde} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      <div
        style={{
          borderRadius: 18,
          background: PALETA.hondo,
          border: `1px solid ${termino ? `${PALETA.listo}44` : PALETA.linea}`,
          overflow: 'hidden',
          width: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: `1px solid ${PALETA.linea}`,
            background: PALETA.tarjeta
          }}
        >
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 999,
              background: termino ? PALETA.listo : PALETA.electrico
            }}
          />
          <span style={{ fontSize: 24, fontWeight: 600 }}>{titulo}</span>
          {/* El logo de Claude, no una marca dibujada: el compañero escribe con un motor real. */}
          <LogoDeClaude tamano={18} />
          <span style={{ fontSize: 21, color: PALETA.tenue, fontFamily: MONO }}>{modelo}</span>
          {termino ? (
            <span style={{ marginLeft: 'auto', color: PALETA.listo, fontSize: 24 }}>✓</span>
          ) : null}
        </div>
        <div
          style={{
            padding: '16px 18px',
            fontFamily: MONO,
            fontSize: 21,
            lineHeight: 1.6,
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          {mostrados.map((renglon) => (
            <span
              key={renglon.texto}
              style={{
                color: renglon.listo
                  ? PALETA.listo
                  : renglon.tenue
                    ? PALETA.tenue
                    : PALETA.espuma,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {renglon.texto}
            </span>
          ))}
          {visibles < renglones.length ? (
            <span style={{ color: PALETA.electrico }}>▌</span>
          ) : null}
        </div>
      </div>
    </Aparece>
  )
}
