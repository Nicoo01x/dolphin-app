import { useEffect, useRef, type ReactNode } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import {
  ALTO_DELFIN,
  ANCHO_DELFIN,
  PIXELES_DEL_DELFIN,
  type Letra
} from '../../../../escritorio/src/renderer/src/components/landing/delfin-pixeles'

/**
 * El mar de puntos con los delfines saltando: el mismo que la pantalla de inicio de la app.
 *
 * Es un puerto de `escritorio/src/renderer/src/components/landing/MarDePuntos.tsx` a Remotion, y
 * la única diferencia es de dónde sale el tiempo: allá del reloj (`requestAnimationFrame`), acá del
 * cuadro que se está renderizando. Un clip tiene que salir igual cada vez que se renderiza, y un
 * reloj haría que cada corrida diera un mar distinto.
 *
 * Why importado y no copiado: el dibujo del delfín ya tiene dos copias —la web y la app— porque lo
 * genera un script y se pega en los dos lados. Una tercera, en un video que casi nunca se vuelve a
 * mirar, es la que se queda vieja sin que nadie se entere. Acá se importa el de la app.
 */

/** La grilla lógica, igual que en la app: todo está en estos píxeles, no en los de la pantalla. */
const ANCHO = 200
const ALTO = 132
/** Dónde está la superficie del agua, en reposo. */
const AGUA = 74

const DELFINES = [
  { periodo: 7600, desfasaje: 0, escala: 1.15, alturaDelSalto: 26, desdeX: -34, hastaX: 232 },
  { periodo: 10200, desfasaje: 3400, escala: 0.8, alturaDelSalto: 18, desdeX: 232, hastaX: -34 },
  { periodo: 12800, desfasaje: 6900, escala: 0.55, alturaDelSalto: 12, desdeX: -34, hastaX: 232 }
] as const

const HONDO = '#113354'
const MARINO = '#1b6ca8'
const ELECTRICO = '#19b9ff'
const ESPUMA = '#e8f1f8'
const COLOR_DE_LETRA: Record<Letra, string> = { o: MARINO, c: ELECTRICO, e: HONDO }

const TABLA = new Map<string, Letra>()
for (const p of PIXELES_DEL_DELFIN) {
  TABLA.set(`${p.x},${p.y}`, p.letra)
}

function superficie(x: number, t: number): number {
  return AGUA + Math.round(Math.sin(x / 15 + t / 900) * 1.6 + Math.sin(x / 7 - t / 1400) * 1)
}

function pintarDelfin(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  escala: number,
  giro: number,
  haciaLaIzquierda: boolean
): void {
  const cos = Math.cos(-giro)
  const sen = Math.sin(-giro)
  const cx = ANCHO_DELFIN / 2
  const cy = ALTO_DELFIN / 2
  const alcance = Math.ceil((Math.max(ANCHO_DELFIN, ALTO_DELFIN) * escala) / 2) + 1
  for (let dy = -alcance; dy <= alcance; dy += 1) {
    for (let dx = -alcance; dx <= alcance; dx += 1) {
      // De la pantalla al dibujo: se desgira y se desescala, así no quedan agujeros.
      const ux = (dx * cos - dy * sen) / escala + cx
      const uy = (dx * sen + dy * cos) / escala + cy
      const sx = Math.round(haciaLaIzquierda ? ANCHO_DELFIN - 1 - ux : ux)
      const letra = TABLA.get(`${sx},${Math.round(uy)}`)
      if (letra) {
        g.fillStyle = COLOR_DE_LETRA[letra]
        g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1)
      }
    }
  }
}

