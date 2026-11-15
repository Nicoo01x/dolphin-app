# El portón, la memoria y el resto del núcleo

## La idea

Con agentes, escribir código dejó de ser el cuello de botella. Lo caro ahora es **verificar**: leer
diffs que nadie pidió tan grandes, levantar la app para ver si anda, descubrir a la semana que un
cambio «que pasaba todo» no hacía lo que se pidió.

Dolphin saca tu atención de esa ruta. Cada cambio pasa por un **portón** que corre solo: primero lo
que no cuesta nada (tus tests, tus tipos, la app usada por cinco personas) y recién después lo que
cuesta (un juez que mira la pantalla, un revisor que lee el diff). Lo que falla vuelve al agente con
el motivo y se corrige ahí mismo. A vos te llega una rama que ya pasó todo eso, o el motivo exacto
por el que no.

## La siembra y el portón

Cada rama trabaja en su propio worktree, con su puerto y su base, las dependencias enlazadas y los
`.env` copiados: dos ramas no se pisan. «Enlazadas» quiere decir el `node_modules` de la raíz **y** el de
cada paquete anidado que tiene el suyo (una `apps/web/` o un `escritorio/` con su propia instalación),
cada uno en la misma ruta del worktree; si la rama no tiene ese paquete, no se crea la carpeta. En un
monorepo, la raíz instala y los miembros de su workspace quedan con lo que esa instalación arma; sólo
se enlazan los paquetes que son su propio workspace. Al cerrar el universo se sueltan todos los enlaces
antes de borrarlo, y los `node_modules` del repo quedan como estaban. Por eso, con algo enlazado, al
agente que corre solo se le prohíbe instalar o cambiar dependencias (escribiría en el `node_modules` de
todas las ramas): una dependencia nueva va en el `package.json` y se ve en el diff. Después cruza el portón, **ordenado por costo**, y cada
escalón corre solo sobre las que pasaron el anterior:

| Fase | Cuesta | Qué mira |
|---|---|---|
| configuración | gratis | que la rama no toque lo que el repo ejecuta solo (`.claude/`, `.mcp.json`, hooks) |
| política | gratis | lo que corre solo no deploya ni toca migraciones |
| seguridad | gratis | claves en el bundle del front, tablas sin RLS, endpoints que escriben sin autenticar ([seguridad.md](seguridad.md)) |
| memoria | gratis | tus correcciones de siempre, como verificadores |
| tus scripts | gratis | lo que pases en `--verificar`: `typecheck`, `test`, `lint`… |
| pantalla | gratis | la app de la rama, usada por cinco personas |
| vision | barato | un juez que mira la app andando, nunca el código |
| revisión | barato | otro modelo lee el diff contra la tarea |

Lo que rebota **vuelve al agente** con el veredicto, que corrige retomando su propia sesión (se paga
solo la vuelta), y la misma fase se vuelve a correr. Si la corrección rompe una fase que ya pasaba,
se deshace. Con `--n` se abren varias ramas con enfoques distintos —la mínima, la de raíz, test
primero, la defensiva— y entre las que pasan **gana la más simple**: la que no cambió tests
existentes, después la que no suma dependencias, después la que toca menos.

Si una fase no pudo correr —no hay Chrome, el revisor no contestó en el formato pedido—, la rama no
se castiga por un problema de la máquina, pero tampoco se dice que pasó: queda **«elegida, sin
revisión»**, en ámbar, con el motivo.

Y la escalera no se termina acá: **una fase se escribe y se comparte** como un módulo de npm o un
archivo del repo, declarada en `porton.fases` de `dolphin.config.json`. `dolphin fases` lista todo
lo que cruza una rama en este repo —las de Dolphin, las del repo y las de terceros— con qué hace
cada una, cuánto cuesta y si hoy corre. Cómo se escribe, qué recibe y qué se le concede a una fase
ajena: [fases.md](fases.md).

```bash
dolphin sembrar --repo "D:/mi-proyecto" \
  --tarea "el total del carrito cobra el IVA dos veces" \
  --verificar "typecheck,test" --agente claude
```

