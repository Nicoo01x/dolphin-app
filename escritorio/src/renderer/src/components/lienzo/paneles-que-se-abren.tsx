import {
  Bot,
  Columns3,
  FolderTree,
  GitBranch,
  Globe,
  Inbox,
  LayoutGrid,
  Radio,
  Sparkles,
  SquareTerminal,
  TerminalSquare
} from 'lucide-react'
import type { TipoDePanel } from './lienzo-paneles'

/** Las vistas de la consola de Dolphin que pueden vivir en una ventana del lienzo. */
export type VistaDeLaConsola =
  | 'nueva'
  | 'tablero'
  | 'vivo'
  | 'git'
  | 'cosechas'
  | 'memoria'
  | 'bots'
  | 'bandeja'

/** Lo que identifica a una ventana: una vista de la consola, o una de las del escritorio. */
export type QueAbrir = VistaDeLaConsola | 'terminal' | 'navegador' | 'archivos'

const icono = (Que: typeof Radio): React.ReactNode => (
  <Que aria-hidden="true" className="size-3.5" />
)

export const QUE_SE_PUEDE_ABRIR: readonly {
  vista: QueAbrir
  tipo: TipoDePanel
  titulo: string
  icono: React.ReactNode
  /** Lo que mide al abrirse, cuando el tamaño de siempre no le sirve. */
  tamano?: { width: number; height: number }
}[] = [
  // Primero las dos que largan trabajo de verdad: una terminal con el agente adentro y la ventana
  // para sembrar. El resto es para mirar lo que está pasando.
  {
    vista: 'terminal',
    tipo: 'terminal',
    titulo: 'Terminal',
    icono: icono(TerminalSquare),
    // Más ancha que alta: una terminal angosta parte los diffs y las tablas que imprime un agente.
    tamano: { width: 720, height: 420 }
  },
  { vista: 'nueva', tipo: 'consola', titulo: 'Largar un agente', icono: icono(Sparkles) },
  {
    vista: 'navegador',
    tipo: 'navegador',
    titulo: 'Navegador',
    icono: icono(Globe),
    tamano: { width: 640, height: 480 }
  },
  {
    vista: 'archivos',
    tipo: 'archivos',
    titulo: 'Archivos',
    icono: icono(FolderTree),
    // Alta y angosta: un árbol de archivos se lee para abajo, y ancho desperdicia plano.
    tamano: { width: 360, height: 560 }
  },
  { vista: 'vivo', tipo: 'consola', titulo: 'En vivo', icono: icono(Radio) },
  { vista: 'tablero', tipo: 'consola', titulo: 'Tablero', icono: icono(LayoutGrid) },
  { vista: 'git', tipo: 'consola', titulo: 'Git', icono: icono(GitBranch) },
  { vista: 'cosechas', tipo: 'consola', titulo: 'Cosechas', icono: icono(Columns3) },
  { vista: 'bandeja', tipo: 'consola', titulo: 'Bandeja', icono: icono(Inbox) },
  { vista: 'memoria', tipo: 'consola', titulo: 'Memoria', icono: icono(SquareTerminal) },
  { vista: 'bots', tipo: 'consola', titulo: 'Bots', icono: icono(Bot) }
]

/**
 * Las páginas del proyecto: de estas se quiere UNA sola.
 *
 * Van en el rail de la derecha, con la regla de Deska —si ya está, te lleva; si no, la abre—.
 * Dos ventanas de Git sobre el mismo repo no sirven para nada; dos terminales, sí, y por eso
 * las terminales y los navegadores no están acá sino en el dock.
 */
export const PAGINAS_DEL_PROYECTO: readonly QueAbrir[] = ['git', 'archivos', 'bandeja', 'vivo']

export const paginasDelProyecto = (): {
  vista: QueAbrir
  titulo: string
  icono: React.ReactNode
}[] =>
  PAGINAS_DEL_PROYECTO.map((vista) => ({
    vista,
    titulo: tituloDe(vista),
    icono: iconoDe(vista)
  }))

export const iconoDe = (vista: string): React.ReactNode =>
  QUE_SE_PUEDE_ABRIR.find((q) => q.vista === vista)?.icono ?? icono(LayoutGrid)

export const tituloDe = (vista: QueAbrir): string =>
  QUE_SE_PUEDE_ABRIR.find((q) => q.vista === vista)?.titulo ?? 'Consola'

export const tipoDe = (vista: QueAbrir): TipoDePanel =>
  QUE_SE_PUEDE_ABRIR.find((q) => q.vista === vista)?.tipo ?? 'consola'

export const tamanoDe = (vista: QueAbrir): { width: number; height: number } | undefined =>
  QUE_SE_PUEDE_ABRIR.find((q) => q.vista === vista)?.tamano
