# La API de la consola

La consola de Dolphin (`dolphin ui`) es un servidor HTTP, y todo lo que hace la pantalla pasa por
estas rutas. Están documentadas para que se pueda construir encima: otra interfaz, un script, un
panel propio, o un agente que maneje a otro.

`tests/api-documentada.test.ts` levanta la consola de verdad y pide cada ruta de acá. Si una
desaparece, cambia de método o deja de contestar, el test falla. Y si el servidor gana una ruta que
este documento no tiene, también: una API sin documentar no es una API.

## Cómo se habla con ella

- **Dónde.** `dolphin ui --puerto 4791` la deja en `http://127.0.0.1:4791`. Escucha solo en
  127.0.0.1 a propósito: nada de esto está pensado para quedar expuesto a una red. La única puerta
  de afuera es `--tunel`, y tiene sus propias reglas (abajo).
- **El pase.** Todo lo que cambia algo (POST, PUT, DELETE) pide la cabecera `x-dolphin-token`. El
  pase se renueva en cada arranque y viaja en la página: `<meta name="dolphin-token" content="…">`.
  Sin él la respuesta es 403. Los GET no lo piden.
- **El repo.** Cada consola atiende UN repo, el que se le pasó al arrancar. No hay un parámetro
  para cambiarlo en la ruta.
- **El formato.** Todo es JSON (`content-type: application/json`), salvo el canal en vivo, los
  videos, los partes y los logos. Un cuerpo que no se entiende da 400 con `{ok: false, porQue}`.
- **Los errores.** Siempre `{ok: false, porQue: "en castellano, qué pasó"}`. El código dice de
  quién es el problema: 400 el pedido, 403 el pase, 404 no está, 409 no se puede ahora (y `porQue`
  explica qué falta), 422 lo pedido no cierra, 502 un agente no contestó.

```bash
# Leer no pide nada.
curl -s http://127.0.0.1:4791/api/tablero

# Cambiar algo pide el pase, que sale de la página.
PASE=$(curl -s http://127.0.0.1:4791/ | grep -o 'dolphin-token" content="[0-9a-f]*' | cut -d'"' -f3)
curl -s -X POST http://127.0.0.1:4791/api/tablero \
  -H "content-type: application/json" -H "x-dolphin-token: $PASE" \
  -d '{"titulo":"exportar a CSV","tipo":"tarea"}'
```

### Desde el teléfono: `dolphin ui --tunel`

Abre la misma consola en una dirección pública de Cloudflare (`cloudflared`, sin cuenta) e imprime
el link **con el pase adentro**: `https://algo.trycloudflare.com/?pase=…`. Ese link es la llave.

Lo que cambia respecto de local, y por qué:

- **De afuera, el pase se pide en CADA pedido, también en los GET.** De local el pase viaja en la
  página porque el peligro es otro sitio del navegador haciendo `fetch` a 127.0.0.1; quien está
  sentado en la máquina ya tiene el repo. La dirección del túnel, en cambio, la puede abrir
  cualquiera: si la página saliera con el pase adentro, abrir el link sería tener la consola.
- **Al entrar, el pase se cambia por una cookie** (`HttpOnly`, `Secure`, `SameSite=Strict`) y se
  saca de la dirección con un 302. Lo que queda en el historial, en los `Referer` y en la pantalla
  de quien esté al lado no lleva la llave.
- **Escribir sigue pidiendo la cabecera `x-dolphin-token`**, no la cookie. Es lo que corta el CSRF:
  un sitio ajeno puede hacer que tu navegador mande la cookie, pero no puede leer el pase para
  ponerlo en una cabecera.
- **El host permitido es UNO**, el del túnel abierto. Otro `*.trycloudflare.com` o un dominio que
  resuelva a 127.0.0.1 siguen recibiendo 403, que es lo que corta el DNS rebinding.

Sin pase la respuesta es 401 con una pantalla que lo explica; con el host equivocado, 403. La
diferencia importa: 401 es «te falta la llave», 403 es «esta puerta no es tuya». Lo vigila
`tests/tunel.test.ts`.

## El tablero

