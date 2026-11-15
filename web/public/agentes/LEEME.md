# Logos de los agentes

Los usa la marquesina de «Con el agente que ya pagás.» (`src/components/home/Marquesina.tsx`).
Son los mismos que dibuja la app de escritorio (`AgentIcon`), copiados de
`escritorio/src`. Si la app cambia un logo, se vuelve a copiar de ahí.

## SVG (glifos que la app dibuja a mano)

Pasados a archivo sueltos. Donde la app usa `currentColor`, acá va la tinta de la página
(`#0b0d10`), porque un `<img>` no hereda color.

| Archivo | De dónde |
|---|---|
| `claude.svg` | `renderer/src/components/status-bar/icons.tsx` → `ClaudeIcon` |
| `droid.svg` | `renderer/src/components/status-bar/icons.tsx` → `DroidIcon` |
| `copilot.svg` | `renderer/src/components/agent/icons/agent-icon-glyphs.tsx` → `CopilotIcon` |
| `opencode.svg` | `agent-icon-glyphs.tsx` → `OpenCodeIcon` |
| `kilo.svg` | `agent-icon-glyphs.tsx` → `KiloIcon` |
| `aider.svg` | `agent-icon-glyphs.tsx` → `AiderIcon` |
| `pi.svg` | `agent-icon-glyphs.tsx` → `PiIcon` |
| `omp.svg` | `agent-icon-glyphs.tsx` → `OmpIcon` |

## PNG / WebP (favicons)

De `shared/agent-icons/*.png`, los que lista `renderer/src/components/agent/icons/agent-favicon-assets.ts`.
Los que pesaban más de 2 KB se pasaron a WebP sin pérdida (y `freebuff`, que venía en 512 px, se
bajó a 64): `codebuddy`, `crush`, `freebuff`, `muse`, `qoder`, `zcode`. El resto va como vino.

## Codex

`codex.webp` es el ícono propio de la app Codex (la nube azul y violeta con `>_`), no el nudo de
OpenAI: el nudo es la marca de OpenAI y de su cuenta, y la app lo sigue usando ahí (barra de uso,
cuentas). Ni el repo `openai/codex` ni la extensión de VS Code (`openai.chatgpt`) ni el favicon de
`chatgpt.com/codex` lo traen: los tres usan el nudo. Sale de la app de escritorio oficial de OpenAI,
que lo trae como ícono elegible de la app:

- Paquete: `https://persistent.oaistatic.com/codex-app-prod/linux/deb/latest/chatgpt_amd64.deb`
  (el que enlaza `https://chatgpt.com/codex`; versión del 13/11/2026).
- Dentro: `usr/lib/chatgpt/resources/app.asar` → `webview/assets/codex-app-ga-logo.dfddfb85d7.png`,
  PNG de 104×104 con transparencia (no hay versión vectorial publicada).

En la app de escritorio va tal cual (`shared/agent-icons/codex.png`). Acá se bajó a 64 px y se pasó a
WebP sin pérdida, como el resto. Es marca de OpenAI y se usa solo para nombrar al agente (uso
nominativo, igual que los demás logos): no se le cambia nada más que el tamaño.

`qoder-cn` no está: usa el mismo ícono que `qoder`. `openclaude.png` existe en la carpeta de la app
pero `agent-favicon-assets.ts` no lo usa, así que tampoco va.
