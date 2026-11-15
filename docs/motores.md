# Los motores

Dolphin no trae su propio modelo: corre el agente de terminal que ya tenés instalado y con sesión.
`dolphin motores` los lista y marca cuáles encontró en el PATH.

```bash
dolphin motores
dolphin sembrar --tarea "…" --agente opencode
```

## Los tres que se miden enteros

| `--agente` | CLI | Qué se lee de él |
|---|---|---|
| `claude` | `claude` | el costo en dólares, los tokens, los turnos y la sesión |
| `codex` | `codex` | los tokens de cada `turn.completed` y el motivo de un turno fallido |
| `antigravity` | `agy` | los tokens de `usage` |

De estos tres sale la plata que informa una cosecha. Los demás no dicen cuánto costaron.

## La tabla

Los otros agentes de terminal se parecen mucho entre sí —un comando, el pedido, y que editen los
archivos de la carpeta donde corren—, así que en vez de un módulo cada uno son una fila de
[`src/agentes/motores.ts`](../src/agentes/motores.ts). Sumar el próximo es una fila más.

| `--agente` | CLI | Hasta dónde se verificó |
|---|---|---|
| `gemini` | `gemini` | **corrido acá** |
| `opencode` | `opencode` | **corrido acá** |
| `copilot` | `copilot` | según la documentación de GitHub |
| `cursor` | `cursor-agent` | según la documentación de Cursor |
| `droid` | `droid` | según la documentación de Factory |
| `amp` | `amp` | sin verificar |
| `qwen` | `qwen` | sin verificar |

Esa última columna es a propósito. Las banderas de estos CLI cambian seguido, y es más útil decir
«esta la leí en la documentación pero no la corrí» que hacer como que todas valen lo mismo. Si usás
uno marcado «sin verificar» y hay que ajustarlo, es una fila de esa tabla: un PR de tres líneas.

Ninguno de estos informa plata, así que su costo queda **desconocido** en la cosecha en vez de cero:
un cero haría pasar por gratis lo que no se midió. El portón los trata igual que a los caros, porque
mide lo que escribieron y no quién lo escribió.

### Banderas que no se pueden olvidar

Tres filas tienen una bandera sin la cual el motor *parece* andar y no escribe nada. Están puestas,
y cada una tiene su test:

- **`gemini` y `qwen`: `--skip-trust`.** Medido corriéndolo acá: en una carpeta que no está en su
  lista de confiadas, gemini descarta el modo que acepta ediciones («Approval mode overridden to
  default because the current folder is not trusted») y vuelve a pedir permiso por cada una. Un
  worktree recién abierto nunca va a estar confiado.
- **`cursor`: `--force`.** Sin él, el modo no interactivo propone los cambios y no aplica ninguno.
- **`droid`: `--auto`.** Sin él, `droid exec` corre en solo lectura.

Una rama sin un archivo tocado no es una rama: Dolphin la corta con «no tocó ningún archivo:
contestó en vez de trabajar», que sin estas banderas sería el resultado de todas.

### Cuando falta la sesión

El motivo sale del JSON del propio CLI, no de la última línea de su salida:

```
×  u1 se cayó: When using Gemini API, you must specify the GEMINI_API_KEY environment variable.
```

Antes de leer el JSON, ese mismo caso se veía como «gemini salió con 41: }».

### Cuando falta el CLI

```
no encontré «cursor-agent» en el PATH: instalá Cursor CLI (cursor-agent) o sumá su carpeta al PATH
```

## Cambiar de motor a mitad de tarea

La rama arranca con Claude, a los veinte minutos se termina el cupo de las 5 h y queda a medio
escribir. Con `--relevo` la sigue otro motor **en el mismo worktree**, con el traspaso de lo que ya
se hizo: el pedido completo, por qué se fue el anterior, qué fases ya pasan, qué archivos tocó y lo
último que dijo.

```bash
dolphin sembrar --tarea "…" --agente claude --relevo gemini,codex
```

Tres cosas que vale saber antes de usarlo:

- **No rota entre cuentas del mismo proveedor.** `--agente claude --relevo claude` no se arma: dos
  cuentas de Claude son dos cuentas de Anthropic, y usar la segunda cuando la primera se agotó
  esquiva el límite que la empresa puso. El relevo es a otra empresa. Para elegir entre tus cuentas
  *antes* de empezar está `dolphin cuenta`, que es otra cosa y es legítima.