La rama queda commiteada a tu nombre, sin co-autores. Desde la consola la mergeás, la descartás o le
abrís un PR en borrador con la evidencia como descripción. Opciones de `sembrar`: `--n`,
`--verificar`, `--agente claude|codex|antigravity|mentira`, `--modelo`, `--estrategia`,
`--reintentos`, `--presupuesto`, `--issue` (siembra un issue de GitHub), `--automatico` (sin pedir
permisos, con la política en el portón), `--suscripcion`, `--sucio` (guarda los worktrees de las
ramas que no se eligen) e `--igual` (siembra aunque el repo ya esté en rojo).

## La cola de verificación

Cada escalón corre sobre todas las ramas a la vez, y los comandos que lo componen (`typecheck`,
`test`, `build`…) son pesados: con tres universos, tres `tsc` juntos pueden comerse varios GB y dejar
la máquina sin memoria. Por eso los **comandos** del portón —no las fases que leen archivos, como
specs, memoria o seguridad— pasan por una cola única: como mucho **K** corriendo a la vez en toda la
máquina, y el resto espera su turno **en orden de llegada**.

Es una cola *entre procesos*, no un semáforo adentro de uno: las siembras de la consola, la cola y el
equipo son procesos aparte, y cada uno sumaría sus K. Los turnos son archivos (`lugar-N.lock` y
tickets `fila-*.fila`) en `dolphin-verificacion-<usuario>/` bajo la carpeta temporal del sistema, sin
dependencias ni nada de POSIX. Un lugar cuyo proceso murió —o que no late hace 5 minutos— se
recupera solo, así que un proceso caído no deja la cola trabada. Al salir, Dolphin suelta lo suyo.

- **El tope de tiempo del comando no cuenta la espera**: los 180 s empiezan cuando arranca de verdad.
- **La espera queda a la vista**: en la pasada (`esperaMs`), en la bitácora de la rama y, si pasa de
  un segundo, en el detalle («test: pasó (esperó 42 s su turno en la cola)»).
- **Se puede mirar sin tocar.** `dolphin doctor` termina con una línea («Verificación: 2 de 2 lugares
  tomados, 3 esperando») sólo cuando hay algo tomado o esperando; sale de `estadoDeLaCola()`, que lee
  los mismos archivos sin tomar ni borrar nada (el archivo de cada lugar guarda pid, trabajo y desde cuándo).
- **El robo de un huérfano no le saca el lugar a un vivo que latió en el medio**: lo que se lleva tiene
  que seguir igual en contenido *y* en hora de modificación (el latido sólo cambia la hora).
- **Cómo se cambia K.** Por defecto es `max(1, min(memoria en GB / 8, núcleos / 2))`. Se fija con la
  variable de entorno `DOLPHIN_VERIFICACIONES_A_LA_VEZ=2` o con `porton.verificacionesALaVez` en
  `dolphin.config.json`; la variable gana. Un valor que no sea un entero positivo se ignora.

## El portón desde afuera (MCP)

El portón no exige adoptar Dolphin. Con `dolphin mcp --repo <tu repo>` el mismo portón queda
disponible como MCP server, y el agente que ya usás —Claude Code, Codex, el que sea— lo llama
directo:

```bash
dolphin mcp instalar          # imprime el comando de alta
claude mcp add dolphin -- dolphin mcp --repo /ruta/a/tu/repo
```

| Herramienta | Qué contesta |
|---|---|
| `porton_fases` | Las fases que va a cruzar una rama de este repo, de la más barata a la más cara, con las que nacieron de tus correcciones adentro. Mirarlas antes de escribir es saber contra qué se mide el trabajo. |
| `porton_probar` | Cruza una rama y devuelve fase por fase qué pasó, y si rebotó, en qué fase y por qué — en las mismas palabras que verías vos: «test: ✖ suma con negativos». |

Dos reglas hacen que se pueda llamar sin miedo:

- **No toca el árbol de trabajo de nadie.** Se prueba el *commit* de la rama en un worktree propio y
  descartable. Lo que tengas sin commitear sigue donde estaba, y el worktree se cierra incluso si la
  rama rebota.
- **No gasta.** Solo corren las fases gratis: tipos, lint, tests, los comandos que configuró el repo
  y los verificadores de la memoria. Vision y la revisión cruzada pagan un modelo y quedan afuera;
  la respuesta las lista en `sinCorrerPorqueCuestan` en vez de hacerlas pasar por pasadas. Que una
  llamada de un agente dispare gasto a espaldas de quien paga es justo lo que no queremos.

Lo que la rama *agrega* se mide contra de dónde salió (el ancestro común con `HEAD`), no contra su
propia punta: con la base mal puesta, las fases que leen el diff no ven nada y pasan de taquito. La
respuesta dice qué base usó.

