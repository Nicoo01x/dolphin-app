/**
 * Corre un TUI en un PTY de verdad y lo deja escrito como lo veria una terminal.
 *
 * Sirve para comparar nuestro TUI contra otro —Qoder, Claude Code, el que sea— sin sacar fotos
 * de la pantalla: devuelve la grilla de texto y la lista de colores que el programa pidio, que
 * es con lo que se copia un diseño de terminal.
 *
 * Why un PTY: un TUI pregunta si su salida es una terminal; redirigido a un archivo cae a modo
 * simple y lo que se guarda no es lo que la persona ve.
 *
 * Why renderizarlo con xterm en vez de guardar el ANSI crudo: el crudo trae cada movimiento de
 * cursor y cada repintada, asi que leerlo no dice como quedo la pantalla. xterm aplica esos
 * movimientos sobre una grilla y deja exactamente lo que se ve.
 *
 *   node config/scripts/capturar-tui.mjs --salida tui.txt [--segundos 20] [--cols 120]
 *     [--filas 40] [--teclas "\r"] -- <comando> [argumentos...]
 */
import { writeFileSync } from 'node:fs'
import pty from 'node-pty'
import xterm from '@xterm/headless'

const { Terminal } = xterm

function parsearArgumentos(argv) {
  const opciones = { salida: 'tui.txt', segundos: 20, cols: 120, filas: 40, teclas: null }
  const corte = argv.indexOf('--')
  const propios = corte === -1 ? argv : argv.slice(0, corte)
  const comando = corte === -1 ? [] : argv.slice(corte + 1)
  for (let i = 0; i < propios.length; i += 2) {
    const nombre = propios[i]?.replace(/^--/, '')
    const valor = propios[i + 1]
    if (!nombre || valor === undefined) {
      continue
    }
    opciones[nombre] = ['segundos', 'cols', 'filas'].includes(nombre) ? Number(valor) : valor
  }
  return { opciones, comando }
}

const { opciones, comando } = parsearArgumentos(process.argv.slice(2))
if (comando.length === 0) {
  console.error('falta el comando: ... -- <comando> [argumentos]')
  process.exit(2)
}

const term = new Terminal({ cols: opciones.cols, rows: opciones.filas, allowProposedApi: true })
const proceso = pty.spawn(comando[0], comando.slice(1), {
  name: 'xterm-256color',
  cols: opciones.cols,
  rows: opciones.filas,
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
})

let crudo = ''
proceso.onData((d) => {
  crudo += d
  term.write(d)
})

// Teclas opcionales a medio camino, para llegar a una pantalla que no es la primera.
if (opciones.teclas) {
  setTimeout(
    () => proceso.write(opciones.teclas.replace(/\\r/g, '\r').replace(/\\n/g, '\n')),
    (opciones.segundos * 1000) / 2
  )
}

setTimeout(() => {
  try {
    proceso.kill()
  } catch {
    // ya murio
  }
  const lineas = []
  for (let y = 0; y < opciones.filas; y++) {
    lineas.push(term.buffer.active.getLine(y)?.translateToString(true) ?? '')
  }
  // Los colores, para poder copiarlos: cada rgb que el TUI pidio, con cuantas veces aparece.
  const colores = new Map()
  // Why armado y no literal: el ESC que abre una secuencia ANSI es un caracter de control, que es
  // justo lo que hay que buscar acá, y escrito en el literal el linter lo marca con razón.
  const SECUENCIA_DE_COLOR = new RegExp(
    `${String.fromCharCode(27)}\\[(3[89]|4[89]);2;(\\d+);(\\d+);(\\d+)m`,
    'g'
  )
  for (const m of crudo.matchAll(SECUENCIA_DE_COLOR)) {
    const canales = [m[2], m[3], m[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    const hex = `#${canales}`
    const clave = `${m[1] === '38' ? 'texto' : 'fondo'} ${hex}`
    colores.set(clave, (colores.get(clave) ?? 0) + 1)
  }
  const resumen = [...colores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `  ${c} x${n}`)
    .join('\n')

  writeFileSync(
    opciones.salida,
    `# ${comando.join(' ')}\n# ${opciones.cols}x${opciones.filas}\n\n${lineas
      .join('\n')
      .replace(/\s+$/, '')}\n\n# COLORES PEDIDOS\n${resumen || '  (ninguno truecolor)'}\n`,
    'utf8'
  )
  console.log(`${opciones.salida} · ${crudo.length} bytes crudos · ${colores.size} colores`)
  process.exit(0)
}, opciones.segundos * 1000)
