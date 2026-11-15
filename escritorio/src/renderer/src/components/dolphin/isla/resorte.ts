/**
 * Un resorte de verdad para las eases de GSAP, como los de la Dynamic Island: masa, rigidez y
 * amortiguación. GSAP no trae resortes, pero una ease es una función del avance (0 a 1) a la
 * posición, y esta la calcula con la física del oscilador amortiguado, desde el reposo.
 */
export type Resorte = { rigidez: number; amortiguacion: number; masa?: number }

/** Abrir: un rebote apenas visible (menos del 3 %), quieto en medio segundo. */
export const RESORTE_ABRIR: Resorte = { rigidez: 300, amortiguacion: 26 }
/**
 * Cerrar: amortiguado crítico, sin rebote, y en la mitad de tiempo (al 95 % en unos 160 ms, como
 * pide la asimetría de entrar 300 / salir 160): lo que se va no se luce.
 */
export const RESORTE_CERRAR: Resorte = { rigidez: 900, amortiguacion: 60 }

// Quieto es a menos de una milésima del final; nunca más de 2 s.
const TOLERANCIA = 0.001
const TOPE_S = 2
const PASO_S = 0.001

function posicionDelResorte({ rigidez, amortiguacion, masa = 1 }: Resorte): (t: number) => number {
  const w0 = Math.sqrt(rigidez / masa)
  const zeta = amortiguacion / (2 * Math.sqrt(rigidez * masa))
  if (Math.abs(zeta - 1) < 1e-6) {
    return (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  }
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return (t) =>
      1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
  }
  const wd = w0 * Math.sqrt(zeta * zeta - 1)
  return (t) =>
    1 - Math.exp(-zeta * w0 * t) * (Math.cosh(wd * t) + ((zeta * w0) / wd) * Math.sinh(wd * t))
}

/** Lo que tarda en quedar quieto y la ease para esa duración (termina exacto en 1). */
export function easeDeResorte(resorte: Resorte): { duracion: number; ease: (p: number) => number } {
  const posicion = posicionDelResorte(resorte)
  // De atrás para adelante: el último momento en que todavía se aleja más que la tolerancia.
  let quieto = 0
  for (let t = TOPE_S; t > 0; t -= PASO_S) {
    if (Math.abs(1 - posicion(t)) > TOLERANCIA) {
      quieto = t + PASO_S
      break
    }
  }
  const duracion = Math.min(Math.max(quieto, PASO_S), TOPE_S)
  return { duracion, ease: (p) => (p >= 1 ? 1 : posicion(p * duracion)) }
}