### El tablero, por el mismo servidor

Por `dolphin mcp` también viaja el tablero del proyecto. Existe por una cosa que pasa todo el
tiempo: el agente descubre algo mientras hace otra cosa —«de paso vi que el login no valida el
mail»— y eso se pierde en el chat. Con esto lo anota y sigue.

| Herramienta | Qué hace |
|---|---|
| `tablero_listar` | Las tarjetas, con filtro por columna y un tope (40 por defecto). Dice si cortó la lista. |
| `tablero_ver` | Una tarjeta entera: detalle, cómo se sabe que terminó, comentarios y por dónde pasó. Acepta el principio del id, como git. |
| `tablero_anotar` | Anota algo. **Siempre cae en Ideas**, con origen `mcp`. Si ya hay una que dice lo mismo, no anota de nuevo: devuelve cuál era. |
| `tablero_comentar` | Deja un comentario firmado como `mcp`. No cambia la columna. |

**Puede mirar y sumar; no puede mover, editar ni borrar**, y eso no es una omisión:

- mover a Hecho es decir «esto terminó», y eso lo dicen el portón o vos;
- mover a Para hacer es asignarse trabajo solo, que es justo lo que el tablero existe para que
  decidas vos;
- editar o borrar le deja cambiar lo que escribiste, sin que quede rastro.

Por eso todo lo que entra por acá espera aprobación, igual que los TODO del código y los issues.

## Pantalla y Vision

La fase de pantalla no «cliquea todo»: usa la app como cinco personas concretas.

| | Cómo es | Qué le molesta |
|---|---|---|
| **pulgar** | 390 px, táctil, una mano | desbordes, targets menores a 44 px, texto cortado |
| **teclado** | no usa el mouse | foco invisible, botones sin nombre accesible |
| **desconfiado** | pega razones sociales de 90 caracteres e importes de nueve cifras | lo que revienta las cajas |
| **apurado** | doble click en todo | errores de consola, requests caídos |
| **subte** | una barra de señal | esperas sin aviso |

Solo cuenta lo **nuevo**: lo que ya estaba roto en la rama principal no es culpa de la rama. Lo que
falla queda grabado en video.

**Vision** (se prende en la config) recorre la app de la rama como alguien que recién llega, en la
compu y en el teléfono. Después un juez de **otro modelo** decide si la tarea está cumplida mirando
solo las capturas y lo que encontró. Sin evidencia no hay nota, y sin nota la rama no pasa.

## Uso

`pantalla` dice que la app no se rompe y `vision` mira capturas de un recorrido fijo. Ninguna **usa**
lo que la rama cambió. La fase `uso` (barata, se prende con la clave `uso` de la config) hace eso:
levanta la app de la rama con un perfil descartable, y un modelo barato —nunca el que escribió— la
maneja por depuración remota: mira la pantalla, toca, teclea y lee la consola y la red. Sirve para
apps web y también de **escritorio** (Electron), que `pantalla` no alcanza.

Nació de un caso real: una función pasó tipos y tests, y en la app corriendo todas sus imágenes daban
404. Sólo se vio cuando alguien abrió la ventana y pidió una.

El modelo devuelve qué hizo, qué vio y si anda; **la decisión es del código**:

| Lo que dice el modelo | Qué pasa con la rama |
|---|---|
| «no», con un problema que trae evidencia | no pasa; el detalle es ese problema |
| «no», sin evidencia | se saltea: una opinión no corta una rama |
| «no pude comprobarlo» | se saltea: no encontrar el botón no prueba que esté roto |
| «sí», contando qué vio | pasa |
| «sí», sin una sola cosa vista | se saltea |

También se saltea —nunca rompe— si la config está a medias, si falta `@playwright/mcp` (dependencia
opcional: es el navegador que maneja el modelo), si la app no levanta o si el modelo explota. El
modelo sólo tiene las herramientas del navegador y `Read`; no escribe archivos ni corre comandos.

Pase lo que pase, al terminar se mata el árbol de procesos que la fase lanzó y se borra el perfil. El
informe y las capturas quedan en `.dolphin/uso/<fecha>-<universo>/`.

De esto está probado con tests la decisión, la config y la correa, con el lanzador y el modelo
inyectados. **Todavía no corrió de punta a punta contra una app y un modelo de verdad.**

