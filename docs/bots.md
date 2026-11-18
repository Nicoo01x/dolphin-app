# Dolphin bots

Agentes personales siempre prendidos, en tu máquina. Piensan con Claude Code o con Codex, con la
sesión que ya tenés (no hace falta una clave de API), y te hablan por Telegram, por la consola o por
la terminal.

## Un bot es una carpeta de texto

Cada bot vive en `~/.dolphin/bots/<id>/` (o en `DOLPHIN_BOTS_DIR`): la abrís, la leés y la cambiás
con cualquier editor.

| Pieza | Qué es |
|---|---|
| **alma** | quién es, qué hace y cómo te habla |
| **memoria** | un `memoria.md` de hasta 2.200 caracteres que el bot consolida solo, más búsqueda por palabras en su charla y sus partes |
| **habilidades** | las escribe solo en `habilidades/` cuando aprende a hacer algo, y las usa la próxima vez |
| **rutinas** | todos los días a una hora (con su zona horaria), cada N minutos, o cuando llega un evento |
| **latido** | una rutina que solo te escribe si encontró algo |
| **chequeo** | un comando sin modelo que corre antes del latido y decide si vale despertar al bot: si en el repo no cambió nada, no se gasta un token |
| **presupuesto** | tope de dólares y de corridas por mes |
| **respaldo** | el motor al que pasa si el suyo se queda sin cupo |

## Antes de tocar algo: cuatro permisos

| Permiso | Qué puede hacer |
|---|---|
| `leer` | solo mira |
| `preguntar` | pregunta antes de tocar; con «dale» lo hace |
| `carpeta` | edita solo su carpeta, con una foto antes de cada cambio para deshacer (`dolphin bots deshacer <id>`) |
| `libre` | hace sin preguntar |

El bot hereda lo operativo del entorno (`PATH`, `HOME`…) y la credencial mínima de su motor, nunca
los secretos del proceso que lo lanza: un token que quieras darle va explícito en `--entorno`.

## Plantillas

| Plantilla | Permiso | Rutina |
|---|---|---|
| `vigia` | `leer` | latido cada 30 minutos sobre el repo de su carpeta, con el chequeo de git |
| `parte` | `preguntar` | todos los días a las 08:00, el resumen de ayer |
| `investigador` | `preguntar` | ninguna: busca fuentes cuando le pedís algo |
| `escritor` | `preguntar` | todos los días a las 06:00, una pieza en su carpeta |

## Comandos

```bash
dolphin bots                                           # la manada y la próxima rutina de cada uno
dolphin bots nuevo vigía --plantilla vigia --carpeta "D:/mi-proyecto"
dolphin bots nuevo ayudante --motor codex --permiso preguntar --respaldo claude --presupuesto 5
dolphin bots hablar <id> "¿qué cambió hoy?"
dolphin bots dale <id>                                 # confirma lo que pidió permiso
dolphin bots rutina <id> agregar "diario 09:00" "repasá los issues nuevos" --tz America/Argentina/Buenos_Aires
dolphin bots rutina <id> agregar "cada 15" "mirá el deploy" --latido --chequeo "<comando>"
dolphin bots rutina <id> agregar --evento "un push a main: revisá qué cambió"
dolphin bots rutina <id> sacar <rutina>
dolphin bots telegram <id> --token <de @BotFather> --chat <tu chat>
dolphin bots deshacer <id>                             # vuelve a la última foto (permiso carpeta)
dolphin bots correr                                    # los prende en esta terminal
dolphin bots instalar | desinstalar                    # como servicio del sistema
dolphin bots webhook [--puerto 4890]                   # recibe los eventos firmados
dolphin bots borrar <id>
dolphin bots historial <id>                            # la charla y los partes
```

Con `--json` (`dolphin bots --json`, `nuevo`, `hablar`, `dale`, `historial`, `instalar`) cada comando
imprime un solo JSON, sin colores: es lo que lee la página «Delfines» de la app de escritorio, acá o
por SSH en tu servidor. No lleva el token de Telegram ni el secreto de los eventos.