| | |
|---|---|
| `GET /api/tablero` | Todas las tarjetas, con su columna, quién la toma, comentarios e historial. |
| `POST /api/tablero` | Crear una: `{titulo, detalle?, terminado?, quien?, tipo?, columna?}`. Contesta 201. |
| `POST /api/tablero/<id>/mover` | A otra columna: `{columna}`. |
| `POST /api/tablero/<id>/editar` | Cambiarle el título, el detalle, el criterio, quién la toma o el tipo. |
| `POST /api/tablero/<id>/comentar` | Un comentario: `{texto}`. |
| `POST /api/tablero/<id>/esperar` | Que espere a otra: `{otra}`. |
| `POST /api/tablero/<id>/soltar` | Que deje de esperarla. |
| `GET /api/tablero/<id>/rama` | Qué cambió la rama de la tarjeta: archivos, diff y **lo que se corrió de verdad** sobre ella, con su código de salida (ver `nucleo/bitacora.ts`). |
| `POST /api/tablero/<id>/probar` | Cruza la rama por el portón en un worktree propio y descartable —**solo las fases gratis**, las que pagan un modelo se listan aparte— y deja el veredicto como comentario de la tarjeta. Mirar un diff no dice si los tests pasan. |
| `POST /api/tablero/<id>/plan` | El líder parte la tarjeta en tareas y dice cuánto saldría. No escribe código. |
| `POST /api/tablero/<id>/dale` | Arranca el equipo con el plan aprobado. La tarjeta pasa a Haciendo. |
| `POST /api/tablero/<id>/integrar` | Mergea la rama en tu rama y la tarjeta pasa a Hecho. |
| `POST /api/tablero/<id>/devolver` | Tira la rama y la tarjeta vuelve a Para hacer con el motivo. |
| `POST /api/tablero/<id>/comentario` | Marca una línea del diff: `{archivo, linea, texto}`. |

El `dale` se niega con 409 cuando la tarjeta ya está en Hecho, ya la está haciendo el equipo, está
en Para revisar, o espera a otra. Integrar se niega si hay cambios sin commitear o estás parado en
otra rama: tocar el repo de verdad pide que el repo esté limpio.

## Sembrar y cosechar

| | |
|---|---|
| `POST /api/sembrar` | Siembra una tarea en N ramas y las pasa por el portón. |
| `POST /api/live` | El modo en vivo: tocás algo en la app y se siembra la tarea de ese elemento. |
| `GET /api/cosecha` | La última cosecha (o la de `?id=`), con sus candidatos y por qué ganó uno. |
| `GET /api/historial` | Las últimas veinte cosechas, en resumen. |
| `GET /api/actividad` | Qué pasó últimamente, armado de las cosechas y la bandeja que ya están en disco. |
| `GET /api/diff` | El diff de un candidato: `?id=<cosecha>&u=<universo>`. |
| `GET /api/rendimiento` | Lo mismo que mira el router: qué rinde cada modelo, por fase, y la decisión. |
| `GET /api/guardian` | Lo último que vio Guardian. Solo lectura: corre con su comando. |

## La app de una rama, adentro de la consola

Mirar un diff no dice si la pantalla quedó bien. El preview levanta la app de la rama en un
worktree descartable (el comando de `dolphin.config.json` → `pantalla`) y la sirve **por el origen
de la consola**, que es lo único que permite inspeccionarla: un iframe de otro origen no deja leer
ni un nodo de su DOM. Con eso, tocar un elemento devuelve su selector y se puede pedir el cambio
por `POST /api/live`, el mismo camino del modo en vivo.

| | |
|---|---|
| `GET /api/previews` | Los previews abiertos, con la dirección que va en el iframe. |
| `POST /api/preview` | Abre el de una rama: `{rama}`. Uno por rama; pedirlo dos veces devuelve el mismo. |
| `POST /api/preview/cerrar` | Lo apaga y devuelve su worktree: `{id}`. |

Después, `/preview/<id>/…` sirve la app de esa rama con el inspector inyectado. No es una ruta de
datos ni contesta JSON: es la app ajena tal cual, y es lo que va en el `src` del iframe.

El proxy no toma un puerto, toma el id de un preview que Dolphin abrió: si aceptara puertos
sueltos, desde la consola se podría leer cualquier servicio de loopback de la máquina. Y los que
nadie mira se apagan a los diez minutos, porque un `npm run dev` por rama consume CPU para nadie.

## El portón a mano

