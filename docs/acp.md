# Agentes que hablan ACP

Hasta acá, sumarle un motor a Dolphin era escribir código: sus banderas, cómo recibe el pedido,
dónde deja la respuesta, cómo se le lee el costo. Una fila en la tabla de `agentes/motores.ts` en
el mejor caso, un módulo entero en el peor.

ACP ([Agent Client Protocol](https://agentclientprotocol.com)) da vuelta eso. Es un protocolo
abierto para hablar con un agente de código, así que **un solo cliente sirve para cualquiera que lo
hable**, y sumar uno es decir con qué comando se lanza.

```json
{ "acp": { "cmd": "gemini", "args": ["--experimental-acp"] } }
```

Después, como con cualquier motor:

```bash
dolphin sembrar "exportar los pedidos a CSV" --agente acp
```

## Qué gana Dolphin con esto

- **Agentes que no tenemos.** Lo hablan Gemini, el adaptador de Claude, Codex, Cursor, OpenCode y
  varias decenas más, además de todo lo que aparezca mañana sin que nadie toque este repo.
- **Saber cuánto salió.** El agente manda su gasto (`usage_update`) mientras trabaja. Con los CLI
  eso había que adivinarlo leyendo su salida, y casi siempre el costo quedaba desconocido.
- **Ver lo que hace mientras lo hace.** Cada herramienta que usa, con su estado, y su plan cuando
  lo cambia. Es lo mismo que Dolphin ya muestra de Claude, pero sin parsear nada.

## Qué le concede Dolphin al agente, y qué no

Un agente ACP es código de terceros corriendo sobre el repo de alguien. Lo que se le concede es
explícito, porque en ACP lo que el cliente no anuncia, el agente no puede pedir:

- **Leer y escribir archivos: sí, y solo adentro del worktree.** Es la caja de siempre. Una ruta de
  afuera no es un caso raro: es un agente de terceros tocando el repo de la persona, y se niega
  (hay un test que lo prueba, y que además comprueba que el archivo de afuera no quedó escrito).
- **Permisos: se conceden solos.** El universo es un worktree descartable y el portón mira el diff
  después; preguntar por cada herramienta sería preguntar por algo que ya está acotado. Y a las
  tres de la mañana no hay a quién preguntarle.
- **Terminal: no.** No le ofrecemos correr comandos a través nuestro, así que el agente que quiera
  ejecutar algo lo hace con sus propios medios y bajo su propio sandbox, nunca con los permisos de
  Dolphin. Es la diferencia entre «el agente corrió un comando» y «Dolphin corrió un comando que
  le dictó el agente».

## Cómo es por dentro

- `agentes/acp-protocolo.ts` — el transporte: JSON-RPC 2.0 por stdio, **un mensaje por línea** (no
  es LSP, no hay cabeceras `Content-Length`). Es bidireccional sobre el mismo par de tuberías, así
  que al leer hay que distinguir tres cosas: la respuesta a algo que pedimos, un pedido del agente
  y un aviso.
- `agentes/acp.ts` — el cliente: el apretón de manos (`initialize`), la sesión sobre el worktree
  (`session/new`), el turno (`session/prompt`), los avisos que llegan mientras trabaja
  (`session/update`) y lo que el agente nos pide a nosotros.
- `agentes/acp-motor.ts` — el motor de Dolphin: arma el mismo pedido que recibe Claude, porque la
  memoria es del proyecto y no del modelo.

## Cómo se prueba sin gastar un peso

`tests/fixtures/agente-acp.mjs` es un agente ACP de mentira que habla el protocolo **de verdad**.
Lo que hace lo decide el texto del pedido, así que cada test pide lo que necesita probar: que
escriba un archivo, que intente escapar del worktree, que pida permiso, que mande su plan, que diga
cuánto gastó, que se niegue.

Con eso se prueba el cliente entero —incluida una siembra completa con `--agente acp`, su worktree
y su portón— sin gastar un centavo y sin depender de que haya un CLI instalado en la máquina.

## Lo que falta

- **La v2 del protocolo**, que está en borrador y trae mensajes más ricos, compactación y
  configuración de la sesión. Este cliente negocia la v1, que es la que todos hablan hoy.
- **Autenticación.** Si `session/new` contesta `auth_required` (código -32000), hoy la corrida
  falla con ese mensaje. El agente se autentica por su lado, con su propio `login`, antes.
- **`session/load`**, para retomar una sesión en vez de empezar una nueva. Es lo que haría que el
  bucle Code → Test → FIX siga la misma conversación en vez de arrancar de cero en cada corrección.
