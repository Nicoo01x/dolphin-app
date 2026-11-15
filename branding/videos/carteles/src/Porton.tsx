import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { MONO, PALETA } from './paleta'
import { Aparece, Compositor, Ventana } from './piezas'
import { Terminal } from './Terminal'

/**
 * El portón: dos ramas dicen «listo» y sólo una lo está.
 *
 * Es la promesa del titular de la web —«cada uno en su rama, y un portón que la prueba antes de
 * que toque la tuya»— y era la única de las grandes sin clip. Lo difícil de explicarla con
 * palabras es que suena a burocracia; lo que la hace entender es ver a un agente decir que
 * terminó y que la prueba lo contradiga.
 *
 * Por eso el clip no muestra el portón pasando: muestra UNA que pasa y UNA que no, con la misma
 * tarea y las mismas tres pruebas. Lo que queda en la cabeza no es «Dolphin corre tus tests», es
 * «esto no llega a tu rama sin pasar».
 *
 * La que falla no se esconde ni se dramatiza: su error es una línea de `tsc` de verdad, del
 * tamaño que tiene un error de verdad. Un clip donde lo que falla es obviamente una porquería no
 * convence a nadie que haya visto a un agente entregar código que compila y rompe otra cosa.
 *
 * Los tiempos van en cuadros a 30 fps y declarados acá arriba, juntos, como en los otros dos: lo
 * único difícil de un clip así es que las cosas pasen escalonadas y no todas juntas.
 */
const T = {
  escribeDesde: 6,
  porPalabra: 3,
  envia: 36,
  encabezado: 48,
  /** Las dos terminales corren a la par: lo que importa es que las dos dicen que terminaron. */
  primeraTerminal: 62,
  entreTerminales: 8,
  /** Las dos avisan «listo» casi juntas. Acá es donde parece que ya está. */
  terminaUna: 150,
  terminaOtra: 158,
  /** Y recién ahí arranca el portón, que es el punto del clip. */
  porton: 170,
  entrePasos: 22,
  cierre: 268
} as const

const TAREA = 'agregá el descuento por volumen al carrito'

/** Los tres escalones del portón, en el orden en que corren. */
const PASOS = ['typecheck', 'lint', 'test'] as const

/** Lo que hizo la rama que pasa. */
const LA_QUE_PASA = [
  { texto: '$ dolphin', tenue: true },
  { texto: 'leo carrito/precio.ts', tenue: true },
  { texto: 'agrego descuentoPorVolumen()', tenue: false },
  { texto: 'sumo 3 casos al test', tenue: false },
  { texto: 'listo', listo: true }
] as const

/** Lo que hizo la otra. Dice lo mismo, y es lo que hace que el portón importe. */
const LA_QUE_NO = [
  { texto: '$ dolphin', tenue: true },
  { texto: 'leo carrito/precio.ts', tenue: true },
  { texto: 'agrego descuentoPorVolumen()', tenue: false },
  { texto: 'actualizo el resumen del carrito', tenue: false },
  { texto: 'listo', listo: true }
] as const

/**
 * Un escalón del portón.
 *
 * Tres estados y no dos: en espera, corriendo y resuelto. El de «corriendo» es el que hace que se
 * lea como una escalera y no como un semáforo — sin él, los tres se prenden casi juntos y no se
 * entiende que uno espera al anterior.
 */
function Escalon({
  nombre,
  desde,
  falla
}: {
  nombre: string
  desde: number
  falla: boolean
}): ReactNode {
  const frame = useCurrentFrame()
  const corriendo = frame >= desde
  const resuelto = frame >= desde + T.entrePasos - 6
  const color = !corriendo
    ? PALETA.tenue
    : !resuelto
      ? PALETA.electrico
      : falla
        ? '#f08a7e'
        : PALETA.listo
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderRadius: 999,
        background: PALETA.hondo,
        border: `1px solid ${corriendo ? `${color}55` : PALETA.linea}`,
        fontFamily: MONO,
        fontSize: 21,
        color: corriendo ? PALETA.texto : PALETA.tenue,
        // En espera el escalón está, pero apagado: se ve que faltan dos antes de que corran.
        opacity: corriendo ? 1 : 0.45
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      <span>{nombre}</span>
      {resuelto ? (
        <span style={{ color, fontWeight: 700 }}>{falla ? '✗' : '✓'}</span>
      ) : null}
    </div>
  )
}

/** El portón de una rama: los tres escalones, uno después del otro. */
function PortonDeLaRama({ desde, fallaEn }: { desde: number; fallaEn: number | null }): ReactNode {
  return (
    <Aparece desde={desde} style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {PASOS.map((paso, i) => (
          <Escalon
            key={paso}
            nombre={paso}
            desde={desde + i * T.entrePasos}
            falla={fallaEn === i}
          />
        ))}
      </div>
    </Aparece>
  )
}

