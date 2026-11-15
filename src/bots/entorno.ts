import type { Bot } from "./almacen.js";

const SECRETO = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i;
const BLOQUEADAS = /^(DOLPHIN_TELEGRAM_|GH_|GITHUB_|AWS_|OPENAI_)/i;
const AUTENTICACION: Record<Bot["motor"], readonly string[]> = {
  claude: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "AWS_BEARER_TOKEN_BEDROCK", "CLAUDE_CONFIG_DIR"],
  codex: ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME"],
  mentira: [],
};

/**
 * El bot hereda lo operativo, nunca los secretos del proceso padre. Las excepciones de
 * autenticación son las mínimas que el motor puede necesitar y la lista del bot es explícita.
 */
export function entornoDelBot(bot: Bot, entorno: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const permitido = new Set(["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "LANG", "LC_ALL", ...(bot.entorno ?? []), ...AUTENTICACION[bot.motor]]);
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(entorno)) {
    if (!valor || !permitido.has(clave)) continue;
    // La lista explícita es una decisión del dueño; incluso puede habilitar una variable que normalmente bloqueamos.
    if ((BLOQUEADAS.test(clave) || SECRETO.test(clave)) && !permitido.has(clave)) continue;
    salida[clave] = valor;
  }
  return salida;
}
