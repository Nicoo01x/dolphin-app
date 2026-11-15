# Qué protege cada modo

Un agente de código lee y escribe archivos y corre comandos. Esta página dice qué te protege en cada
modo de Dolphin y, sobre todo, qué NO te protege. Si algo no está en la columna de «sí», no lo
supongas.

## Modo normal (el de siempre)

El agente corre en tu máquina, con tu usuario, en un **git worktree propio**: una carpeta aparte, en
su propia rama.

| Te protege de | Sí / no |
|---|---|
| Que pise tu rama o tus archivos sin commitear | **Sí**: trabaja en su worktree, y lo suyo llega a tu rama solo cuando lo integrás vos |
| Que se cuele algo roto en tu rama | **Sí**: el portón (tus tests, tus tipos, otro modelo que revisa) corta la rama antes |
| Que afloje los tests o toque `.claude/`, `.mcp.json` o los workflows para pasar | **Sí**: el portón antitrampa marca o corta la rama |
| Que deploye, publique o corra migraciones cuando corre solo | **Sí**, en modo automático: la política del portón y los comandos prohibidos |
| Que lea tu home (`~/.ssh`, `~/.aws`, las sesiones de otras apps) | **No**: corre con tu usuario y puede leer lo que vos podés leer |
| Que vea tus variables de entorno (tokens de GitHub, de la nube) | **No**: hereda el entorno de tu terminal |
| Que salga a internet | **No** |

## Modo aislado (`"aislado"` en `dolphin.config.json`)

El agente corre en una **caja**: Docker, Podman o bubblewrap, la que haya en la máquina. Lo único que
ve es su worktree, montado en `/trabajo`.

```json
{ "aislado": { "imagen": "mi-imagen-con-claude", "red": true, "hosts": ["registry.npmjs.org"] } }
```