## El router y la plata

Con `--estrategia calidad | equilibrada | economia`, el modelo caro escribe y el barato revisa, y
nunca revisa el mismo que escribió. Dolphin mide quién pasa el portón en **tu** repo y reparte con
esas cifras; una de cada cuatro siembras sale a medir a otro modelo para que la tabla no se quede
vieja. La misma tarea sobre el mismo commit no se vuelve a pagar: la respuesta queda en una caché.
Con `--suscripcion` no se muestran montos. Codex y Antigravity no informan cuánto cuestan: se ven sus
tokens y la plata dice «al menos» o «sin dato», nunca cero.

## Memoria

```bash
dolphin recordar "los importes van con coma decimal" --patron "toLocaleString\\('en"
```

Con patrón, la corrección se vuelve **un verificador más del portón**, para siempre: una línea nueva
que lo cumpla corta la rama gratis, con tu frase como motivo. Sin patrón, es una regla que viaja en
cada pedido. Lo que las siembras aprenden del repo entra en observación y el **sueño**
(`dolphin sonar`, o solo después de cada siembra) lo pasa a la memoria si se repite en tareas
distintas, con el porqué en `.dolphin/DREAMS.md`. Lo que vino de afuera —un issue de otro, una tarea
de la web, una regla propuesta por MCP— espera tu visto bueno.

`dolphin mcp --repo <ruta>` sirve esa memoria por MCP (stdio) a cualquier agente: buscar, listar,
proponer una regla (queda como candidata, nunca activa) y leer el perfil del proyecto.

## Planes y la cola

En la consola, **Un objetivo** en vez de **Una tarea**: Dolphin lee el repo y lo parte en un plan de
tareas, cada una con su modelo y su tope de plata. Lo editás, lo aprobás y va a la cola. La cola
(`dolphin cola`) trabaja tareas distintas a la vez, cada una en su rama; las entrega de a una, y si
dos chocan, la segunda se vuelve a sembrar encima de la primera.

## Calendario y Guardian

Una tarea se agenda para mañana a las 9 o para todos los días, y corre sola con la política encima.
En esta máquina o en tu VPS, por SSH ([ssh.md](ssh.md)).

**Guardian** (`dolphin guardian --repo X`) vigila la rama principal sin gastar un token: corre sus
fases, repite la que se rompe para saber si es inestable, busca el commit culpable con `git bisect`
y deja una tarjeta en la Bandeja que se cierra sola cuando la fase vuelve a pasar.

## La Bandeja

Lo que Dolphin encontró sin que se lo pidieras. El **explorador** (`dolphin explorar`) recorre tu
app como una persona y anota lo que no anda; el **scout** (`dolphin ideas`) trae ideas vistas en
otros productos. Cada asunto se implementa o se rechaza con un toque, y un error que el explorador
vuelve a probar y ya no pasa se cierra solo.

## Los partes

Cada siembra deja un parte HTML en `.dolphin/partes/`: la escalera de fases con quién se cortó dónde
y por qué, quién escribió y revisó, lo que costó, el diff de la elegida y los videos de lo que falló
(con ffmpeg, compilados en uno solo). No pide nada a internet: se abre en cualquier navegador.

## Seguir una sesión y preguntarle

- `dolphin seguir` toma tu última sesión de Claude Code en el repo (o la que digas con `--sesion`;
  `--lista` muestra cuáles hay) y la empuja vuelta a vuelta hasta que termine, sin que tengas que
  escribirle «seguí». La retoma en una copia (`--fork-session`), así la terminal que la tiene abierta
  no se pisa. Si se acaba el cupo pasa al motor de respaldo (`--respaldo`, Codex por defecto). Al
  terminar avisa por el sistema y por Telegram con el link de la app levantada.
- `dolphin preguntar "¿qué quedó a medias?"` le pregunta a esa sesión en una copia y en solo lectura.
- `dolphin pr vigilar [--pr N] [--vueltas 3]` mira los checks y los comentarios de revisión de un PR
  en borrador (con `gh`) y le pide al agente que los corrija.

Las tres gastan turnos de tu cupo.

## Modo aislado

Con `"aislado"` en `dolphin.config.json`, el agente corre en una caja (Docker, Podman o bubblewrap)
que solo ve su worktree. Qué protege cada modo y qué no: [aislamiento.md](aislamiento.md).
