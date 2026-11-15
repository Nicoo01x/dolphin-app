import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { MONO, PALETA } from './paleta'
import { Aparece, Compositor, Ventana } from './piezas'
import { Terminal } from './Terminal'

/**
 * «¿Querés que te pregunte antes de tocar?»: los dos permisos, uno al lado del otro.
 *
 * Es el video del cartel de la opción `mode` del catálogo de Dolphin, que tiene dos valores:
 * «Pregunta antes de tocar» y «Sin preguntar (bypass)». Es una elección que se toma a ciegas y
 * decide si un agente te escribe archivos sin avisar, así que el clip no la explica con palabras:
 * corre LA MISMA tarea de los dos modos a la vez y se ve la diferencia sola. A la izquierda se
 * frena y espera; a la derecha ya terminó.
 *
 * Lo que el clip NO hace es recomendar. Muestra las dos consecuencias —una te espera, la otra no—
 * y la persona elige ahí mismo, que es para lo que existe el cartel.
 *
 * Los tiempos están en cuadros a 30 fps y declarados acá arriba, juntos, como en Delegacion: lo
 * único difícil de un clip así es que las cosas pasen escalonadas y no todas juntas.
 */
const T = {
  escribeDesde: 6,
  porPalabra: 3,
  envia: 33,
  /** El título y los dos modos. */
  encabezado: 45,
  primerModo: 56,
  entreModos: 10,
  /** Las dos terminales abren casi juntas: lo que importa es que corren a la par. */
  primeraTerminal: 78,
  entreTerminales: 8,
  /** La de la izquierda llega al archivo y pregunta. */
  pregunta: 150,
  /** La de la derecha no pregunta y termina. */
  terminaLibre: 192,
  cierre: 212
} as const

const TAREA = 'sacá el console.log que quedó en el checkout'

/** El modo que pregunta: llega al archivo y se detiene. Nunca le llega el visto. */
const QUE_PREGUNTA = [
  { texto: '$ dolphin', tenue: true },
  { texto: 'busco console.log en src/checkout', tenue: true },
  { texto: '4 archivos', tenue: true },
  { texto: 'voy a editar Checkout.tsx' },
  { texto: 'esperando tu respuesta…', tenue: true }
] as const

/** El modo sin preguntar: los mismos pasos, de corrido. */
const SIN_PREGUNTAR = [
  { texto: '$ dolphin', tenue: true },
  { texto: 'busco console.log en src/checkout', tenue: true },
  { texto: '4 archivos', tenue: true },
  { texto: 'edito Checkout.tsx' },
  { texto: 'edito Pago.tsx' },
  { texto: 'edito Resumen.tsx' },
  { texto: 'edito util/log.ts' },
  { texto: '4 archivos, 11 renglones menos', listo: true }
] as const

/** Uno de los dos permisos, rotulado arriba de su terminal. */
function ChipDeModo({
  desde,
  titulo,
  valor,
  acentuado
}: {
  desde: number
  titulo: string
  valor: string
  acentuado: boolean
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
          border: `1px solid ${acentuado ? `${PALETA.electrico}66` : PALETA.linea}`,
          fontSize: 26
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: acentuado ? PALETA.electrico : PALETA.tenue
          }}
        />
        <span>{titulo}</span>
        <span style={{ color: PALETA.tenue, fontFamily: MONO, fontSize: 22 }}>{valor}</span>
      </div>
    </Aparece>
  )
}

/**
 * La pregunta que frena a la izquierda.
 *
 * Es lo único que distingue los dos modos, así que se dibuja como la dibuja la app —una tarjeta
 * con lo que va a hacer y los dos botones— y no como un cartel de aviso. El botón de aceptar
 * queda sin apretar a propósito: el clip termina con la pregunta en pantalla, porque eso ES el
 * modo.
 */
function LaPregunta(): ReactNode {
  return (
    <Aparece desde={T.pregunta} style={{ marginTop: 14 }}>
      <div
        style={{
          borderRadius: 18,
          background: PALETA.tarjeta,
          border: `1px solid ${PALETA.electrico}55`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <span style={{ fontSize: 24, flex: 1, minWidth: 0 }}>¿Edito 4 archivos?</span>
        <span
          style={{
            padding: '6px 16px',
            borderRadius: 999,
            background: PALETA.espuma,
            color: PALETA.fondo,
            fontSize: 21,
            fontWeight: 700
          }}
        >
          Sí
        </span>
        <span
          style={{
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${PALETA.lineaFuerte}`,
            fontSize: 21
          }}
        >
          No
        </span>
      </div>
    </Aparece>
  )
}

function Cierre(): ReactNode {
  return (
    <Aparece desde={T.cierre}>
      {/* Corto a propósito: el panel del aviso mide 1000 px y el cierre largo se partía en dos
          renglones que no entraban. Los chips ya dicen cuáles son los dos modos y las terminales
          muestran que es la misma tarea; acá sólo falta la consecuencia. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 27 }}>
        <span style={{ fontWeight: 600 }}>Una te espera.</span>
        <span style={{ color: PALETA.tenue }}>La otra no.</span>
      </div>
    </Aparece>
  )
}

export function Permisos(): ReactNode {
  const frame = useCurrentFrame()
  const palabrasVisibles = Math.max(0, Math.floor((frame - T.escribeDesde) / T.porPalabra))
  const compositorBaja = interpolate(frame, [T.encabezado, T.encabezado + 12], [0, 120], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  return (
    <Ventana>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%', minHeight: 0 }}
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
          <span style={{ fontSize: 32, fontWeight: 600 }}>Permisos</span>
        </Aparece>

        <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {/* `minHeight: 0` en las dos columnas: sin eso la terminal no puede encogerse por debajo
              de su contenido, y la tarjeta de la pregunta se desborda hacia la línea de cierre. */}
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
            <ChipDeModo
              desde={T.primerModo}
              titulo="Pregunta antes de tocar"
              valor="pregunta"
              acentuado
            />
            <Terminal
              desde={T.primeraTerminal}
              titulo="tu proyecto"
              modelo="sonnet"
              renglones={QUE_PREGUNTA}
              cadaCuanto={14}
              // Cuatro y no cinco: abajo va la tarjeta de la pregunta, que es lo que hay que ver.
              aLaVista={3}
              // Nunca: la tarea no terminó, está esperando. Un visto acá sería mentira.
              terminaEn={Number.POSITIVE_INFINITY}
            />
            <LaPregunta />
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
            <ChipDeModo
              desde={T.primerModo + T.entreModos}
              titulo="Sin preguntar"
              valor="bypass"
              acentuado={false}
            />
            <Terminal
              desde={T.primeraTerminal + T.entreTerminales}
              titulo="tu proyecto"
              modelo="sonnet"
              renglones={SIN_PREGUNTAR}
              cadaCuanto={13}
              aLaVista={6}
              terminaEn={T.terminaLibre}
            />
          </div>
        </div>

        {/* El alto se reserva desde el cuadro cero aunque el cierre aparezca al final: `Aparece`
            no ocupa lugar hasta su cuadro, así que sin esto la fila se dimensiona como si el
            cierre no existiera y, cuando aparece, la tarjeta de la pregunta se le encima. */}
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
