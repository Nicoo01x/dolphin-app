import React from 'react'
import { ALTO_DELFIN, ANCHO_DELFIN, PIXELES_DEL_DELFIN, type Letra } from './delfin-pixeles'

/**
 * El mar detrás del inicio, como un grabado: una trama de puntos en la tinta de la piel sobre el
 * lienzo, y de vez en cuando el delfín del logo que salta.
 *
 * Por qué en tinta y no en azul: Dolphin es monocromo (12/10: «no me gusta el celeste») y el mundo
 * se dibuja en plata sobre negro (27/10: el océano grabado, «MUCHÍSIMO MEJOR»). El color se lee del
 * CSS (`currentColor` con `text-foreground`), así en tema claro los puntos son de tinta oscura y un
 * tema de plugin los arrastra también.
 *
 * Por qué tan quieto: es fondo, no una demo (27/10: «ALGO PROFESIONAL»). El agua deriva despacio,
 * a 20 cuadros por segundo y no a 60, y el delfín salta una vez cada tanto. Con «reducir
 * movimiento» queda una sola escena fija; detrás de otra ventana no pinta nada.
 */

/** Separación de la trama en px de CSS: lo bastante abierta para leerse como puntos y no gris. */
const PASO = 5
/** La opacidad del punto más lleno. El agua no pasa de acá: no compite con lo que hay que leer. */
const ALFA_AGUA = 0.4
const ALFA_DELFIN = 0.72
/** Dónde queda la superficie, como fracción del alto: el resto de arriba es para el salto. */
const NIVEL_DEL_AGUA = 0.46
/** Un salto cada tanto; el resto del tiempo el delfín va por debajo y no se ve. */
const PERIODO_DEL_SALTO = 16000
const CUADRO_MINIMO = 50
/** La escena que se muestra quieta: el delfín en lo alto del salto. */
const MOMENTO_QUIETO = PERIODO_DEL_SALTO * 0.2

const ALFA_DE_LETRA: Record<Letra, number> = { o: 1, c: 0.42, e: 0 }

// El sprite en una tabla, para preguntarle por coordenada: el giro va de la pantalla al dibujo
// (para cada celda se busca qué píxel le toca), que no deja agujeros con cualquier ángulo.
const SPRITE = new Map<string, Letra>(PIXELES_DEL_DELFIN.map((p) => [`${p.x},${p.y}`, p.letra]))

function superficie(columna: number, t: number, base: number): number {
  return base + Math.sin(columna / 9 + t / 3000) * 1.1 + Math.sin(columna / 4.3 - t / 4700) * 0.6
}

/** `libre`: columnas a cada lado del centro donde no puede saltar (ahí hay algo que leer). */
type Escena = { columnas: number; filas: number; libre: number }

/** Cuánta tinta lleva cada celda del agua: más arriba, más lleno; con un rayado ondulado, de grabado. */
function intensidadDelAgua(columna: number, fila: number, sup: number, filas: number, t: number) {
  if (fila < sup - 0.5) {
    return 0
  }
  if (fila < sup + 0.5) {
    return 1
  }
  const hondura = (fila - sup) / Math.max(1, filas - sup)
  const rayado = 0.5 + 0.5 * Math.sin(fila * 1.25 + Math.sin(columna / 7 + t / 5200) * 0.9)
  return (0.18 + 0.82 * (1 - hondura) ** 1.6) * (0.35 + 0.65 * rayado)
}

/** Qué parte del ciclo dura el salto: el resto del tiempo el mar está solo. */
const PARTE_DEL_SALTO = 0.4

/** El delfín en celdas en el momento `t`, o null si está bajo el agua (casi siempre). */
function delfinEn(t: number, { columnas, filas, libre }: Escena) {
  const fase = (t % PERIODO_DEL_SALTO) / PERIODO_DEL_SALTO / PARTE_DEL_SALTO
  // Cruza a la derecha, fuera del centro (donde está el compositor). Si no entra, no salta.
  const desde = Math.max(columnas * 0.55, columnas / 2 + libre) + ANCHO_DELFIN / 2
  const hasta = columnas - ANCHO_DELFIN / 2
  if (fase >= 1 || hasta - desde < ANCHO_DELFIN) {
    return null
  }
  const base = filas * NIVEL_DEL_AGUA
  const salto = Math.sin(fase * Math.PI) ** 1.2 * Math.min(20, filas * 0.5)
  return {
    x: desde + (hasta - desde) * fase,
    y: base + ALTO_DELFIN * 0.4 - salto,
    // Sube de nariz y entra de cabeza: la inclinación sigue a la pendiente del arco.
    giro: -Math.cos(fase * Math.PI) * 0.45,
    escala: 1
  }
}