## Llevarlo a otra máquina

Un bot es su carpeta, así que mudarlo es copiarla. Del otro lado se le cambia lo único que no viaja,
la carpeta donde trabaja:

```bash
dolphin bots importar ./vigia --carpeta ~/proyectos/tienda   # [--reemplazar] para llevarlo de nuevo
dolphin bots apartar vigia      # en la máquina de origen: deja de correr acá, queda en ~/.dolphin/bots-en-servidor
dolphin bots instalar --comando "/ruta/a/node /ruta/a/bin/dolphin.mjs bots correr"
```

`--comando` es para una máquina donde `dolphin` no está en el PATH (la app lleva el núcleo a tu
servidor sin instalarlo con npm); en Linux el servicio se lleva además el PATH de la sesión, porque
systemd no lo hereda y sin él el bot no encuentra a `claude` ni a `codex`. La app hace todo esto sola
con «Correr en tu servidor».

## Siempre prendidos

`dolphin bots instalar` los deja corriendo al iniciar sesión: una tarea programada en Windows, un
LaunchAgent en macOS y un servicio de usuario de systemd en Linux. Una rutina que falla no se relanza
en loop, y el aviso sale una vez por racha.

## Telegram

Cada bot puede tener su propio bot de Telegram. Acepta texto, archivos, fotos y notas de voz (que se
transcriben con el comando local de `DOLPHIN_TRANSCRIBIR`), y contesta en el mismo tema del grupo.
Solo atiende al chat que le diste.

Los **atajos** corren un script fijo sin modelo, con `/nombre` desde Telegram:

```bash
dolphin atajo nuevo deploy-staging --archivo deploy.ps1 --descripcion "sube staging"
dolphin atajo ver deploy-staging      # el script entero, para revisarlo
dolphin atajo aprobar deploy-staging  # uno que propuso un bot no corre hasta que lo revisás
```

## Eventos con firma

Una rutina `--evento` se dispara con un POST a `http://127.0.0.1:4890/evento/<bot>/<rutina>`, firmado
con HMAC-SHA256 del cuerpo (`X-Hub-Signature-256`, como manda GitHub, o `X-Dolphin-Firma`). El
secreto se muestra una sola vez al crearla. El cuerpo tiene un tope de 256 KB, y salvo que la rutina
se cree con `--confiar`, el bot lo atiende con permiso `leer`. Para recibir eventos de afuera, ponelo
detrás de un túnel o de nginx: por defecto escucha solo en `127.0.0.1`.

## Frente a otros agentes personales

Lo de ellos sale de sus repos públicos ([openclaw/openclaw](https://github.com/openclaw/openclaw),
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)), leídos el 28/10/2026.

| | Dolphin bots | OpenClaw | Hermes Agent |
|---|---|---|---|
| Licencia | MIT | MIT | MIT |
| Dónde corre | tu máquina | tu máquina o un servidor | local, Docker, SSH, un VPS o serverless (Modal, Daytona) |
| Con qué piensa | Claude Code o Codex, con tu sesión | cualquier modelo, en la nube o local | cualquier modelo: OpenRouter, OpenAI, endpoints propios |
| Por dónde te habla | Telegram, la consola y la terminal | más de 20 canales: WhatsApp, Telegram, Slack, Discord, iMessage… | Telegram, Discord, Slack, WhatsApp, Signal, correo |
| Habilidades | las escribe solo | se comparten en ClawHub | las crea solo y las mejora con el uso; Skills Hub |

Lo que ellos tienen y Dolphin no: muchos canales, cualquier modelo (incluso uno local), apps en el
celular y voz (OpenClaw), correr en la nube con varios backends (Hermes), búsqueda de texto completo
entre sesiones con resumen por modelo y un modelo de quién sos (Hermes), y un hub de habilidades de
la comunidad. Lo de Dolphin: la suscripción que ya pagás, un bot que es una carpeta de texto, un
permiso por bot, el chequeo sin modelo antes de cada latido, y que viven en la misma app que tu flota
de agentes de código.
