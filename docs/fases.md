# Escribir una fase del portón

El portón de Dolphin corre fases sobre cada rama: tipos, tests, la app mirada por cinco personas,
trampas, seguridad. Las trae Dolphin, o salen de los scripts de npm de tu repo. Lo que falta es lo
del medio: **la comprobación que sabe hacer tu equipo y nadie más**. Que ninguna dependencia nueva
entre sin licencia permisiva. Que cada migración tenga su vuelta atrás. Que los textos estén en la
voz de la marca. Que el CUIT se valide con módulo 11.

Esas fases las escribís vos, en un archivo, y las compartís como cualquier módulo.

```bash
dolphin fases                  # qué cruza una rama en este repo, y de dónde sale cada fase
dolphin fases --repo "D:/otro"
```

## Declararla

En `dolphin.config.json`, al lado de las demás:

```json
{
  "porton": {
    "fases": [
      {
        "nombre": "licencias",
        "modulo": "./dolphin/fases/licencias.mjs",
        "queHace": "ninguna dependencia nueva sin licencia permisiva",
        "opciones": { "permitidas": ["MIT", "ISC", "Apache-2.0"] }
      }
    ]
  }
}
```

| Campo | Qué es |
|---|---|
| `nombre` | Cómo se la ve en la escalera, en la bitácora y en el parte. No puede ser el de una fase de Dolphin (`seguridad`, `test`, `pantalla`…) ni repetirse |
| `modulo` | Una ruta de tu repo (`./dolphin/fases/x.mjs`) o un paquete instalado **en este repo** (`dolphin-fase-licencias`) |
| `queHace` | Una línea: es lo que muestra `dolphin fases`. Opcional, pero sin ella el catálogo muestra la ruta |
| `opciones` | Lo que recibe tu fábrica. Dolphin no lo mira: es entre tu repo y tu fase |
| `tope` | Milisegundos antes de darla por colgada (por defecto 180.000). Una fase que no termina se saltea |

## Escribirla

El módulo **exporta por defecto una fábrica**: recibe las `opciones` del config y devuelve un
verificador. Eso es todo el contrato, y es el mismo que cumplen las fases propias de Dolphin.

```js
// dolphin/fases/licencias.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default function faseDeLicencias(opciones) {
  const permitidas = new Set(opciones?.permitidas ?? ["MIT"]);
  return {
    nombre: "licencias",
    costo: "gratis",
    async correr(universo) {
      const pkg = JSON.parse(await readFile(join(universo.ruta, "package.json"), "utf8"));
      // De donde las saque tu proyecto: un `license-checker`, un archivo propio, lo que sea.
      const malas = Object.entries(pkg.licencias ?? {}).filter(([, licencia]) => !permitidas.has(licencia));

      if (malas.length === 0) return { paso: true, detalle: "licencias: todas permitidas" };
      return {
        paso: false,
        detalle: `licencias: ${malas[0][0]} es ${malas[0][1]}`,
        evidencia: malas.map(([nombre, licencia]) => `${nombre}  ${licencia}`).join("\n"),
      };
    },
  };
}
```

La fábrica puede ser `async`. En TypeScript, el tipo es
`(opciones: unknown) => Verificador` (`src/nucleo/tipos.ts`), y el `.js` compilado es lo que se
declara en el config.

Una versión de esta misma fase corre de verdad en los tests
(`tests/fixtures/fase-licencias.mjs`, probada en `tests/fases-externas.test.ts`): si eso deja de
andar, este documento miente.

### Qué recibe

`correr(universo, contexto)`:

| | Qué trae |
|---|---|
| `universo.ruta` | El worktree de **esta** rama, con el código ya escrito. Acá se mira todo |
| `universo.rama` | El nombre de la rama (`dolphin/…/u1`) |
| `universo.base` | El commit desde el que nació: contra esto se mide lo que agregó (`git diff <base>`) |
| `universo.entorno` | El puerto y la base propios de esta rama: si levantás la app, levantala con esto |
| `universo.id`, `universo.nacido` | Cuál de las ramas de la siembra es, y desde cuándo |
| `contexto.contrato` | Lo que el agente declaró haber tocado: superficies y un resumen |
| `contexto.enfoque`, `contexto.modelo` | Qué ángulo le tocó a esta rama y qué modelo la escribió |

### Qué tiene que devolver

Un veredicto: `{ paso, detalle, evidencia?, salteada? }`.

- **`paso`** tiene que ser un booleano de verdad. Con cualquier otra cosa, Dolphin no adivina: dice
  que la fase se rompió y la saltea.
- **`detalle`** es lo que lee una persona en la fila de la rama: *qué* pasó, no «falló». Se recorta a
  una línea de 200 caracteres y se le pone el nombre de la fase adelante si no lo trae.
- **`evidencia`** es lo que prueba el veredicto, y es lo que vuelve al agente para que corrija. Poné
  acá la salida cruda, el archivo y la línea.
- **`salteada: true`** si no pudiste comprobar nada (faltaba una herramienta, no había qué mirar):
  deja pasar la rama, pero no cuenta como fase pasada. Es lo honesto cuando no sabés.
- **`costo`** (en el verificador, no en el veredicto): `"gratis"` si no le pagás a nadie, `"barato"`
  o `"caro"` si llamás a un modelo. El portón corre primero lo gratis, así que un costo mal
  declarado le hace gastar plata a quien no hacía falta.

## Qué se le concede a una fase de terceros, y qué no