function pintarMar(g: CanvasRenderingContext2D, t: number): void {
  const px = (x: number, y: number, color: string): void => {
    g.fillStyle = color
    g.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
  g.clearRect(0, 0, ANCHO, ALTO)
  // Estrellas quietas: siempre las mismas, con una grilla y no con Math.random.
  for (let i = 0; i < 34; i += 1) {
    px((i * 71) % ANCHO, (i * 37) % (AGUA - 16), i % 4 === 0 ? ELECTRICO : MARINO)
  }
  const lunaX = 158
  const lunaY = 26
  for (let y = -7; y <= 7; y += 1) {
    for (let x = -7; x <= 7; x += 1) {
      if (x * x + y * y > 49 || (x - 7) ** 2 + (y - 3) ** 2 <= 56) {
        continue
      }
      px(lunaX + x, lunaY + y, (x * 3 + y * 5) % 11 === 0 ? ELECTRICO : ESPUMA)
    }
  }
  for (let x = 0; x < ANCHO; x += 1) {
    const sup = superficie(x, t)
    for (let y = sup; y < ALTO; y += 1) {
      const hondura = (y - sup) / (ALTO - sup)
      px(x, y, hondura > 0.55 ? HONDO : hondura > 0.14 ? MARINO : ELECTRICO)
    }
    px(x, sup, ELECTRICO)
    if (sup < AGUA - 1 && (x + Math.floor(t / 120)) % 9 === 0) {
      px(x, sup - 1, ESPUMA)
    }
    if (Math.abs(x - lunaX) < 13 && (x * 3 + Math.floor(t / 260)) % 5 < 2) {
      const hondo = sup + 2 + ((x * 7 + Math.floor(t / 300)) % 9)
      if (hondo < ALTO) {
        px(x, hondo, ESPUMA)
      }
    }
  }
  for (const d of DELFINES) {
    const avance = ((t + d.desfasaje) % d.periodo) / d.periodo
    const x = d.desdeX + (d.hastaX - d.desdeX) * avance
    const arco = Math.sin(avance * Math.PI * 3)
    const salto = Math.max(0, arco) ** 1.3 * d.alturaDelSalto
    const y = superficie(x, t) + 4 - salto
    const giro = Math.cos(avance * Math.PI * 3) * (arco > 0 ? -0.5 : 0)
    pintarDelfin(g, x, y, d.escala, d.hastaX < d.desdeX ? -giro : giro, d.hastaX < d.desdeX)
    if (salto > 0.5 && salto < 4) {
      for (let i = -3; i <= 3; i += 1) {
        px(x + i * 2, superficie(x, t) - Math.abs(i), ESPUMA)
      }
    }
  }
}

/**
 * El mar detrás de todo, en píxeles de verdad: la grilla chica estirada sin suavizar.
 *
 * La colocación es la misma que en la pantalla de inicio de la app, y no por parecido: ahí ya está
 * resuelto por qué. Va anclado abajo y con el ancho de una columna —un mar de pared a pared compite
 * con lo que hay que leer— y se desvanece hacia arriba y hacia los costados, así lo que queda a la
 * vista es el agua y los saltos, y no las estrellas sueltas, que estiradas a pantalla completa se
 * leen como suciedad.
 */
export function MarDePuntos({ opacidad = 0.45 }: { opacidad?: number }): ReactNode {
  // Why 0.45 y no el 0.32 de la pantalla de inicio: el mismo mar se mira acá dentro de una tarjeta
  // de 40rem, a menos de la mitad de tamaño, y a 0.32 los saltos no se distinguen del fondo.
  const lienzo = useRef<HTMLCanvasElement>(null)
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // El tiempo del mar sale del cuadro: el mismo cuadro pinta siempre el mismo mar.
  const t = (frame / fps) * 1000
  useEffect(() => {
    const g = lienzo.current?.getContext('2d')
    if (g) {
      pintarMar(g, t)
    }
  }, [t])
  const mascara =
    'linear-gradient(to top, black 30%, transparent 82%), linear-gradient(to right, transparent, black 20%, black 80%, transparent)'
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '-6%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '65%',
        opacity: opacidad,
        maskImage: mascara,
        WebkitMaskImage: mascara,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in'
      }}
    >
      <canvas
        ref={lienzo}
        width={ANCHO}
        height={ALTO}
        style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }}
      />
    </div>
  )
}