function pintar(g: CanvasRenderingContext2D, escena: Escena, t: number, color: string): void {
  const { columnas, filas } = escena
  const tinta = new Float32Array(columnas * filas)
  const base = filas * NIVEL_DEL_AGUA
  for (let c = 0; c < columnas; c += 1) {
    const sup = superficie(c, t, base)
    for (let f = 0; f < filas; f += 1) {
      tinta[f * columnas + c] = intensidadDelAgua(c, f, sup, filas, t) * ALFA_AGUA
    }
  }

  const d = delfinEn(t, escena)
  const cos = Math.cos(-(d?.giro ?? 0))
  const sen = Math.sin(-(d?.giro ?? 0))
  const alcance = d ? Math.ceil((ANCHO_DELFIN * d.escala) / 2) + 1 : -1
  for (let dy = -alcance; dy <= alcance && d; dy += 1) {
    for (let dx = -alcance; dx <= alcance; dx += 1) {
      const c = Math.round(d.x + dx)
      const f = Math.round(d.y + dy)
      // Lo que queda bajo la superficie no se dibuja: así se lo ve salir y entrar del agua.
      if (c < 0 || c >= columnas || f < 0 || f >= filas || f > superficie(c, t, base)) {
        continue
      }
      const ux = Math.round((dx * cos - dy * sen) / d.escala + ANCHO_DELFIN / 2)
      const uy = Math.round((dx * sen + dy * cos) / d.escala + ALTO_DELFIN / 2)
      const letra = SPRITE.get(`${ux},${uy}`)
      if (letra) {
        // El ojo es un hueco en el lomo: se borra el agua de esa celda, no se pinta encima.
        tinta[f * columnas + c] = ALFA_DE_LETRA[letra] * ALFA_DELFIN
      }
    }
  }

  g.clearRect(0, 0, columnas * PASO, filas * PASO)
  g.fillStyle = color
  for (let i = 0; i < tinta.length; i += 1) {
    const alfa = tinta[i]
    if (alfa < 0.02) {
      continue
    }
    const radio = 0.55 + Math.min(1, alfa / ALFA_AGUA) * 0.75
    g.globalAlpha = alfa
    g.beginPath()
    g.arc((i % columnas) * PASO + PASO / 2, Math.floor(i / columnas) * PASO + PASO / 2, radio, 0, 7)
    g.fill()
  }
  g.globalAlpha = 1
}

function useQuieto(): boolean {
  const [quieto, setQuieto] = React.useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  React.useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!consulta) {
      return
    }
    const alCambiar = (): void => setQuieto(consulta.matches)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])
  return quieto
}

export function MarDePuntos({
  className,
  centroLibre = 0
}: {
  readonly className?: string
  /** Medio ancho, en px, de la franja central donde el delfín no salta (el compositor). */
  readonly centroLibre?: number
}): React.JSX.Element {
  const lienzo = React.useRef<HTMLCanvasElement>(null)
  const quieto = useQuieto()

  React.useEffect(() => {
    const canvas = lienzo.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) {
      return
    }
    let escena: Escena = { columnas: 0, filas: 0, libre: 0 }
    let color = getComputedStyle(canvas).color
    let cuadro: number | null = null
    let ultimo = 0
    const arranque = performance.now()
    // Arranca con el delfín abajo: el primer salto llega unos segundos después de abrir, no de golpe.
    const momento = (): number =>
      quieto ? MOMENTO_QUIETO : performance.now() - arranque + PERIODO_DEL_SALTO * PARTE_DEL_SALTO
    const dibujar = (): void => {
      if (escena.columnas > 0 && escena.filas > 0) {
        pintar(g, escena, momento(), color)
      }
    }

    const medir = (): void => {
      const { width, height } = canvas.getBoundingClientRect()
      const ppp = window.devicePixelRatio || 1
      escena = {
        columnas: Math.floor(width / PASO),
        filas: Math.floor(height / PASO),
        libre: Math.ceil(centroLibre / PASO)
      }
      canvas.width = Math.round(width * ppp)
      canvas.height = Math.round(height * ppp)
      g.setTransform(ppp, 0, 0, ppp, 0, 0)
      dibujar()
    }
    const alCambiarTamano = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    alCambiarTamano?.observe(canvas)
    // El tema cambia la clase o el estilo de <html>: se relee la tinta y se repinta.
    const alCambiarTema = new MutationObserver(() => {
      color = getComputedStyle(canvas).color
      dibujar()
    })
    alCambiarTema.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    medir()

    const paso = (ahora: number): void => {
      if (ahora - ultimo >= CUADRO_MINIMO) {
        ultimo = ahora
        dibujar()
      }
      cuadro = requestAnimationFrame(paso)
    }
    const frenar = (): void => {
      if (cuadro !== null) {
        cancelAnimationFrame(cuadro)
        cuadro = null
      }
    }
    const arrancar = (): void => {
      if (!quieto && cuadro === null && document.visibilityState !== 'hidden') {
        cuadro = requestAnimationFrame(paso)
      }
    }
    // Detrás de otra ventana no se ve nada, y un cuadro que igual corre es trabajo por nada.
    const alCambiarVisibilidad = (): void =>
      document.visibilityState === 'hidden' ? frenar() : arrancar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    arrancar()
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      alCambiarTamano?.disconnect()
      alCambiarTema.disconnect()
      frenar()
    }
  }, [quieto, centroLibre])

  return (
    <canvas
      ref={lienzo}
      aria-hidden="true"
      className={`block size-full text-foreground ${className ?? ''}`}
    />
  )
}
