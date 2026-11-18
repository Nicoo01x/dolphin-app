---
name: dolphin-delegar
description: >-
  Split the user's request into tasks and run each one as a visible Dolphin agent (its own tab,
  showing which AI it is: Claude, Codex, Gemini...), then collect their results. Use inside
  Dolphin when the user says "delegá las tareas", "delegá", "repartí las tareas", "repartilo",
  "usá subagentes", "armá un equipo", "hacelo en paralelo", "que lo hagan varios agentes",
  "delegate the tasks", "use subagents", "split this up" or "in parallel". Inside Dolphin these
  mean Dolphin workers the user can watch, never your own built-in subagent or task tool and never
  a plugin that runs another agent outside Dolphin: those are invisible to the user. ChatGPT, GPT
  and OpenAI mean the codex agent. Never starts agents with permissions skipped unless the user
  asks for it.
---

# Delegar las tareas en agentes de Dolphin

La persona quiere **ver** a cada compañero trabajando: una pestaña por tarea, con el motor que la
hace. Por eso, dentro de Dolphin, «delegá», «repartí» o «usá subagentes» es siempre esta receta y
nunca tu herramienta interna de subagentes (Task/Agent) ni un plugin que corra otro motor por
fuera: esos trabajan escondidos dentro de tu proceso y la persona no los ve.

`DOLPHIN` es el ejecutable con el que corriste `skills get`; escribilo en su lugar en cada comando.

## 0. ¿Estás dentro de Dolphin?

Sí, si existe alguna de estas variables: `DOLPHIN_CLI_COMMAND`, `DOLPHIN_AGENT_SESSION_ID`,
`DOLPHIN_TERMINAL_HANDLE` o `DOLPHIN_WORKTREE_ID`. Si no hay ninguna y `DOLPHIN status --json` no
contesta, no estás en Dolphin: decíselo a la persona en una línea y preguntale si querés que lo
hagas con tus propios subagentes. No inventes el resto de la receta.

## 1. Partir el pedido

- De 2 a 6 tareas **independientes**: que cada una se pueda hacer sin esperar a otra. Si dos tocan
  los mismos archivos, van juntas en una sola tarea o una después de la otra (`--deps`, ver
  `DOLPHIN skills get orchestration --reference references/coordinator-loop.md`).
- Si el pedido no se parte (es una sola cosa), no inventes tareas: delegá una, o hacelo vos y
  decí por qué.
- Cada tarea lleva un título corto (es el nombre de la pestaña) y un brief que se entiende solo:
  qué hay que lograr, qué archivos puede tocar, qué no, y qué evidencia prueba que terminó (tests
  que pasan, el comando que lo muestra). El compañero no ve esta conversación.
- La persona ya te dijo que delegues: no le pidas permiso para el plan. Anuncialo en una lista
  corta (tarea — motor) y lanzá. Preguntá solamente si algo del pedido es ambiguo de verdad.

## 2. Elegir el motor de cada tarea

- El que nombró la persona («que lo haga Codex», «Gemini revisa»). Si no nombró ninguno, el
  mismo motor que sos vos. No mezcles motores por tu cuenta.
- Mirá qué hay instalado antes de lanzar:

  ```text
  DOLPHIN agent list --json
  ```

  Cada `id` es lo que va en `--agent`; `aliases` dice que `chatgpt`, `gpt` y `openai` son `codex`.

- **Si el motor pedido no está en la lista**, no lo cambies en silencio por otro. Decile a la
  persona que no está instalado en esta máquina (o en el host del espacio de trabajo), ofrecé los
  que sí están y seguí con lo que elija.
- **Si está instalado pero no tiene sesión iniciada**, la pestaña del compañero lo muestra (pide
  login) y Dolphin te avisa con una `escalation`. Decile a la persona que inicie sesión en esa
  pestaña, o en una terminal con `DOLPHIN account add --agent <id>` cuando el motor lo admite. No
  corras vos el login: es interactivo y es de la persona.

## 3. Dónde trabaja cada uno

