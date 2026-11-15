# La fase de seguridad

Una app hecha con agentes se filtra siempre por las mismas tres cosas, y cuando pasa no es un bug:
es el titular de un diario. La clave de Stripe compilada adentro del bundle, la tabla de Supabase
que cualquiera lee con la clave del navegador, el endpoint que borra sin preguntar quién llama.

Es una fase más del portón, **gratis** (no le pregunta nada a ningún modelo: lee el diff y listo) y
corre siempre, antes de los tests. Lo que encuentra corta la rama y vuelve al agente con el motivo,
así que se corrige en la misma siembra. El código está en [`src/nucleo/seguridad.ts`](../src/nucleo/seguridad.ts).

## Qué mira

| Regla | Corta cuando | No corta cuando |
|---|---|---|
| **clave en el front** | una variable con prefijo de cliente (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`, `EXPO_PUBLIC_`…) lleva un nombre de secreto (`SECRET`, `SERVICE_ROLE`, `PRIVATE`, `PASSWORD`, `API_KEY`, `ACCESS_KEY`, `AUTH_TOKEN`); o hay una clave de Stripe, OpenAI, AWS, GitHub, Slack o Supabase escrita a mano en un archivo que se sirve al navegador; o esa clave de Supabase es la `service_role` (se decodifica el JWT y se mira el `role`) | el nombre es de una clave pública por diseño (`ANON_KEY`, `PUBLISHABLE_KEY`, `SITE_KEY`, `POSTHOG_KEY`) o no es un secreto (`NEXT_PUBLIC_API_URL`); el valor todavía está sin completar (`CLAVE=`, `CLAVE=poné-la-tuya`); el archivo es un `.env.example`, un `.md`, un test o algo generado |
| **tabla sin RLS** | el diff crea una tabla en el esquema `public` y en ninguna parte de la rama aparece su `enable row level security` | la tabla lo prende (en ese archivo o en otra migración de la misma rama); está en otro esquema (`privado`, `auth`), que la API no expone; o el repo no tiene ninguna huella de Supabase o PostgREST, porque un Postgres detrás de tu propio backend no necesita RLS |
| **endpoint sin auth** | la rama agrega un endpoint que escribe o borra (POST, PUT, PATCH, DELETE, en Express, Fastify, Hono, Nest, FastAPI, Flask o un `route.ts` de Next) y no hay ninguna señal de sesión, token, cookie, permiso, firma o un 401 en las ~30 líneas de alrededor | es de lectura (GET); el camino es público por diseño (`/login`, `/signup`, `/auth/…`, `/health`…); el router tiene un guardia puesto arriba (`router.use(autenticar)`, `@UseGuards`, `preHandler`); o es una llamada de un cliente HTTP (`axios.post`) y no una ruta |

## Por qué mira el diff y no el repo

Como [trampas.ts](../src/nucleo/trampas.ts) y como la línea base del escalón de pantalla: **lo que ya
estaba mal no lo rompió esta rama**, y cortarla por eso es pedirle que arregle algo que no tocó. La
contracara es que lo viejo no se ve, y está bien: para eso están las herramientas que escanean el
repo entero (gitleaks, trufflehog, el linter de tu base), que es otro trabajo y se corre una vez.

## La regla de arriba de las tres: ningún falso positivo

Una fase que corta una rama buena se apaga a la semana, y una fase apagada no protege de nada. Por
eso cada regla pide **dos** cosas antes de hablar —el nombre y el valor, el SQL y la huella de
Supabase, el endpoint y su cuerpo nuevo— y donde hay que elegir, elige callarse:

- La señal de autenticación es generosísima a propósito (`cookie`, `verif`, un `403` suelto). Cada
  palabra de más es un endpoint que no se reporta; cada palabra de menos, una rama buena cortada.
- No se le saca el texto entre comillas antes de buscar esa señal, porque un
  `headers.get("authorization")` vive adentro de un string. El precio es que un endpoint llamado
  `/api/tokens` se exime solo, y ese falso negativo sale mucho más barato.
- Un endpoint cuyo **cuerpo** no es nuevo tampoco se reporta: una línea sola que engancha un handler
  que ya existía es un cambio de cableado, y el chequeo vive en el handler, que el diff no muestra.

## Qué NO mira

- **Secretos del servidor.** Una clave en un archivo del backend también está mal, pero no está
  *publicada*: la fase corta por lo que cualquiera puede leer con «ver código fuente».
- **Lo que ya estaba** en la rama principal (ver más arriba).
- **Policies mal escritas.** Que la tabla tenga RLS no quiere decir que sus policies estén bien; eso
  lo tiene que leer alguien.
- **Inyección de SQL, XSS, CORS, rate limiting, dependencias con CVE.** Son otras fases, y varias ya
  las cubre el lint o el `npm audit` del repo, que el portón corre igual.
- **Las edge functions de Supabase** y los `pages/api/*` de Next viejo: sus formas son demasiado
  distintas para reconocerlas sin inventar hallazgos.

## Cómo se apaga

```json
{ "seguridad": false }
```

En `dolphin.config.json`, versionado con el repo. Se apaga entera: si una regla molesta en un repo,
mejor contarlo y arreglar la regla que quedarse sin las otras dos.
