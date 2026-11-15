import { removeAgentArgOption } from './agent-session/options/agent-session-option-agent-args'
import type { AgentSessionOptionCatalog, CatalogOption } from './agent-session/options/agent-session-option-catalog-types'

/**
 * Lo que se elige al abrir Dolphin desde el «+» (Nico, 31/10: «configurás parámetros, bypass mode
 * si querés o no, elegís LLM principal»).
 *
 * Son tres decisiones y cada una va por donde el CLI la toma de verdad:
 * - el MOTOR con el que escriben sus agentes, como `--agente` al abrir;
 * - el MODELO PRINCIPAL —el líder: el que parte la tarea y la reparte entre los compañeros, o sea
 *   cuánto piensa y cuánto orquesta— con `/lider`, ya adentro de la sesión;
 * - los permisos, como `--dangerously-skip-permissions` al abrir.
 *
 * Why el modelo principal no sale en una bandera: lo que el «+» lanza es `dolphin` a secas, y su
 * `parseArgs` es estricto (dolphin-app/src/dolphin.ts declara repo, agente, verificar,
 * dangerously-skip-permissions, demo y ayuda, y nada más). Hasta el 31/10 acá había una opción
 * «Estrategia» que mandaba `--estrategia calidad`: esa bandera es de `dolphin sembrar`, que es otro
 * comando, así que el TUI salía con «Unknown option» y la pestaña se moría antes de pintar nada.
 * Una opción que no abre no es una opción. Las que quedan son las que el comando declara, más la
 * que se pide por su propio canal: los comandos con barra del TUI.
 */

/**
 * El modelo que dirige. Son los `MODELOS_PRINCIPALES` del TUI (dolphin-app, src/tui/sesion.ts), y
 * por eso la opción vive SOLO en Claude: `/lider` toma nombres de modelos de Claude, y ofrecerle
 * «opus» a Codex sería ofrecerle algo que no tiene.
 */
const LIDER: CatalogOption = {
  id: 'lider',
  label: 'Modelo principal',
  description: 'El que parte la tarea y la reparte entre los compañeros',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: [
      {
        value: 'opus',
        label: 'Opus',
        description: 'Piensa y reparte más: tareas de varias piezas'
      },
      { value: 'sonnet', label: 'Sonnet', description: 'El del medio' },
      { value: 'haiku', label: 'Haiku', description: 'Barato: tareas de una sola pieza' }
    ],
    // Why sin `defaultIsCliDefault`: sin `/lider` el TUI usa «el más capaz del motor», que no es
    // ninguno de estos tres valores, y decir que es Opus sería afirmar algo que no leímos.
    defaultValue: 'opus'
  },
  apply: {
    // Why solo midSession: el líder se cambia con el comando con barra, que es el único lugar donde
    // el CLI lo acepta. Sin `launchArgs`, la apertura no manda nada por esta opción.
    midSession: { kind: 'command', build: (value) => `/lider ${String(value)}` }
  }
}

/** Si los agentes paran a pedir permiso o no. Apagado por defecto: prender esto es una decisión. */
const PERMISOS: CatalogOption = {
  id: 'mode',
  label: 'Permisos',
  category: 'mode',
  kind: {
    type: 'select',
    choices: [
      { value: 'pregunta', label: 'Pregunta antes de tocar' },
      { value: 'bypass', label: 'Sin preguntar (bypass)' }
    ],
    defaultValue: 'pregunta',
    defaultIsCliDefault: true
  },
  apply: {
    // Why: la bandera existe o no existe; «pregunta» es no mandar nada.
    launchArgs: (value) => (value === 'bypass' ? ['--dangerously-skip-permissions'] : []),
    removeAgentArgs: (tokens) =>
      removeAgentArgOption('dolphin', tokens, ['--dangerously-skip-permissions'])
  }
}

export const DOLPHIN_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  models: [
    {
      id: 'claude',
      label: 'Claude',
      description: 'Escribe con el CLI de Claude, contra tu suscripción',
      isDefault: true,
      options: [LIDER, PERMISOS]
    },
    {
      id: 'codex',
      label: 'Codex',
      description: 'Escribe con el CLI de Codex',
      options: [PERMISOS]
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      description: 'Escribe con el CLI de Antigravity',
      options: [PERMISOS]
    },
    {
      // Why: el agente de prueba de Dolphin no llama a nadie ni gasta: sirve para ver la pantalla.
      id: 'mentira',
      label: 'De mentira (no gasta)',
      description: 'El agente de prueba: hace el recorrido completo sin llamar a ningún modelo',
      options: [PERMISOS]
    }
  ],
  modelApply: {
    launchArgs: (value) => ['--agente', String(value)],
    removeAgentArgs: (tokens) => removeAgentArgOption('dolphin', tokens, ['--agente'])
  },
  // Un motor que no está en la lista (los de `dolphin motores`) igual acepta los permisos.
  unknownModelOptions: [PERMISOS],
  supportsWorkerLaunchPreferences: true
}
