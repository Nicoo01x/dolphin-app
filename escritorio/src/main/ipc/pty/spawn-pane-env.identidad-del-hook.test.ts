import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withAgentLaunchToken } from '../../agent-launch/agent-launch-token'
import { stampPtySpawnPaneEnv } from './spawn-pane-env'

/**
 * El hook nativo de Windows y la terminal tienen que llamar a las variables igual.
 *
 * El hook corre afuera de la app: es un .exe que lee el entorno que la terminal le dejó. Si busca
 * un nombre que la terminal ya no exporta, se va sin leer stdin y no manda nada — y como siempre
 * contesta `{}` y sale con 0, no hay error en ningún lado. Dolphin se queda sin el id de sesión del
 * agente, el panel del chat resuelve `sessionId: null`, nunca lee el transcript, y la conversación
 * muestra sólo lo que uno escribió y el reloj del turno. Así se veía: la respuesta del agente
 * estaba en el disco y en pantalla no aparecía nada.
 *
 * Pasó de verdad: la app pasó a exportar `DOLPHIN_PANE_KEY` y el hook seguía leyendo
 * `DOLPHIN_PANE_KEY`. Por eso la terminal escribe los dos nombres (`ponerEnvDolphin`) y esta prueba
 * compara las dos puntas en vez de confiar en que alguien se acuerde.
 */

const RAIZ_DEL_HOOK = join(__dirname, '../../../../native/windows-agent-hook')
const FUENTE = readFileSync(join(RAIZ_DEL_HOOK, 'src/main.rs'), 'utf8')
/** El .exe que se publica. Es un artefacto de build, así que no siempre está. */
const BINARIO = join(RAIZ_DEL_HOOK, '.build/dolphin-agent-hook.exe')

/** El bloque donde el hook arma lo que manda: una entrada por campo del formulario. */
const FORMULARIO = /let form = \[([\s\S]*?)\];/.exec(FUENTE)?.[1] ?? ''

/**
 * Las variables de identidad que el hook busca, sin el prefijo. Salen de las entradas que lee del
 * entorno; las que vienen del archivo de coordenadas (`coordinate`) no son identidad y quedan
 * afuera solas.
 */
const BASES = [
  ...new Set(
    [...FORMULARIO.matchAll(/,\s*(?:var|identidad)\("(?:DOLPHIN_)?([A-Z_]+)"\)/g)].map((m) => m[1]!)
  )
]

/** Lo que la terminal le deja a todo lo que lanza. */
function entornoDeLaTerminal(): Record<string, string> {
  const env: Record<string, string> = {}
  stampPtySpawnPaneEnv(env, {
    pane: { paneKey: 'tab-1:leaf-1', tabId: 'tab-1', worktreeId: 'repo::/w' },
    jcodeRuntimeDir: undefined
  })
  return withAgentLaunchToken(env, 'token-1')
}

/**
 * El nombre de una variable de identidad. Era una lista de dos: hasta el 08/11/2026 la
 * terminal escribia tambien el nombre de antes del cambio de nombre, porque el hook de Rust
 * leia ese y no el nuevo. Ahora el hook lee el nuevo y la terminal escribe uno solo.
 */
function deletreos(base: string): string[] {
  return [`DOLPHIN_${base}`]
}

describe('el hook de Windows y la terminal se llaman igual', () => {
  it('el hook busca una identidad de panel', () => {
    expect(BASES).toContain('PANE_KEY')
  })

  // Si no coincidieran, el hook podría salir por la puerta de atrás con una variable y mandar otra.
  it('la variable que lo hace salir es la misma que después manda', () => {
    const guarda = /(?:var|identidad)\("(?:DOLPHIN_)?([A-Z_]+)"\)\.is_empty\(\)/.exec(FUENTE)
    expect(guarda?.[1]).toBe('PANE_KEY')
  })

  it.each(BASES)('la terminal exporta %s', (base) => {
    const env = entornoDeLaTerminal()
    expect(
      deletreos(base).filter((nombre) => nombre in env),
      `El hook lee ${deletreos(base).join(' o ')} y la terminal no exporta ninguno.`
    ).not.toHaveLength(0)
  })

  // El .exe que corre hoy puede ser más viejo que su fuente: recompilarlo pide Rust y el enlazador
  // de MSVC, que no están en toda máquina. Mientras tanto manda lo que el binario busca de verdad.
  it.each(BASES)('el binario publicado busca un %s que la terminal exporta', (base) => {
    if (!existsSync(BINARIO)) {
      return
    }
    const texto = readFileSync(BINARIO).toString('latin1')
    const env = entornoDeLaTerminal()
    const queBusca = deletreos(base).filter((nombre) => texto.includes(nombre))
    if (queBusca.length === 0) {
      // Un binario anterior a `identidad(...)` arma los nombres aparte; nada que comparar.
      return
    }
    expect(
      queBusca.filter((nombre) => nombre in env),
      `El binario busca ${queBusca.join(' y ')}, y la terminal no exporta ninguno: el hook se va ` +
        'sin mandar nada y el chat se queda sin la respuesta del agente.'
    ).not.toHaveLength(0)
  })
})
