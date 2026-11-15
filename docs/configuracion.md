# Configuración

Todo es opcional. Va en `dolphin.config.json`, en la raíz de tu repo, versionado con el código:

```json
{
  "modelos": { "estrategia": "equilibrada", "escribir": "sonnet", "revisar": "haiku" },
  "pantalla": { "levantar": "npm run dev -- --port {PUERTO}", "url": "http://127.0.0.1:{PUERTO}/" },
  "vision": true,
  "entorno": { "dependencias": "enlazar", "copiar": ["config/local.json"], "preparar": ["npm run db:migrar", "npm run db:semilla"], "puerto": { "variable": "APP_PORT", "desde": 4100 } },
  "testsExistentes": "aprobar",
  "guardian": { "fases": ["typecheck", "test"], "repetir": 2 }
}
```

| Clave | Qué decide |
|---|---|
| `terminal` | cómo trabaja la app de terminal: `modo`, `modelo`, `preguntar`, `aprobarPlan`, `tope` y `verificar` ([terminal.md](terminal.md)) |
| `porton` | `verificacionesALaVez`: cuántos comandos pesados (tipos, tests, build) corren a la vez en toda la máquina, el resto espera turno; `DOLPHIN_VERIFICACIONES_A_LA_VEZ` gana, y sin ninguno sale de la memoria y los núcleos ([porton.md](porton.md#la-cola-de-verificación)). `comandos`: lo que no es npm y se suma al portón (`pytest`, `go test`, `cargo test`…). `fases`: las que escribiste vos o instalaste de un paquete, con `nombre`, `modulo` y `opciones` ([fases.md](fases.md)) |
| `modelos` | `estrategia` (`calidad`, `equilibrada`, `economia`) y quién hace cada cosa: `escribir`, `corregir`, `revisar` (`false` la apaga) y `planificar` |
| `pantalla` | cómo se levanta la app de cada rama: `levantar` y `url` con `{PUERTO}`, `espera`, `personas`, `superficies`. Guarda el video de lo que falló y uno por rama de la app andando; `videoDeLoQueAnda: false` deja solo los de lo que falló |
| `vision` | `true`, o `{ "juez": "sonnet", "anchos": [1440, 390] }`; necesita `pantalla` |
| `uso` | cómo se levanta la app para que un modelo la use ([porton.md](porton.md#uso)): `levantar` (el comando), `tipo` (`electron` o `web`), `cwd` (subcarpeta del worktree), `entorno` (variables; `{perfil}` es una carpeta descartable y `{puerto}` el de depuración remota en electron o el de la app en web), `url` (obligatoria en `web`), `listaCuando` (`cdp` o `http`), `espera`, `modelo` y `vueltas`. En `electron` hace falta `{puerto}` en `entorno` o en `levantar` |
| `entorno` | cómo queda listo cada worktree: `dependencias` (`enlazar`, `instalar` o `nada`; sin ella: el `node_modules` de cada paquete que ya lo tiene en tu repo se enlaza —la raíz y los anidados con `package.json` versionado—, un monorepo instala en la raíz, un paquete anidado que es su propio workspace y nunca se instaló se instala en el worktree, y el resto queda sin nada; si la ponés, vale para todo el repo y los paquetes anidados sólo se enlazan con `enlazar`), `copiar` (además de los `.env`), `preparar` (corren con el `PORT` y la `DATABASE_URL` de ese worktree, así una migración migra su base y no la tuya) y `puerto` |
| `testsExistentes` | si una rama cambia tests que ya existían: `avisar`, `aprobar` (mergearla te pide el visto bueno) o `cortar` |
| `seguridad` | `false` apaga la fase que mira claves en el front, tablas sin RLS y endpoints sin autenticar ([seguridad.md](seguridad.md)) |
| `politica` | para lo que corre solo: `archivosProhibidos` y `comandosProhibidos`. Cada una **reemplaza** a la lista de siempre (migraciones, workflows, deploys, `.env`, push, publish…): si la cambiás, copiá lo que quieras conservar |
| `explorar` | `noTocar`: textos que el explorador nunca toca, además de «Borrar», «Pagar» y compañía |
| `guardian` | `fases` que corre y cuántas veces `repetir` una que se rompió; en un repo clonado, `fases` es obligatorio |
| `hosts` | máquinas para los turnos por SSH ([ssh.md](ssh.md)) |
| `aislado` | el agente corre en una caja (Docker, Podman o bubblewrap) ([aislamiento.md](aislamiento.md)) |
| `suscripcion` | `true` si el agente corre con una suscripción: no se muestran montos |

## Además

- **`.worktreeinclude`**: archivos sin versionar que cada rama necesita (uno por línea, `#` comenta).
  Los `.env` de siempre se copian solos.
- **`DOLPHIN_HOME`**: dónde guarda Dolphin la lista de proyectos y la memoria que no es de un repo
  (por defecto, `~/.dolphin`).
- **`DOLPHIN_BOTS_DIR`**: dónde viven los bots (por defecto, `~/.dolphin/bots`).
- **`DOLPHIN_TELEGRAM_TOKEN`** y **`DOLPHIN_TELEGRAM_CHAT`**: los avisos y `dolphin telegram`.
- **`DOLPHIN_TRANSCRIBIR`**: el comando local que pasa a texto las notas de voz de Telegram.
- **`DOLPHIN_APP_DIR`**: para la app de escritorio, dónde está este repo.

Lo de cada repo —cosechas, partes, videos, memoria, bandeja, calendario— vive en su carpeta
`.dolphin/`, que se ignora a sí misma: Dolphin no ensucia el git de nadie.
