import { useCallback, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { AgentCatalogEntry } from '@/lib/agent-catalog/agent-catalog'
import { comandoDeInstalacion } from '@/lib/agent-install-commands'
import { OnboardingInlineCommandTerminal } from './OnboardingInlineCommandTerminal'

/**
 * Instalar el agente elegido sin salir del asistente.
 *
 * El paso elige un agente mirando el PATH. Si el que la persona quiere no está, lo único que
 * había era un link a una página web: la primera vez que alguien abre Dolphin, el camino era
 * irse a leer documentación y volver.
 *
 * Sólo se ofrece instalar cuando SABEMOS el comando (ver `agent-install-commands`: cada uno
 * verificado contra el registro de npm, y ahí está escrito qué quedó afuera y por qué). Para el
 * resto queda el link, que es lo que había: es mejor mandar a las instrucciones que correr algo
 * inventado en la máquina de otro.
 *
 * El comando se escribe en una terminal de verdad, a la vista. No se corre a escondidas: una
 * instalación global pide permisos, a veces pregunta, y a veces falla — y eso se entiende mirando
 * la salida, no un cartelito que dice que algo salió mal.
 */
export function AgentInstallInline({
  agent,
  aviso
}: {
  agent: AgentCatalogEntry
  /** Lo que dice el cartel: que este agente no está en el PATH. */
  aviso: React.ReactNode
}): React.JSX.Element {
  const [instalando, setInstalando] = useState(false)
  const refreshDetectedAgents = useAppStore((s) => s.refreshDetectedAgents)
  const comando = comandoDeInstalacion(agent.id)

  const alTerminar = useCallback(() => {
    // Al terminar se vuelve a mirar el PATH: si entró, el agente deja de aparecer como ausente
    // y el aviso se va solo, sin que haya que reabrir nada.
    void refreshDetectedAgents()
  }, [refreshDetectedAgents])

  const instrucciones = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="shrink-0"
      onClick={() => void window.api.shell.openUrl(agent.homepageUrl)}
    >
      {translate('auto.components.onboarding.AgentStep.9c163bb0e0', 'Install instructions')}
      <ExternalLink className="size-3" />
    </Button>
  )

  if (!comando) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-status-warning-border px-4 py-2.5 text-xs text-muted-foreground">
        {aviso}
        {instrucciones}
      </div>
    )
  }

  return (
    <div className="shrink-0 rounded-lg border border-status-warning-border px-4 py-2.5 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-3">
        {aviso}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="xs"
            className="shrink-0"
            disabled={instalando}
            onClick={() => setInstalando(true)}
          >
            <Download className="size-3" />
            {translate('components.onboarding.agentInstall.install', 'Install {{value0}}', {
              value0: agent.label
            })}
          </Button>
          {instrucciones}
        </div>
      </div>
      {instalando ? (
        <OnboardingInlineCommandTerminal
          command={comando}
          title={translate('components.onboarding.agentInstall.title', 'Installing {{value0}}', {
            value0: agent.label
          })}
          ariaLabel={translate(
            'components.onboarding.agentInstall.ariaLabel',
            'Install command for {{value0}}',
            { value0: agent.label }
          )}
          description={translate(
            'components.onboarding.agentInstall.description',
            'Press Enter to run it. It installs globally with npm, so it may ask for a password.'
          )}
          terminalHeightPx={180}
          terminalTopMarginPx={16}
          autoScrollIntoView={false}
          onTerminalExit={alTerminar}
          onCommandFinished={alTerminar}
        />
      ) : null}
    </div>
  )
}