Una fase declarada por el repo es **código ajeno corriendo con tus permisos**: se carga con
`import()` dentro del proceso de Dolphin, y **no hay caja**. Puede leer tus archivos y salir a la
red igual que cualquier módulo que importes. Esto no lo arregla una lista de permisos: lo arregla
leer la fase antes de declararla, como leés una dependencia.

Lo que Dolphin sí hace es no darle más llaves de las que necesita, y decirte en voz alta qué cargó.

**Se le concede**

- El worktree de la rama y lo que el agente declaró (la tabla de arriba).
- Sus propias `opciones`, tal cual las escribió tu repo.
- Un veredicto que puede **cortar la rama**: es el punto de todo esto.

**No se le concede**

- **Correr en un repo que vino de afuera.** Si el repo entró clonando una URL, su configuración no
  se ejecuta: ni sus `porton.comandos` ni sus `porton.fases`. Un `git clone` no puede ejecutar
  código ajeno (la misma regla de `politica.ts` y `firma.ts`: Dolphin corre solo lo que puso alguien
  de esta máquina).
- **Salir del repo para cargarse.** El módulo se busca en el repo: una ruta que se escapa con `..`,
  una URL (`https:`, `data:`) o un paquete que no está instalado **acá** quedan afuera. Un paquete se
  busca en el `node_modules` de este repo y en ninguno de más arriba, así una fase es siempre una
  dependencia declarada del proyecto. (La cuenta se hace sobre la ruta escrita, no sobre el destino
  de un symlink: los enlaces de `node_modules` son asunto de tu gestor de paquetes.)
- **Cargarse desde el worktree de la rama.** El módulo sale del repo, nunca de la copia donde el
  agente acaba de escribir. Si saliera de ahí, el agente podría escribir la fase que lo juzga.
- **El repo de la persona.** Al `correr` se le pasa una copia recortada del universo: su worktree
  sí, `universo.repo` no. Si tu fase necesita comparar contra el repo, pasale la ruta en
  `opciones`: que lo decida quien escribe el config.
- **Su propio nombre.** El nombre lo pone el config. Una fase no se puede hacer pasar por
  «seguridad» ni ocupar el nombre de otra: en la escalera no se sabría cuál habló.
- **Que se le crea el resultado a ciegas.** El veredicto se pasa en limpio: `detalle` a una línea,
  `evidencia` recortada, `videos` ignorados (un nombre de archivo elegido por la fase haría que el
  parte muestre lo que ella quiera) y, en una fase `gratis`, `gastado` siempre 0. Un gasto fantasma
  falsea «muertos gratis», que es la cifra que el producto pone de titular; una fase `barato` o
  `caro` sí informa lo que gastó.
- **Romper el portón.** Un módulo que no está, un export que no es una fábrica, una explosión al
  cargar o al correr y un cuelgue se vuelven una **fase salteada con su motivo**. La rama no paga el
  error de la fase, y la siembra sigue — igual que un comando que no está en la máquina.

**Por qué no se firma.** Lo que corre solo sin que nadie lo haya cargado desde esta máquina
—un turno del calendario, una tarea de la cola— va firmado con la llave de la máquina
([`firma.ts`](../src/nucleo/firma.ts)), porque esos archivos viven en `.dolphin/` y un repo puede
traerlos versionados de contrabando. Una fase es otra cosa: `dolphin.config.json` **es** el archivo
que el repo versiona a propósito, igual que `porton.comandos`, y pedirle una firma obligaría a cada
compañero que clona el repo a volver a firmarlo a mano. La línea, entonces, es la misma que para los
comandos: si el repo lo trajiste vos, su config vale; si entró clonando una URL, no se ejecuta.

**Y se avisa.** Cada carga deja una línea en voz humana —de qué archivo o de qué paquete salió la
fase— que se ve en `dolphin fases` y viaja en `SiembraPreparada.avisos`. La procedencia va también
en la `evidencia` de cada veredicto, así la lee quien revisa por qué rebotó una rama. Una fase que
viene de un paquete lo dice con esas palabras: es código que **no se revisa en los diffs de tu
repo**.

## Compartirla

Una fase es un módulo: se publica en npm como cualquiera. Quien la quiera la instala en su repo y la
declara con su nombre:

```bash
npm i -D dolphin-fase-licencias
```

```json
{ "porton": { "fases": [{ "nombre": "licencias", "modulo": "dolphin-fase-licencias" }] } }
```

Tres cosas que conviene que traiga un paquete de fase: la fábrica como **export por defecto**, un
`queHace` sugerido en su README, y tests que corran sin Dolphin —el verificador es una función
común: se le pasa un `{ ruta }` y se mira qué devuelve—.

## Lo que todavía no hace

- **El portón de afuera (`dolphin mcp`, `porton_probar`) no carga fases de terceros.** Ese portón lo
  dispara un agente por MCP, sin una persona en el medio, y cargar código de terceros en una llamada
  remota es una decisión distinta a cargarlo en una siembra que arrancaste vos. Corre las fases
  propias, los scripts de npm y `porton.comandos`.
- **No hay caja.** Si lo que querés es que la fase no pueda leer tus archivos, hoy no se puede: la
  única barrera es el modo aislado del agente ([aislamiento.md](aislamiento.md)), que es para el
  agente y no para el portón.
- **El `exports` de un paquete se lee a lo bruto.** Para encontrar el archivo de una fase alcanza
  (`exports["."]`, después `module`, después `main`, después `index.js`), pero no se resuelven
  condiciones de verdad. Si tu paquete es raro, apuntá al archivo: `"mi-paquete/dist/fase.js"`.
