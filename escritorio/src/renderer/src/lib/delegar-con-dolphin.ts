import { useAppStore } from '@/store'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { createNonSecureContextUuid } from '../../../shared/non-secure-context-uuid'
import { aperturaDelCartel, type CartelDeFuncion } from '../../../shared/carteles-de-funcion'

/** Un id del catálogo: sin espacios ni comillas, así se puede escribir en una línea de comando. */
const TOKEN_LLANO = /^[\w.:@/+=-]+$/

/**
 * Abrir la función que cuenta un cartel: una pestaña de Dolphin, delegando.
 *
 * Qué hace de verdad: abre `dolphin --agente <motor>` en una pestaña nueva del mismo espacio de
 * trabajo y, cuando el TUI está listo, le manda el comando que aplica la elección (`/lider opus`).
 *
 * Por qué el comando va después y no como bandera: el `parseArgs` de `dolphin` es estricto y no
 * declara ninguna bandera para el líder, así que mandarlo al abrir mata la pestaña con «Unknown
 * option» antes de pintar nada. `promptInjectionMode` de Dolphin es `stdin-after-start`, así que el
 * lanzador pega el comando en el TUI ya abierto, que es donde el CLI lo acepta.
 *
 * Devuelve false cuando no hay dónde abrirlo o el catálogo dejó de declarar la función; quien llama
 * decide qué decir.
 */
export function delegarConDolphin(cartel: CartelDeFuncion, valor: string): boolean {
  const apertura = aperturaDelCartel(cartel, valor)
  if (!apertura) {
    return false
  }
  const worktreeId = useAppStore.getState().activeWorktreeId
  if (!worktreeId) {
    return false
  }
  // Why la guarda: `agentArgs` viaja como una línea de comando, no como tokens, así que un valor
  // con un espacio se partiría en dos banderas. Hoy son ids del catálogo y no puede pasar; si
  // alguna vez deja de serlo, no abrimos una sesión con el motor equivocado.
  if (!apertura.agentArgs.every((token) => TOKEN_LLANO.test(token))) {
    return false
  }
  const result = launchAgentInNewTabWithOutcome({
    requestId: createNonSecureContextUuid(),
    agent: 'dolphin',
    worktreeId,
    agentArgs: apertura.agentArgs.join(' '),
    // Why condicional: un prompt vacío hace que el lanzador devuelva null y no abra nada.
    ...(apertura.comando
      ? { prompt: apertura.comando, promptDelivery: 'submit-after-ready' as const }
      : {}),
    launchSource: 'unknown'
  })
  return result !== null && !('refused' in result)
}
