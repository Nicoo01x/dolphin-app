import { describe, expect, it } from 'vitest'
import { getAgentSessionOptionCatalog } from './agent-session/options/agent-session-option-catalog'
import type { CatalogOption } from './agent-session/options/agent-session-option-catalog-types'
import { resolveAgentLaunchCommand } from './agent-launch/startup/tui-agent-launch-command'

/**
 * Lo que se elige al abrir Dolphin desde el «+» tiene que terminar donde el CLI lo toma: el motor y
 * los permisos en banderas de la apertura, y el modelo principal en su comando con barra. Si esto
 * no arma el comando, el selector miente; y si arma uno con una bandera que el CLI no declara, la
 * pestaña se muere al abrir.
 */

/**
 * Las opciones que declara el `parseArgs` de lo que el «+» lanza —`dolphin` a secas— tal como están
 * en dolphin-app/src/dolphin.ts (función `abrir`). Es estricto: cualquier otra bandera lo hace salir
 * con «Unknown option» antes de pintar la pantalla. `--estrategia` y `--modelo` NO están acá: son de
 * `dolphin sembrar`, que es otro comando.
 */
const BANDERAS_QUE_EL_CLI_DECLARA = [
  '--repo',
  '--agente',
  '--verificar',
  '--dangerously-skip-permissions',
  '--demo',
  '--ayuda'
]

const comando = (sessionOptions: Record<string, string>) =>
  resolveAgentLaunchCommand({
    agent: 'dolphin',
    cmdOverrides: {},
    platform: 'linux',
    shell: 'posix',
    sessionOptions
  })

/** Cada valor que una opción puede tomar; un booleano son los dos. */
const valoresDe = (option: CatalogOption): (string | boolean)[] =>
  option.kind.type === 'select' ? option.kind.choices.map((choice) => choice.value) : [true, false]

describe('las opciones de Dolphin en el «+»', () => {
  it('ofrece los cuatro motores, con Claude primero y el de prueba último', () => {
    const catalogo = getAgentSessionOptionCatalog('dolphin')
    expect(catalogo?.models.map((m) => m.id)).toEqual(['claude', 'codex', 'antigravity', 'mentira'])
    expect(catalogo?.models.find((m) => m.isDefault)?.id).toBe('claude')
  })

  it('el motor elegido sale como --agente, y solo eso si no tocaste nada más', () => {
    const r = comando({ model: 'codex' })
    expect(r.ok && r.command).toBe("dolphin '--agente' 'codex'")
  })

  it('los permisos salen solo cuando elegiste el bypass', () => {
    const todo = comando({ model: 'claude', mode: 'bypass' })
    expect(todo.ok && todo.command).toBe(
      "dolphin '--agente' 'claude' '--dangerously-skip-permissions'"
    )
    // «Pregunta antes de tocar» es no mandar la bandera.
    const sinTocar = comando({ model: 'claude', mode: 'pregunta' })
    expect(sinTocar.ok && sinTocar.command).toBe("dolphin '--agente' 'claude'")
  })

  it('el modelo principal no viaja en la apertura: va por /lider', () => {
    const catalogo = getAgentSessionOptionCatalog('dolphin')
    const lider = catalogo?.models
      .find((m) => m.id === 'claude')
      ?.options.find((o) => o.id === 'lider')
    expect(lider?.apply.launchArgs).toBeUndefined()
    expect(lider?.apply.midSession).toEqual({
      kind: 'command',
      build: expect.any(Function)
    })
    expect(
      lider?.apply.midSession?.kind === 'command' ? lider.apply.midSession.build('sonnet') : null
    ).toBe('/lider sonnet')
    // Elegirlo no agrega nada al comando: el CLI no lo toma por bandera.
    const abierto = comando({ model: 'claude', lider: 'sonnet' })
    expect(abierto.ok && abierto.command).toBe("dolphin '--agente' 'claude'")
  })

  it('el modelo principal se ofrece solo en Claude: /lider nombra modelos de Claude', () => {
    const catalogo = getAgentSessionOptionCatalog('dolphin')
    const conLider = catalogo?.models
      .filter((m) => m.options.some((o) => o.id === 'lider'))
      .map((m) => m.id)
    expect(conLider).toEqual(['claude'])
  })

  it('ninguna opción manda una bandera que el CLI no declara', () => {
    const catalogo = getAgentSessionOptionCatalog('dolphin')
    const opciones = [
      ...(catalogo?.models.flatMap((m) => m.options) ?? []),
      ...(catalogo?.unknownModelOptions ?? [])
    ]
    expect(opciones.length).toBeGreaterThan(0)
    for (const option of opciones) {
      for (const valor of valoresDe(option)) {
        for (const token of option.apply.launchArgs?.(valor) ?? []) {
          if (token.startsWith('--')) {
            expect(BANDERAS_QUE_EL_CLI_DECLARA, `${option.id}=${String(valor)}`).toContain(token)
          }
        }
      }
    }
    for (const model of catalogo?.models ?? []) {
      for (const token of catalogo?.modelApply.launchArgs?.(model.id) ?? []) {
        if (token.startsWith('--')) {
          expect(BANDERAS_QUE_EL_CLI_DECLARA, model.id).toContain(token)
        }
      }
    }
  })

  it('lo que ya escribiste a mano manda: no se duplica la bandera', () => {
    const r = resolveAgentLaunchCommand({
      agent: 'dolphin',
      cmdOverrides: {},
      platform: 'linux',
      shell: 'posix',
      agentArgs: '--agente mentira',
      sessionOptions: { model: 'claude' }
    })
    expect(r.ok && r.command).toBe("dolphin '--agente' 'mentira'")
  })
})