- **Sólo releva al motor que NO PUDO trabajar**: sin cupo, sin clave, sin sesión, sin binario, 429.
  Un motor que escribió algo y rebotó en una fase lo arregla el bucle de corrección del portón;
  pagarle a un segundo por el mismo error multiplica el gasto de la tarea por los motores de la
  cadena. La lista de lo que cuenta como «no pudo» está en
  [`src/nucleo/relevo.ts`](../src/nucleo/relevo.ts) y la vigila un test.
- **Lo que gastó el que se cayó se paga igual**, y el parte lo dice: «escribió por US$ 0,20; la
  siguió gemini porque claude no pudo trabajar». Sin esa línea, el total de la rama no se entiende.

Antes de pagarle el intento a cada uno se mira su cupo, así que un motor que ya sabemos agotado se
saltea sin costar nada. Y el relevo de **antes** de arrancar sigue existiendo aparte: si Claude no
tiene cupo cuando se prepara la siembra, arranca con Codex sin abrir un worktree de más.

## Cuáles tienen el chat estructurado

Un motor se puede *lanzar* y además se puede *leer*. Son dos cosas distintas: la tabla de arriba
dice cuáles arrancan, y esto dice cuáles, además, se dibujan como una conversación en vez de como
una terminal cruda. La lista vive en
[`escritorio/src/shared/native-chat-agent-support.ts`](../escritorio/src/shared/native-chat-agent-support.ts).

| Motor | Qué se lee | De dónde |
|---|---|---|
| `claude`, `openclaude` | todo: texto, razonamiento, herramientas, tokens y modelo | `~/.claude/projects/<slug>/<id>.jsonl` |
| `codex` | todo | `~/.codex/sessions/…/rollout-<ts>-<id>.jsonl` |
| `grok` | texto y herramientas | `~/.grok/sessions/<cwd>/<id>/chat_history.jsonl` |
| `omp` | texto, herramientas, modelo y tokens | `~/.omp/agent/sessions/…` |
| `opencode`, `opencode2`, `zcode` | texto y herramientas, por SQLite | la base del propio CLI |
| `cursor` | texto y herramientas | `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` |
| `copilot` | texto, herramientas y modelo | `~/.copilot/session-state/<id>/events.jsonl` |

El resto —`gemini`, `droid`, `amp`, `qwen`, `antigravity`, `aider`…— arranca y trabaja igual, pero
se ve como la terminal que es. No es una decisión de gusto: para dibujar una conversación hay que
poder leer el transcript, y cada CLI lo guarda a su manera.

### Lo que falta para sumar un motor a esa tabla

Son seis puntos de registro y el compilador los exige casi todos (`satisfies never` en el resolvedor,
`Record<…>` en los layouts): la lista y el mapeo en `native-chat-agent-support.ts`, un
`transcript-line-decoders-<motor>.ts`, su línea en el barril, el despacho en `transcript-reader.ts`
y en `transcript-tail-reader.ts`, la clave en `TRANSCRIPT_DECODERS`, el layout del nombre de archivo
en `session-file-id-layouts.ts`, la raíz en `AGENT_SESSION_HOME_SEGMENTS` y la rama en
`session-file-resolver.ts`.

Lo que **no** se puede saltear es el decodificador. Un motor agregado a la lista sin él deja el
chat vacío sin ningún error a la vista, que es peor que la terminal cruda.

### Por qué no están los demás, uno por uno

Medido el 08/11/2026 en la máquina de Nico:

- **`gemini`**: `~/.gemini` tiene configuración y cuentas, y ninguna conversación. gemini-cli sólo
  guarda un chat si se lo pedís con `/chat save`, así que no hay nada que leer en una sesión normal.
- **`antigravity`**: sus conversaciones están en `~/.gemini/antigravity/conversations/*.db`, SQLite
  con los mensajes serializados en protobuf adentro. Es el único formato de esta lista que no se
  puede leer sin reconstruir sus esquemas.
- **`droid`, `amp`, `qwen`**: no están instalados acá. Su formato se podría leer de la
  documentación, pero un lector que nunca vio un archivo real es una suposición con tests, y eso es
  justo lo que la última columna de la tabla de arriba existe para no hacer.
