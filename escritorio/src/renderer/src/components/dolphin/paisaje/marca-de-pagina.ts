/**
 * La marca que vuelve vidrio a una página que no es un espacio de trabajo (Ajustes, Skills, Tareas,
 * Automatizaciones…) cuando hay fondo: `data-dolphin-panel` le pone el vidrio y las juntas
 * (`paisaje.css`), y `data-dolphin-pagina` lo que la base pinta adentro (`paisaje-paginas.css`).
 * La pone el contenedor de las páginas (`AppWorkspaceShell`); sin fondo no hace nada.
 */
export const MARCA_DE_PAGINA = {
  'data-dolphin-panel': 'pagina',
  'data-dolphin-pagina': ''
} as const

type QueSeVe = {
  activeView: string
  hasActiveWorktree: boolean
  creationLayoutActive: boolean
}

/**
 * Si lo que se ve es una página y no un espacio de trabajo: cualquier vista que no sea la de las
 * terminales, o esa misma sin espacio abierto (el inicio). El lienzo queda afuera: pinta su propio
 * plano encima de todo.
 */
export function muestraUnaPagina({
  activeView,
  hasActiveWorktree,
  creationLayoutActive
}: QueSeVe): boolean {
  if (activeView === 'lienzo') {
    return false
  }
  return activeView !== 'terminal' || (!hasActiveWorktree && !creationLayoutActive)
}
