import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { PALETA } from './paleta'
import { Aparece, ChipDeTarea, Compositor, Ventana } from './piezas'
import { Terminal } from './Terminal'

/**
 * «Claude, quiero delegar tareas»: una delegación de verdad, de principio a fin.
 *
 * Es el video del cartel de la auto-orquestación, y cuenta exactamente lo que hace `/equipo`: la
 * persona escribe UNA tarea, el líder la parte, y cada pedazo abre su propia terminal con su propio
 * modelo. Las terminales se crean solas, que es lo que hay que ver.
 *
 * Los tiempos están en cuadros a 30 fps y declarados acá arriba, juntos, porque lo único difícil de
 * un clip así es que las cosas pasen escalonadas y no todas juntas.
 */
const T = {
  /** La tarea se escribe palabra por palabra. */
  escribeDesde: 6,
  porPalabra: 3,
  envia: 36,
  /** El líder contesta y parte la tarea. */
  lider: 48,
  primerChip: 62,
  entreChips: 9,
  /** Cada terminal abre después de su chip. */
  primeraTerminal: 100,
  entreTerminales: 16,
  /** Los vistos, en el orden en que cada una termina de verdad. */
  terminaUna: 196,
  terminaDos: 184,
  terminaTres: 214,
  cierre: 226
} as const

const TAREA = 'armá el panel de facturación con su tabla y su filtro'

const TAREAS = [
  {
    nombre: 'la tabla',
    modelo: 'sonnet',
    titulo: 'compañero 1',
    termina: T.terminaUna,
    renglones: [
      { texto: '$ dolphin equipo', tenue: true },
      { texto: 'leo src/panel/facturas', tenue: true },
      { texto: 'escribo TablaDeFacturas.tsx' },
      { texto: 'escribo columnas.ts' },
      { texto: 'escribo tabla.css' },
      { texto: 'corro vitest tabla', tenue: true },
      { texto: '6 de 6 pruebas', listo: true }
    ]
  },
  {
    nombre: 'el filtro',
    modelo: 'haiku',
    titulo: 'compañero 2',
    termina: T.terminaDos,
    renglones: [
      { texto: '$ dolphin equipo', tenue: true },
      { texto: 'leo src/panel/filtros', tenue: true },
      { texto: 'escribo FiltroDeFechas.tsx' },
      { texto: 'escribo rango.ts' },
      { texto: 'corro vitest filtro', tenue: true },
      { texto: '4 de 4 pruebas', listo: true }
    ]
  },
  {
    nombre: 'las pruebas',
    modelo: 'sonnet',
    titulo: 'compañero 3',
    termina: T.terminaTres,
    renglones: [
      { texto: '$ dolphin equipo', tenue: true },
      { texto: 'espero a 1 y a 2', tenue: true },
      { texto: 'escribo panel.spec.ts' },
      { texto: 'corro el portón', tenue: true },
      { texto: 'tabla ✓  filtro ✓' },
      { texto: 'el portón pasó', listo: true }
    ]
  }
] as const

function FilaDelLider(): ReactNode {
  const frame = useCurrentFrame()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Aparece desde={T.lider}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 32, fontWeight: 600 }}>El líder parte la tarea</span>
          <span style={{ fontSize: 24, color: PALETA.tenue }}>
            {frame >= T.primerChip + T.entreChips * 2 ? 'tres tareas, tres compañeros' : 'pensando…'}
          </span>
        </div>
      </Aparece>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {TAREAS.map((tarea, indice) => (
          <ChipDeTarea
            key={tarea.nombre}
            desde={T.primerChip + indice * T.entreChips}
            numero={indice + 1}
            nombre={tarea.nombre}
            modelo={tarea.modelo}
          />
        ))}
      </div>
    </div>
  )
}

function Cierre(): ReactNode {
  const frame = useCurrentFrame()
  const listas = TAREAS.filter((tarea) => frame >= tarea.termina).length
  return (
    <Aparece desde={T.cierre}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 27
        }}
      >
        <span style={{ color: PALETA.listo, fontSize: 30 }}>✓</span>
        <span style={{ fontWeight: 600 }}>
          {listas} de {TAREAS.length} listas
        </span>
        <span style={{ color: PALETA.tenue }}>· una sola rama, y el portón ya pasó</span>
      </div>
    </Aparece>
  )
}

export function Delegacion(): ReactNode {
  const frame = useCurrentFrame()
  const palabrasVisibles = Math.max(
    0,
    Math.floor((frame - T.escribeDesde) / T.porPalabra)
  )
  // El compositor se baja de escena cuando ya contó lo suyo: lo que importa son las terminales.
  const compositorBaja = interpolate(frame, [T.lider, T.lider + 12], [0, 120], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  return (
    <Ventana>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          width: '100%',
          minHeight: 0
        }}
      >
        <Aparece desde={T.envia + 2}>
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '16px 22px',
              borderRadius: 18,
              background: PALETA.marHondo,
              border: `1px solid ${PALETA.marino}66`,
              fontSize: 30
            }}
          >
            {TAREA}
          </div>
        </Aparece>
        <FilaDelLider />
        <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {TAREAS.map((tarea, indice) => (
            <Terminal
              key={tarea.titulo}
              desde={T.primeraTerminal + indice * T.entreTerminales}
              titulo={tarea.titulo}
              modelo={tarea.modelo}
              renglones={tarea.renglones}
              terminaEn={tarea.termina}
            />
          ))}
        </div>
        <Cierre />
      </div>
      <div style={{ transform: `translateY(${compositorBaja}px)` }}>
        <Compositor texto={TAREA} palabrasVisibles={palabrasVisibles} enviadoEn={T.envia} />
      </div>
    </Ventana>
  )
}
