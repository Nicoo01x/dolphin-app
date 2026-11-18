import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { AddRemoteHostMode } from '@/components/sidebar/host-admission/ssh/AddRemoteHostDialog'
import { runSleepWorktrees } from '@/components/sidebar/workspace-actions/sleep/sleep-worktree-flow'
import { launchVpsSetupAgent } from '@/lib/agent-session/launch/vps-setup-agent-launch'
import type { AccionDelCartel } from './servidor-para-correr'

/**
 * Lo que hace cada botón del cartel. Todo sale por caminos que ya existen: el compositor de
 * espacios apuntado al servidor, dormir un espacio, «Conectar una máquina» y el agente del VPS.
 * Nada mueve en vivo lo que corre acá: eso Dolphin no lo sabe hacer, y el cartel no lo promete.
 */

/** El diálogo de conectar una máquina, que vive montado al lado de la cola de avisos. */
export const useConexionDesdeElCartel = create<{ modo: AddRemoteHostMode | null }>(() => ({
  modo: null
}))

export function cambiarConexionDesdeElCartel(modo: AddRemoteHostMode | null): void {
  useConexionDesdeElCartel.setState({ modo })
}

/**
 * «Correr en tu servidor»: abre el compositor de un espacio nuevo de ese proyecto, en el servidor.
 * Si el proyecto ya está ahí, sale de esa copia; si no, el compositor ofrece ubicarlo (clonarlo o
 * elegir la carpeta). Lo que no se subió a git no viaja: está en esta computadora.
 */
function correrEnElServidor(accion: Extract<AccionDelCartel, { tipo: 'correr' }>): void {
  useAppStore.getState().openModal('new-workspace-composer', {
    ...(accion.repoId ? { initialRepoId: accion.repoId } : {}),
    ...(accion.objetivo ? { initialWorkspaceTarget: accion.objetivo } : {}),
    ...(accion.nombre ? { prefilledName: accion.nombre } : {}),
    telemetrySource: 'unknown'
  })
}

export function ejecutarAccionDelCartel(accion: AccionDelCartel): void {
  if (accion.tipo === 'conectar') {
    cambiarConexionDesdeElCartel('server-ssh')
    return
  }
  correrEnElServidor(accion)
}

/** Duerme el espacio acá: cierra sus terminales y detiene sus chats, como el menú del espacio. */
export function dormirAca(worktreeId: string): void {
  void runSleepWorktrees([worktreeId]).catch(console.error)
}

/** Sin servidor: que un agente lo conecte, con la guía del VPS y el doctor en loop. */
export function conectarConUnAgente(): void {
  void launchVpsSetupAgent({}).catch(console.error)
}

/** «Después»: main se calla una hora y, si sigue faltando memoria, vuelve a avisar. */
export function avisarDespues(): void {
  void window.api?.memoriaBaja?.silenciar().catch(() => undefined)
}

export function noAvisarMas(): void {
  void useAppStore.getState().updateSettings({ modoPocaRam: 'apagado' }).catch(console.error)
}
