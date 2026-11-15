import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'

/**
 * Cómo se instala cada agente, para poder hacerlo desde el asistente de arranque.
 *
 * El asistente detecta qué agentes hay en el PATH; si el que la persona elige no está, hasta ahora
 * lo único que ofrecía era abrir una página web con las instrucciones. Esta tabla es lo que hace
 * falta para ofrecer instalarlo ahí mismo.
 *
 * **De dónde salen estos comandos.** No de la memoria de nadie: cada uno se verificó contra el
 * registro de npm con dos condiciones, y entra sólo si pasa las dos.
 *
 * 1. El paquete declara en su `bin` EXACTAMENTE el comando con el que el catálogo detecta al
 *    agente. Que el paquete exista no alcanza: `@cline/cli` existe y es el de Cline, pero instala
 *    un binario llamado `clite`, así que instalarlo no haría aparecer `cline` y el botón habría
 *    mentido.
 * 2. El registro ata el paquete a su fabricante: el scope (`@anthropic-ai`, `@openai`, `@google`,
 *    `@github`), el repositorio o el homepage. Sin eso no se puede distinguir al oficial de quien
 *    ocupó el nombre, y acá se le pide a una persona que ejecute algo en su máquina.
 *
 * **Lo que quedó afuera, a propósito.** `@vibe-kit/grok-cli` es de un tercero y el catálogo apunta
 * a x.ai; `hermes-agent` dice en su propia descripción que es un «Unofficial npm bridge»; `dsh-tui`
 * y `mimo-cli` no se pueden atar al proyecto del catálogo; `opencode-ai` y `command-code` no
 * declaran ni repositorio ni homepage. Y hay agentes que directamente no se instalan con npm
 * —aider va por pip, goose y cursor por un script de shell—. Todos esos siguen con el link a sus
 * instrucciones, que es lo que había: un agente sin entrada acá no pierde nada.
 *
 * Verificado el 04/11/2026. Un paquete puede cambiar de nombre o de binario, y por eso la prueba
 * de al lado ata cada comando al `cmd` del catálogo: si alguno se separa, falla acá y no en la
 * máquina de quien lo instale.
 */

export type ComandoDeInstalacion = {
  /** El paquete de npm, tal cual se publica. */
  readonly paquete: string
  /** El binario que deja en el PATH. Tiene que ser el `cmd` con el que el catálogo lo detecta. */
  readonly comando: string
}

const PAQUETES: Partial<Record<TuiAgent, ComandoDeInstalacion>> = {
  claude: { paquete: '@anthropic-ai/claude-code', comando: 'claude' },
  codex: { paquete: '@openai/codex', comando: 'codex' },
  gemini: { paquete: '@google/gemini-cli', comando: 'gemini' },
  copilot: { paquete: '@github/copilot', comando: 'copilot' },
  'qwen-code': { paquete: '@qwen-code/qwen-code', comando: 'qwen' },
  crush: { paquete: '@charmland/crush', comando: 'crush' },
  continue: { paquete: '@continuedev/cli', comando: 'cn' },
  aug: { paquete: '@augmentcode/auggie', comando: 'auggie' },
  amp: { paquete: '@sourcegraph/amp', comando: 'amp' },
  codebuff: { paquete: 'codebuff', comando: 'codebuff' },
  openclaw: { paquete: 'openclaw', comando: 'openclaw' },
  kilo: { paquete: '@kilocode/cli', comando: 'kilo' },
  devin: { paquete: 'devin', comando: 'devin' },
  freebuff: { paquete: 'freebuff', comando: 'freebuff' },
  codebuddy: { paquete: '@tencent-ai/codebuddy-code', comando: 'codebuddy' }
}

/** Qué hay que correr para instalar este agente, o null si no lo sabemos con certeza. */
export function comandoDeInstalacion(agente: TuiAgent): string | null {
  const entrada = PAQUETES[agente]
  return entrada ? `npm install -g ${entrada.paquete}` : null
}

/** Para la prueba que ata esta tabla al catálogo. */
export function paquetesDeInstalacion(): readonly (readonly [TuiAgent, ComandoDeInstalacion])[] {
  return Object.entries(PAQUETES) as unknown as readonly (readonly [
    TuiAgent,
    ComandoDeInstalacion
  ])[]
}