/**
 * Lo que dijo el portón de la rama que no pasó.
 *
 * Va la línea de `tsc` tal cual, con archivo y número: es lo que hace creíble que el portón
 * encontró algo que el agente no vio, y es además lo que Dolphin le devuelve al agente para que
 * lo arregle.
 */
/**
 * El alto que ocupa el error, reservado en LAS DOS columnas.
 *
 * Sin esto la columna de la izquierda no tiene nada debajo de su portón, su terminal crece para
 * llenar el hueco y los dos portones quedan a alturas distintas. Comparar los dos resultados es
 * todo el punto del clip: si no están en la misma línea, hay que buscarlos.
 */
const ALTO_DEL_ERROR = 112

function ElError(): ReactNode {
  return (
    <Aparece desde={T.porton + 2 * T.entrePasos + 8} style={{ marginTop: 10 }}>
      <div
        style={{
          borderRadius: 14,
          background: PALETA.hondo,
          border: '1px solid rgba(240,138,126,0.35)',
          padding: '10px 14px',
          fontFamily: MONO,
          fontSize: 19,
          color: PALETA.tenue,
          lineHeight: 1.45
        }}
      >
        <div style={{ color: '#f08a7e' }}>carrito/resumen.ts(42,18): error TS2554</div>
        <div>descuentoPorVolumen espera 2 argumentos, recibió 1</div>
      </div>
    </Aparece>
  )
}

function Cierre(): ReactNode {
  return (
    <Aparece desde={T.cierre}>
      {/* Corto, porque el panel del aviso mide 1000 px: las dos columnas ya contaron que las dos
          decían «listo», así que acá sólo falta la consecuencia. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 27 }}>
        <span style={{ fontWeight: 600 }}>Las dos dijeron «listo».</span>
        <span style={{ color: PALETA.tenue }}>Una sola llega a tu rama.</span>
      </div>
    </Aparece>
  )
}

/* Acá hubo un chip por rama con su nombre y su modelo. Salió por dos razones, y las dos se vieron
   recién al mirar el cuadro renderizado: decía lo mismo que la cabecera de su propia terminal
   —«rama u1 · sonnet» dos veces, una arriba de la otra— y los 60 px que ocupaba eran justo los
   que le faltaban al error del portón, que terminaba cortado contra el borde. */

export function Porton(): ReactNode {
  const frame = useCurrentFrame()
  const palabrasVisibles = Math.max(0, Math.floor((frame - T.escribeDesde) / T.porPalabra))
  const compositorBaja = interpolate(frame, [T.encabezado, T.encabezado + 12], [0, 120], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  return (
    <Ventana>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', minHeight: 0 }}
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

        <Aparece desde={T.encabezado}>
          <span style={{ fontSize: 32, fontWeight: 600 }}>El portón</span>
        </Aparece>

        <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {/* `minHeight: 0` en las dos columnas: sin eso la terminal no puede encogerse por debajo
              de su contenido y el portón se desborda sobre la línea de cierre. */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <Terminal
              desde={T.primeraTerminal}
              titulo="dolphin/u1"
              modelo="sonnet"
              renglones={LA_QUE_PASA}
              cadaCuanto={16}
              aLaVista={4}
              terminaEn={T.terminaUna}
            />
            <PortonDeLaRama desde={T.porton} fallaEn={null} />
            {/* El hueco del error de la otra columna: lo que mantiene los dos portones alineados. */}
            <div style={{ height: ALTO_DEL_ERROR, flexShrink: 0 }} />
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <Terminal
              desde={T.primeraTerminal + T.entreTerminales}
              titulo="dolphin/u2"
              modelo="sonnet"
              renglones={LA_QUE_NO}
              cadaCuanto={16}
              aLaVista={4}
              terminaEn={T.terminaOtra}
            />
            {/* Falla en el tercero y no en el primero: una rama que ni compila no prueba nada —el
                agente lo habría visto—. Lo que el portón agarra de verdad es lo que rompe en otro
                archivo, dos pruebas más adelante. */}
            <PortonDeLaRama desde={T.porton} fallaEn={2} />
            <div style={{ height: ALTO_DEL_ERROR, flexShrink: 0 }}>
              <ElError />
            </div>
          </div>
        </div>

        {/* El alto se reserva desde el cuadro cero aunque el cierre aparezca al final: `Aparece` no
            ocupa lugar hasta su cuadro, así que sin esto la fila se dimensiona como si el cierre no
            existiera y, cuando aparece, se encima con el error. */}
        <div style={{ height: 38, flexShrink: 0 }}>
          <Cierre />
        </div>
      </div>
      <div style={{ transform: `translateY(${compositorBaja}px)` }}>
        <Compositor texto={TAREA} palabrasVisibles={palabrasVisibles} enviadoEn={T.envia} />
      </div>
    </Ventana>
  )
}
