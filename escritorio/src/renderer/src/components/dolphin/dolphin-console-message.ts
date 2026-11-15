import type { DolphinPageVista } from '@/store/slices/ui/ui-slice-contract-core'

const CONSOLE_VISTA_PREFIX = 'dolphin:app:vista:'
const DOLPHIN_PAGE_VISTAS: readonly DolphinPageVista[] = [
  'tareas',
  'tablero',
  'cosechas',
  'bandeja',
  'memoria',
  'bots',
  'git',
  'nueva'
]

export function vistaDeMensajeDeConsola(message: string): DolphinPageVista | null {
  if (!message.startsWith(CONSOLE_VISTA_PREFIX)) {
    return null
  }
  const vista = message.slice(CONSOLE_VISTA_PREFIX.length)
  return DOLPHIN_PAGE_VISTAS.some((conocida) => conocida === vista)
    ? (DOLPHIN_PAGE_VISTAS.find((conocida) => conocida === vista) ?? null)
    : null
}