| | |
|---|---|
| `GET /api/porton` | Si hay una pasada corriendo y cómo viene. |
| `POST /api/porton` | Pasa las fases del repo sobre esta carpeta. Una por repo: 409 si ya hay una. |
| `POST /api/rama` | Lo que se hace con una rama entregada: integrarla, descartarla, abrir su PR. |

## El plan y la cola

| | |
|---|---|
| `GET /api/planes` | Los planes guardados. |
| `POST /api/plan` | Pensar un plan para un objetivo. |
| `POST /api/plan/aprobar` | Aprobarlo y arrancarlo. |
| `GET /api/cola` | Lo que está encolado. |
| `POST /api/cola` | Encolar tareas. |
| `GET /api/calendario` | Los turnos de la noche, con los hosts configurados y adónde va cada uno. |
| `POST /api/calendario` | Agendar, cambiar o cortar un turno. |

## La memoria

| | |
|---|---|
| `GET /api/memoria` | Lo aprendido, sus usos, el perfil del repo, la memoria corta y los sueños. |
| `POST /api/memoria` | Aprobar, descartar o editar lo aprendido. |
| `GET /api/entrenamiento` | Qué memorias de otros modelos se trajeron (`null`: nunca se entrenó este repo). |
| `POST /api/entrenamiento` | Entrenar con las memorias de otro modelo. |
| `GET /api/bandeja` | Lo que Dolphin encontró y espera que decidas. |
| `POST /api/bandeja` | Aceptar, rechazar o implementar un asunto. |

## Los bots

| | |
|---|---|
| `GET /api/bots` | Todos los bots. |
| `POST /api/bots` | Crear uno. |
| `GET /api/bots/<id>` | Uno, con sus rutinas, habilidades y memoria. |
| `PUT /api/bots/<id>` | Cambiarlo. |
| `DELETE /api/bots/<id>` | Borrarlo. |
| `POST /api/bots/<id>/hablar` | Hablarle. |
| `POST /api/bots/<id>/dale` | Confirmar lo que pidió permiso para hacer. |
| `POST /api/bots/<id>/deshacer` | Deshacer lo último que hizo. |
| `POST /api/bots/<id>/rutinas` | Agregar una rutina. |
| `DELETE /api/bots/<id>/rutinas/<idRutina>` | Sacarla. |
| `PUT /api/bots/<id>/habilidades/<nombre>` | Guardar una habilidad. |
| `DELETE /api/bots/<id>/habilidades/<nombre>` | Sacarla. |
| `DELETE /api/bots/<id>/memoria` | Vaciar su memoria. |

## Los proyectos y el Master Prompt

| | |
|---|---|
| `GET /api/proyectos` | Los proyectos de la lista (`{solo: true}` si la consola atiende uno solo). |
| `POST /api/proyectos` | Agregar o sacar uno. |
| `GET /api/proyectos/logo` | El logo de un proyecto. |
| `GET /api/prompt/captura` | Una captura pegada en el Master Prompt. |
| `POST /api/prompt/captura` | Pegar una. |
| `POST /api/prompt/mejorar` | Mejorar el texto del prompt. |
| `POST /api/prompt/armar` | Armar el prompt final con las capturas y sus marcas. |

## El canal en vivo (SSE)

`GET /en-vivo` es un `text/event-stream`: cada línea nueva de `.dolphin/en-vivo.jsonl` sale como un
evento, y cada 15 segundos va un latido para que nadie corte la conexión por silencio. Apenas se
abre manda `: conectado`, así que quien escucha sabe enseguida que el servidor está vivo en vez de
esperar al primer latido.

Se lee del archivo por sondeo y no con `fs.watch`: en Windows el watch con escrituras al final avisa
cuando quiere, y 700 ms de retraso no se notan y no cuestan nada.

```bash
curl -N http://127.0.0.1:4791/en-vivo
```

Cada evento es una línea de JSON con `tipo` y lo que ese tipo lleve: qué universo nació, qué fase
pasó, qué dijo un agente mientras trabajaba. Un cliente que no conozca un `tipo` lo tiene que
ignorar en vez de romperse: se agregan tipos nuevos sin avisar.

## Lo que no es una ruta de datos

`/`, `/assets/…`, `/videos/…`, `/partes/…` y `/bandeja/…` sirven la consola y sus archivos. No son
parte de esta API y pueden cambiar de forma en cualquier momento.