- **Leer, revisar, investigar** (no editan): `--worktree current`, tu mismo espacio de trabajo.
- **Editar código en paralelo** en un repo de git: un worktree propio por tarea, con su rama,
  para que no se pisen: `--worktree new-child --name <nombre-corto>`. Quedan anidados bajo el
  tuyo en la barra lateral y se mantienen abiertos al terminar.
- En una carpeta sin git, o si la persona no quiere ramas nuevas: `--worktree current`, y
  entonces las tareas no pueden tocar los mismos archivos.

## 4. Lanzar cada compañero

Una llamada por tarea, todas seguidas, sin esperar a que termine la anterior. El brief va por
stdin para que las comillas y los backticks no se rompan:

```bash
DOLPHIN orchestration worker-start --spec-file - --task-title "Tests del login" \
  --agent codex --worktree new-child --name tests-login --keep-open --json <<'EOF'
<brief completo de la tarea>
EOF
```

En PowerShell, el brief va en un here-string:

```powershell
@'
<brief completo de la tarea>
'@ | & DOLPHIN orchestration worker-start --spec-file - --task-title "Tests del login" --agent codex --worktree current --keep-open --json
```

- `--keep-open` deja la pestaña abierta cuando termina, para que la persona la lea o le siga
  hablando. Sin eso se cierra sola un par de minutos después.
- Agregá `--model` sólo si la persona nombró un modelo.
- Guardá el `dispatch` y el `task` de cada recibo: con eso lo seguís.
- Si un `worker-start` falla, **no lo repitas**: leé `failedStage` y cargá
  `DOLPHIN skills get orchestration --reference references/recovery-and-cleanup.md`. Las demás
  tareas siguen.

**Permisos.** Cada compañero arranca con los permisos que la persona tiene configurados para ese
motor. Nunca lo lances saltándote los permisos (modo sin confirmaciones, «yolo», banderas que
aprueban todo, argumentos extra a mano) salvo que la persona lo pida con esas palabras. Si un
compañero pide una aprobación, es de la persona: avisale en qué pestaña está y seguí con lo demás.

## 5. Decirle a la persona dónde mirarlos

Apenas lanzaste todo, un mensaje corto:

- una línea por compañero: título — motor — dónde está (la pestaña en este espacio de trabajo,
  o el worktree hijo nuevo en la barra lateral);
- que en la pantalla **Orquestación** de la barra lateral ve todas las tareas y su estado juntas;
- que le vas a traer el resumen cuando terminen.

Y **terminá tu turno**. No esperes con `sleep`, no hagas polling ni scripts que miren: Dolphin te
despierta cuando cada compañero reporta (`worker_done`). En un chat llega como mensaje; en una
terminal llega un aviso con el comando `check` que tenés que correr. Lo que hacer con cada aviso
(preguntas, `escalation`, aprobaciones) está en `DOLPHIN skills get orchestration`.

Si la persona te pide el estado en el medio:

```text
DOLPHIN orchestration worker-list --json
DOLPHIN orchestration worker-read --dispatch <dispatch_id> --source transcript --limit 20 --json
```

## 6. Juntar los resultados

Cuando todos reportaron:

- Por tarea: qué salió, la evidencia que dio el compañero (no la vuelvas a correr salvo que falte
  o se contradiga), la rama o el worktree donde quedó y lo que quedó abierto.
- Si hubo ramas nuevas, ofrecé integrarlas; no las mezcles sin que la persona diga que sí.
- Una tarea que reportó un fallo es un fallo: no la des por hecha.
- Para mandarle más trabajo a uno que ya terminó:
  `DOLPHIN orchestration send --to dispatch:<dispatch_id> --subject "<tema>" --body "<pedido>"`.

## Una sola tarea y la respuesta ya

Si es una sola cosa chica y la persona quiere la respuesta en este turno («preguntale a Codex
qué opina del diff»), alcanza con:

```text
DOLPHIN agent delegate --agent codex --prompt-file - --wait --timeout-ms 600000 --json
```

Abre el chat del otro motor en este espacio de trabajo, a la vista, y te trae su último mensaje.
`settled: "blocked"` es una aprobación o pregunta para la persona: decíselo, no esperes.
