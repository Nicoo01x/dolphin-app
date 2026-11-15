/**
 * El guion de la demo: qué contesta cada método del runtime cuando no hay ningún runtime.
 *
 * Es un catálogo de método → respuesta. Lo que no está acá se contesta con un fallo propio
 * (`demo_sin_guion`), que la app ya tolera porque cada API web trae su propio valor por defecto:
 * una pantalla sin guion se ve vacía, no rota.
 *
 * Why un mapa suelto y no un servidor de mentira: lo que la demo tiene que mostrar es UNA
 * conversación, no un producto funcionando entero. Simular el runtime completo sería escribir una
 * segunda implementación del backend para que después quede vieja con el primer cambio.
 *
 * Cómo se completa: se abre la demo, se mira `metodosSinGuion()` en la consola y se agrega acá el
 * que haga falta. Se completa con lo que la pantalla necesita y nada más.
 */

/** Lo que vive adentro de la demo: un proyecto, una rama y una conversación. */
export const PROYECTO = {
  id: 'demo-repo',
  nombre: 'dolphin-app',
  ruta: '/demo/dolphin-app'
} as const

export const RAMA = 'dolphin/arregla-el-iva'

type Guion = (params?: unknown) => unknown

/**
 * Las respuestas, por método.
 *
 * Los nombres salen del API web de verdad (`../preload-api/*`), no inventados: si uno cambia de
 * nombre allá, acá deja de haber guion y la demo lo dice en vez de mentir con datos viejos.
 */
export const RESPUESTAS_DE_DEMO: Readonly<Record<string, Guion>> = {
  /**
   * El estado del runtime: lo primero que la app pregunta y de lo que cuelga media pantalla.
   *
   * La forma es la de `RuntimeStatus` (shared/runtime-session-contracts.ts). Van los campos
   * obligatorios y nada más: los opcionales que no declaramos son hosts viejos para la app, que
   * es exactamente lo que la demo es —un host sin casi nada— y así se ejercita ese camino en vez
   * de inventar capacidades que la demo no tiene.
   */
  'status.get': () => ({
    runtimeId: 'demo',
    rendererGraphEpoch: 1,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 1,
    liveLeafCount: 1,
    machineName: 'la demo',
    hostPlatform: 'linux'
  }),
  /**
   * Las skills instaladas. La forma es `SkillDiscoveryResult` (shared/skills.ts) y tiene que ser
   * EXACTA: la app hace `resultado.skills.some(...)`, así que devolver un array suelto —como
   * estaba— deja `skills` en undefined y tira la pantalla entera.
   */
  'skills.discover': () => ({ skills: [], sources: [], scannedAt: Date.now() }),

  /**
   * Si hay git del otro lado. Va envuelto —`{ available }`— y no suelto: devolver el booleano
   * pelado dejaba `.available` en undefined y la demo abría con un cartel de «Git no está
   * instalado» tapando la pantalla.
   */
  'repo.gitAvailable': () => ({ available: true }),

  /** Cuánto trabajó la demo. Es lo que muestra el resumen de la cabecera. */
  'stats.summary': () => ({
    totalAgentsSpawned: 3,
    totalPRsCreated: 1,
    totalAgentTimeMs: 184_000,
    firstEventAt: null
  })

  // Why no hay más entradas todavía: una forma inventada es PEOR que no contestar. Lo que no está
  // acá cae en `demo_sin_guion`, y entonces cada API web usa su propio valor por defecto, que sí
  // tiene la forma correcta porque lo escribió quien conoce el contrato. Las que se agreguen se
  // agregan con el tipo a la vista, como estas tres.
}