| Te protege de | Sí / no |
|---|---|
| Que lea tu home y tus otras carpetas | **Sí**: la caja solo monta el worktree |
| Que vea tus variables de entorno | **Sí**: entra un entorno limpio con lo mínimo para correr y **la credencial de su motor** (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`…), nada más |
| Que salga a internet | **Sí, salvo a los hosts de su motor** con `"red": true` y Docker o Podman (ver abajo). Sin `"red"` no tiene red. Con `"red": "completa"` sale a cualquier lado |
| Que se escape de la caja | Depende de la caja: un contenedor sin privilegios (`--cap-drop ALL`, `no-new-privileges`) o bubblewrap con todos los espacios de nombres separados. No es una máquina virtual |
| Lo que corre el portón (tus tests, tu build) | **No**: el portón corre afuera, como siempre. Lo que está en la caja es el agente |

Con Docker o Podman hace falta una **imagen con el motor instalado** (el CLI de Claude, de Codex…) y
con `node` en el PATH (el CLI de Claude lo trae; el relevo de la red filtrada lo usa): Dolphin no la
arma por vos. Con bubblewrap se usa el motor instalado en el sistema.

**Si pediste el modo aislado y no hay caja, el agente no corre.** No se cae a modo normal en silencio:
un aislamiento que se apaga solo cuando falta algo no protege nada. `dolphin doctor` dice si hay caja.

### Qué es de cada rama y qué se comparte

Con varias ramas a la vez —`dolphin cola --concurrencia 3`, un equipo de compañeros, una siembra de
ocho universos— esto es de quién:

| Cosa | De quién |
|---|---|
| El worktree (`/trabajo` adentro) | **De cada rama**: una carpeta por universo, montada en su caja y en ninguna otra |
| El contenedor | **De cada corrida**: `dolphin-agente-<al azar>`, y cortar una rama borra el suyo nomás |
| La caja y su configuración (imagen, red, hosts) | **De cada siembra**: viaja con ella, no con el proceso |
| El puerto y la base de datos del universo | **De cada rama** (ver `nucleo/puertos.ts`), pero **se quedan afuera de la caja**: el entorno que entra está filtrado y solo lleva la credencial del motor |
| El relevo de la red filtrada | **De cada corrida**: `dolphin-salida-<al azar>`, con su proxy en un puerto que da el sistema y su token |
| La red interna `dolphin-sin-salida` | **Compartida**, a propósito: es `--internal`, no tiene ruta a ningún lado y el filtro lo hace el proxy, no la red. Dos agentes que la creen a la vez no se molestan |
| El log de rechazos `~/.dolphin/salida.log` | **Compartido**: se escribe de a una línea y queda fuera de todo worktree, que es el punto |

**La caja es de la siembra y no del proceso.** Hasta el 31/10/2026 era una sola variable para todo el
proceso: `prepararSiembra` la escribía al arrancar cada siembra y el comando se armaba recién al
lanzar el agente, así que con dos siembras a la vez la última en prepararse le cambiaba la caja a la
que ya estaba trabajando. Medido en `tests/aislado-paralelo.test.ts`: la rama A hacía su primer turno
**sin caja** y el segundo **adentro de la caja de la rama B**, con su propio worktree montado en la
imagen de la otra. Y como `leerConfig` devuelve `{}` ante cualquier error —un `dolphin.config.json`
leído a medio escribir alcanza—, bastaba una lectura fallida en una rama para dejar a las otras
corriendo sin caja, que es lo único que este modo promete que no pasa. Ahora cada siembra lleva su
caja con su flujo (`conCaja` en `src/agentes/ejecutar.ts`, sobre `AsyncLocalStorage`) y
`aislarAgentes` quedó para lo que **no** es una siembra: los bots, `dolphin seguir`, un atajo.

Una siembra con caja `null` tampoco se cae a la del proceso: «esta rama corre afuera» es una
decisión, no la falta de una. Sin eso, un repo que no pidió aislamiento se colaba adentro de la caja
del repo que sí lo pidió.

### La red filtrada (`"red": true`)

```
agente ──(red interna dolphin-sin-salida)──▶ relevo ──(bridge)──▶ proxy de Dolphin, en tu máquina ──▶ api.anthropic.com
```

- El agente corre en una red de Docker/Podman creada con `--internal`: **sin ruta a ningún lado**.
- Lo único que alcanza es un **relevo**: un contenedor de la misma imagen con un pie en cada red que
  reenvía bytes a un solo lugar, el proxy. No decide nada. Se va solo si el proxy desaparece.
- El **proxy** corre en tu máquina (`src/nucleo/proxy-salida.ts`), solo entiende `CONNECT` (HTTPS:
  el TLS va de punta a punta, Dolphin no ve lo que viaja) y solo al puerto 443 de:
  - Claude: `api.anthropic.com` y `platform.claude.com` (la API y la renovación de la sesión, según
    la doc de red de Claude Code);
  - Codex: `api.openai.com`, `chatgpt.com` y `auth.openai.com` (OpenAI no publica una lista oficial);
  - lo que pongas en `"hosts"` (`*.ejemplo.com` abre los subdominios, no el dominio pelado).
- Todo lo demás vuelve con **403** y queda anotado en `~/.dolphin/salida.log`, fuera del worktree que
  el agente puede escribir: ahí se ve qué intentó y no pudo.
- El proxy pide un token por corrida (va en `HTTPS_PROXY`, adentro de la caja): otro proceso o
  contenedor de tu máquina no lo puede usar de puerta.
- Adentro va `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`: la telemetría de Claude Code no saldría
  igual, y así no llena el log de rechazos.

Lo que **no** hace: no inyecta credenciales (la del motor sigue entrando a la caja como antes), no
mira adentro del TLS (un host permitido es permitido para todo lo que el agente le mande) y no filtra
lo que corre el portón.

**Con bubblewrap no se puede filtrar.** Para llegar a un proxy del host habría que compartir la red
entera (`--share-net`), y entonces el proxy es una sugerencia, no una pared. Por eso con bubblewrap y
`"red": true` el agente **no corre**: o ponés `"red": "completa"` sabiendo que sale a cualquier lado,
o usás Docker o Podman.

**Cambió el significado de `"red": true`.** Antes era red completa; ahora es la filtrada. Si tu
agente necesita un host más (un registro de paquetes, tu API), sumalo a `"hosts"`; si de verdad
necesita todo, `"red": "completa"`.

**Un motor sin lista no corre con `"red": true`.** Dolphin conoce los hosts de Claude y de Codex y de
nadie más: con Antigravity (`agy`) o un `cmd` propio, y `"hosts"` vacío, el agente no tendría a dónde
salir y cada pedido volvería 403. En vez de dejarlo fallar sin explicación, no arranca y lo dice:
sumá sus hosts a `"hosts"` o poné `"red": "completa"`.

## Lo que falta

- **Un Ctrl+C deja los contenedores vivos.** `matarHijosYa` (ver `src/agentes/procesos.ts`) mata el
  árbol de procesos, y matar al cliente `docker` no para el contenedor: `--rm` o no, sigue escribiendo
  en el worktree. `cortarCorrida` sí lo borra, pero el camino de apagado no pasa por ahí. Peor: el
  worktree queda trabado con un pid que ya no existe, así que la siembra siguiente lo **barre**
  (`barrerHuerfanos`) mientras un contenedor de la anterior todavía escribe adentro. Para arreglarlo
  hay que anotar los contenedores vivos y borrarlos en el apagado, sin bloquearlo (un `docker rm -f`
  suelto y desenganchado, no un `execFileSync` por contenedor).
- **`matarHijosYa` es de todo el proceso**, no de una rama: `hijos` es un `Set` de módulo. Hoy nadie
  lo llama para cortar UNA rama —solo el apagado del proceso y `detener()` del servicio de bots—, así
  que no se pisan; pero el día que algo quiera cortar una rama sola, se lleva los agentes de las
  otras. Cortar una rama es `cortarCorrida`, que mata su árbol y borra su contenedor.
- **El agente ACP no borra su contenedor.** `src/agentes/acp.ts` arma el comando con `comoCorre`, que
  le devuelve el nombre del contenedor, y no lo usa: al cortar el proceso queda el contenedor.
- **El puerto y la base del universo no entran a la caja.** El entorno filtrado deja afuera `PORT` y
  `DATABASE_URL`, así que adentro cada rama ve lo que diga el `.env` copiado del repo. Hoy no se pisan
  porque sin red no llegan a ninguna base, pero con `"red": "completa"` sí.
- Probar la red filtrada de punta a punta en cada máquina. Los tests de Dolphin prueban el proxy
  contra un servidor local (permitido, rechazado, sin token, HTTP en claro) y cómo se arman la red, el
  relevo y el agente; correr la caja de verdad necesita Docker o Podman. Lo que más conviene mirar:
  - **Docker Desktop (Windows, macOS)**: el proxy escucha en el localhost de tu máquina y el relevo
    llega por `host.docker.internal`.
  - **Docker en Linux**: el proxy escucha en la puerta del bridge (`172.17.0.1` por defecto) y el
    relevo llega por `host-gateway`.
  - **Podman**: el relevo llega por `host.containers.internal`; sin rootful no está probado.
- Filtrar la red también con bubblewrap (con un socket del proxy montado adentro y un reenvío local).
- Comprobar en cada máquina, con una prueba de punta a punta, que el agente aislado no lee el home.
