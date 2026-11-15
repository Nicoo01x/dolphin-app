/**
 * Cuándo la persona abrió el catálogo de plugins (Ajustes → Plugins, o el de temas de Apariencia).
 *
 * Why: la base sembraba los catálogos de GitHub a los 15 s de arrancar y buscaba actualizaciones
 * de plugins al minuto, sin que nadie lo pidiera. En Dolphin la app no sale a la red por los
 * plugins hasta que alguien abre el catálogo: el IPC del catálogo avisa acá y el arranque engancha
 * la búsqueda de actualizaciones a ese aviso.
 */
let abierto = false
const pendientes = new Set<() => void>()

/** Lo llama el IPC del catálogo cada vez que se lo abre; sólo el primer aviso dispara algo. */
export function avisarQueSeAbrioElCatalogo(): void {
  if (abierto) {
    return
  }
  abierto = true
  const listeners = [...pendientes]
  pendientes.clear()
  for (const listener of listeners) {
    listener()
  }
}

/** Corre `listener` la primera vez que se abre el catálogo, o enseguida si ya se abrió. */
export function cuandoSeAbraElCatalogo(listener: () => void): void {
  if (abierto) {
    listener()
    return
  }
  pendientes.add(listener)
}
