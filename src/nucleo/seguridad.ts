import { diffDe } from "./cambios.js";
import { lineasDeDiff, type LineaDeDiff } from "./trampas.js";
import type { Verificador } from "./tipos.js";

/**
 * Las tres filtraciones de una app hecha con agentes.
 *
 * Son siempre las mismas tres, y cuando pasan no son un bug: son el titular
 * de un diario. La clave de Stripe compilada adentro del bundle, la tabla de
 * Supabase que cualquiera lee con la clave del navegador, el endpoint que
 * borra sin preguntar quién llama. Un agente las escribe sin mala intención
 * —el código anda, los tests pasan, la pantalla se ve bien— y ninguna otra
 * fase del portón las mira: ni los tipos, ni el lint, ni las cinco personas
 * que usan la app, porque desde afuera no se nota.
 *
 * Mira el DIFF de la rama, como trampas.ts, no el repo entero: lo que ya
 * estaba mal no lo rompió esta rama, y cortarla por eso es pedirle que
 * arregle algo que no tocó (es la misma decisión que la línea base del
 * escalón de pantalla). La contracara es que lo viejo no se ve, y está bien:
 * para eso están las herramientas que escanean el repo, que es otro trabajo.
 *
 * Y arriba de las tres reglas manda una sola: NINGÚN falso positivo vale la
 * pena. Una fase que corta una rama buena se apaga a la semana, y una fase
 * apagada no protege de nada. Por eso cada regla pide DOS cosas antes de
 * hablar —el nombre y el valor, el SQL y la huella de Supabase, el endpoint y
 * su cuerpo nuevo— y cada una deja afuera a propósito los casos legítimos que
 * se le parecen: el `.env.example`, la clave anon, el login, la lectura.
 *
 * Es gratis (no le pregunta nada a ningún modelo) y se apaga con
 * `"seguridad": false` en dolphin.config.json.
 */

export type TipoDeRiesgo = "clave-en-el-front" | "tabla-sin-rls" | "endpoint-sin-auth";

export interface HallazgoDeSeguridad {
  readonly tipo: TipoDeRiesgo;
  readonly archivo: string;
  readonly linea: number;
  /** Qué encontró y qué hacer, en una frase: es lo que vuelve al agente para que lo corrija. */
  readonly detalle: string;
}

/** Los riesgos que agregó un worktree contra su base. */
export async function riesgosDe(ruta: string, contra = "HEAD"): Promise<HallazgoDeSeguridad[]> {
  return hallazgosDeSeguridad(await diffDe(ruta, contra));
}

/** Las tres reglas sobre un diff unificado. Puro: es lo que se puede probar sin abrir un repo. */
export function hallazgosDeSeguridad(diff: string): HallazgoDeSeguridad[] {
  const lineas = lineasDeDiff(diff).filter((l) => !seIgnora(l.archivo));
  return [...clavesEnElFront(lineas), ...tablasSinRls(lineas), ...endpointsSinAuth(lineas)];
}

/**
 * Lo que no se mira en ninguna de las tres reglas.
 *
 * El `.env.example` es el falso positivo número uno de cualquier buscador de
 * secretos: está LLENO de claves con forma de clave, y existe justamente para
 * eso. Lo mismo la documentación (una clave en un `.md` es un ejemplo), los
 * tests (ahí las claves son de mentira a propósito) y lo generado o
 * vendorizado, que no lo escribió nadie de este lado.
 */
const ES_TEST = /(\.test\.|\.spec\.|(?:^|\/)tests?\/|__tests__|(?:^|\/)e2e\/|(?:^|\/)__mocks__\/|(?:^|\/)fixtures?\/)/i;
const ES_EJEMPLO = /(\.(?:example|sample|template|dist)\b|(?:^|\/)examples?\/|(?:^|\/)ejemplos?\/|(?:^|\/)docs?\/|(?:^|\/)seeds?\/|README|\.mdx?$|\.txt$)/i;
const ES_GENERADO = /((?:^|\/)(?:node_modules|dist|build|out|vendor|coverage|\.next)\/|(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.min\.(?:js|css)$|\.map$)/i;

function seIgnora(archivo: string): boolean {
  return ES_TEST.test(archivo) || ES_EJEMPLO.test(archivo) || ES_GENERADO.test(archivo);
}

// ───────────────────────────── 1. claves en el bundle del front ─────────────────────────────

/**
 * Los prefijos con los que cada build marca «esto viaja al navegador». No es
 * una convención suelta: Vite y Next REEMPLAZAN el texto de esas variables por
 * su valor dentro del JavaScript que sirven. Un secreto con uno de estos
 * prefijos no está en riesgo de filtrarse: ya está publicado.
 */
const PREFIJO_DE_CLIENTE = /(?<![A-Z0-9_])(?:NEXT_PUBLIC|NUXT_PUBLIC|EXPO_PUBLIC|ASTRO_PUBLIC|REACT_APP|VUE_APP|GATSBY|VITE|PUBLIC)_([A-Z0-9_]+)/g;

/**
 * Qué nombre tiene pinta de secreto. La lista es corta a propósito: las claves
 * que SÍ van en el navegador también se llaman «key» —`ANON_KEY`,
 * `PUBLISHABLE_KEY`, `SITE_KEY`, `POSTHOG_KEY`— y están diseñadas para eso.
 * Ninguna entra acá, así que la regla no las toca.
 */
const NOMBRE_SECRETO = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|ACCESS_?KEY|AUTH_?TOKEN/;

/** Claves con prefijo propio: el proveedor las hace reconocibles, y eso las hace seguras de detectar. */
const CLAVES_DE_PROVEEDOR: readonly { readonly regex: RegExp; readonly que: string }[] = [
  { regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}/, que: "una clave secreta de Stripe" },
  { regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/, que: "una clave de OpenAI o Anthropic" },
  { regex: /\bAKIA[0-9A-Z]{16}(?![0-9A-Za-z])/, que: "una clave de acceso de AWS" },
  { regex: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, que: "un token de GitHub" },
  { regex: /\bxox[baprs]-[A-Za-z0-9-]{12,}/, que: "un token de Slack" },
  { regex: /\bsb_secret_[A-Za-z0-9_-]{10,}/, que: "una clave secreta de Supabase" },
];

/**
 * Archivos que terminan en el navegador. Hace falta acotarlo: una clave en un
 * archivo del servidor también está mal, pero no está PUBLICADA, y es trabajo
 * de otra herramienta (ver docs/seguridad.md). Acá se corta por lo que
 * cualquiera puede leer con «ver código fuente».
 */
const ES_DEL_FRONT =
  /\.(?:tsx|jsx|vue|svelte|astro|html?)$|(?:^|\/)(?:client|frontend|front|web|webapp|ui|public|static|assets|components|componentes|pages|paginas|views|vistas|screens|pantallas|app)\//i;

/**
 * La clave `service_role` de Supabase es un JWT sin prefijo que lo delate: por
 * fuera es igualita a la clave anon, que sí va en el navegador. La diferencia
 * está adentro, en el `role` del payload, así que se decodifica y se mira. Sin
 * esto habría que elegir entre no detectarla nunca o gritarle a todo el mundo
 * por usar la clave anon, que es lo correcto.
 */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/;

function esServiceRole(texto: string): boolean {
  const jwt = JWT.exec(texto);
  if (!jwt) return false;
  try {
    return Buffer.from(jwt[1]!, "base64url").toString("utf8").includes("service_role");
  } catch {
    return false;
  }
}

function clavesEnElFront(lineas: readonly LineaDeDiff[]): HallazgoDeSeguridad[] {
  const hallazgos: HallazgoDeSeguridad[] = [];
  for (const linea of lineas) {
    if (linea.signo !== "+") continue;

    for (const variable of linea.texto.matchAll(PREFIJO_DE_CLIENTE)) {
      const nombre = variable[0];
      if (!NOMBRE_SECRETO.test(variable[1]!)) continue;
      // Un `.env` versionado que todavía no tiene el valor puesto es una
      // plantilla, aunque no se llame `.example`: no hay nada filtrado.
      const valor = valorAsignado(linea.texto, nombre);
      if (valor !== undefined && esRelleno(valor)) continue;
      hallazgos.push({
        tipo: "clave-en-el-front",
        archivo: linea.archivo,
        linea: linea.linea,
        detalle: `«${nombre}» es un secreto con prefijo de cliente: el build lo escribe adentro del JavaScript que baja el navegador y se lee con ver código fuente. Sacale el prefijo, dejalo solo en el servidor y que el front llame a un endpoint tuyo.`,
      });
    }

    if (!ES_DEL_FRONT.test(linea.archivo)) continue;
    const proveedor = CLAVES_DE_PROVEEDOR.find((c) => c.regex.test(linea.texto));
    if (proveedor) {
      hallazgos.push({
        tipo: "clave-en-el-front",
        archivo: linea.archivo,
        linea: linea.linea,
        detalle: `hay ${proveedor.que} escrita a mano en un archivo que se sirve al navegador: cualquiera la lee del bundle. Rotala —ya está quemada— y movela al servidor.`,
      });
      continue;
    }
    if (esServiceRole(linea.texto)) {
      hallazgos.push({
        tipo: "clave-en-el-front",
        archivo: linea.archivo,
        linea: linea.linea,
        detalle: "esa clave de Supabase es la `service_role` (así lo dice su propio payload), no la anon: en el navegador saltea todas las policies de RLS. Rotala y usá la clave anon acá.",
      });
    }
  }
  return hallazgos;
}

/** El valor de `NOMBRE=algo` o `NOMBRE: "algo"`, sin comillas. `undefined` si la línea solo la usa. */
function valorAsignado(linea: string, nombre: string): string | undefined {
  const asignacion = new RegExp(`${nombre}\\s*[:=]\\s*(.*)$`).exec(linea);
  if (!asignacion) return undefined;
  return asignacion[1]!
    .trim()
    .replace(/^["'`]/, "")
    .replace(/["'`]\s*[,;]?\s*$/, "")
    .trim();
}

/**
 * Un valor que está esperando que alguien lo complete. Las palabras van sin
 * `\b`: con tilde («poné», «acá», «aquí») el límite de palabra de JavaScript no
 * cierra, así que se usa el lookbehind de letra Unicode.
 */
function esRelleno(valor: string): boolean {
  if (valor === "" || /^(?:undefined|null)$/i.test(valor)) return true;
  if (/^(?:<|\{|\[|\$\{|\*{2,}|\.{3}|x{3,}|y{3,})/i.test(valor)) return true;
  if (/^(?:your|my|tu|mi|su|the)[-_. ]/i.test(valor)) return true;
  return /(?<!\p{L})(?:ejemplo|example|sample|dummy|fake|placeholder|changeme|cambiame|cambialo|pon[eé]|reemplaz\p{L}*|aqu[íi]|ac[áa]|tu-?clave|tu-?token)(?!\p{L})/iu.test(valor);
}

// ───────────────────────────── 2. tablas de Supabase sin RLS ─────────────────────────────

const ES_SQL = /\.sql$/i;
const BAJO_SUPABASE = /(?:^|\/)supabase\//i;
const HUELLA_DE_SUPABASE = /supabase|postgrest|auth\.uid\s*\(|create\s+policy|row\s+level\s+security|\bto\s+(?:anon|authenticated|service_role)\b/i;

const CREA_TABLA = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w$]+"?)(?:\s*\.\s*("?[\w$]+"?))?/gi;
const PRENDE_RLS = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w$]+"?)(?:\s*\.\s*("?[\w$]+"?))?[^;]{0,400}?(?:enable|force)\s+row\s+level\s+security/gi;

/**
 * Una tabla sin RLS solo es un agujero si algo la publica por HTTP con una
 * clave que vive en el navegador: eso es Supabase (o PostgREST). En un Postgres
 * detrás de tu propio backend, pedir RLS no tiene ningún sentido, y una fase
 * que le grita «falta RLS» a cada migración de un proyecto con Django o Rails
 * es una fase que se apaga el primer día. Así que la regla pide ver la huella.
 */
function pareceSupabase(lineas: readonly LineaDeDiff[]): boolean {
  return lineas.some((l) => BAJO_SUPABASE.test(l.archivo) || HUELLA_DE_SUPABASE.test(l.texto));
}

function tablasSinRls(lineas: readonly LineaDeDiff[]): HallazgoDeSeguridad[] {
  const nuevas = lineas.filter((l) => l.signo === "+" && ES_SQL.test(l.archivo));
  if (nuevas.length === 0 || !pareceSupabase(lineas)) return [];

  // Las que quedan con RLS se buscan en TODO el diff y no archivo por archivo:
  // la tabla y su `alter table … enable row level security` suelen venir en dos
  // migraciones distintas de la misma rama, y mirarlas por separado inventaba
  // un hallazgo en la primera.
  const prendidas = tablasConRls(unirLineas(lineas.filter((l) => l.signo !== "-")).texto);
  const hallazgos: HallazgoDeSeguridad[] = [];

  for (const [archivo, propias] of porArchivo(nuevas)) {
    const { texto, numeros } = unirLineas(propias);
    for (const creada of texto.matchAll(CREA_TABLA)) {
      // Con dos partes, la primera es el esquema. Fuera de «public» no hay nada
      // que proteger: la API de Supabase no expone los demás esquemas, así que
      // una tabla en «private» o en «auth» no se alcanza desde el navegador.
      const esquema = creada[2] ? limpiarNombre(creada[1]!) : "public";
      const tabla = limpiarNombre(creada[2] ?? creada[1]!);
      if (esquema !== "public" || prendidas.has(tabla)) continue;
      hallazgos.push({
        tipo: "tabla-sin-rls",
        archivo,
        linea: numeroDeLinea(texto, creada.index ?? 0, numeros),
        detalle: `la tabla «${tabla}» se crea sin RLS: con la clave anon, que está en el bundle, cualquiera la lee y la escribe entera desde el navegador. Agregá «alter table ${tabla} enable row level security» y las policies de quién puede qué.`,
      });
    }
  }
  return hallazgos;
}

function tablasConRls(texto: string): Set<string> {
  const prendidas = new Set<string>();
  for (const alterada of texto.matchAll(PRENDE_RLS)) prendidas.add(limpiarNombre(alterada[2] ?? alterada[1]!));
  return prendidas;
}

function limpiarNombre(crudo: string): string {
  return crudo.replace(/"/g, "").toLowerCase();
}

/**
 * Las líneas de un archivo como un solo texto, sin comentarios y con el número
 * de cada una al lado. De una sola línea no alcanza: el `enable row level
 * security` se escribe debajo del `alter table`, y una regla línea por línea no
 * lo veía nunca.
 */
function unirLineas(lineas: readonly LineaDeDiff[]): { texto: string; numeros: number[] } {
  const texto = lineas
    .map((l) => l.texto.replace(/--.*$/, ""))
    .join("\n")
    // Los de bloque se reemplazan por espacios en vez de borrarse: así los
    // saltos de línea quedan donde están y el número que se informa sigue
    // siendo el de verdad.
    .replace(/\/\*[\s\S]*?\*\//g, (comentario) => comentario.replace(/[^\n]/g, " "));
  return { texto, numeros: lineas.map((l) => l.linea) };
}

function numeroDeLinea(texto: string, indice: number, numeros: readonly number[]): number {
  const saltos = texto.slice(0, indice).split("\n").length - 1;
  return numeros[Math.min(saltos, numeros.length - 1)] ?? 0;
}

// ───────────────────────────── 3. endpoints que escriben sin autenticar ─────────────────────────────

/**
 * Quién puede ser un router y quién no. La lista es cerrada porque el mismo
 * `.post(` lo escriben los CLIENTES HTTP —`axios.post`, `client.post`,
 * `supertest`— y ahí no hay ningún endpoint: tratarlos como ruta era gritarle a
 * cada llamada del front.
 */
const RUTA_DE_SERVIDOR = /\b(?:app|router|server|fastify|hono|instancia|\w*(?:Router|Routes|App))\s*\.\s*(post|put|patch|delete)\s*\(/;
/** Nest (`@Post()`) y FastAPI o Flask (`@app.post("/x")`). */
const DECORADOR_DE_RUTA = /^\s*@(?:\w+\s*\.\s*)?(Post|Put|Patch|Delete|post|put|patch|delete)\s*\(/;
const RUTA_DE_FLASK = /@\w+\.route\s*\([^)]*methods\s*=\s*\[[^\]]*["'](POST|PUT|PATCH|DELETE)["']/i;
/** Un route handler de Next: el método ES el nombre de la función exportada. */
const ES_RUTA_DE_NEXT = /(?:^|\/)route\.(?:ts|js|tsx|jsx|mjs)$/i;
const HANDLER_DE_NEXT = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/;

/**
 * Cualquier señal de que alguien pregunta quién llama. Es a propósito
 * generosísima —y por eso incluye `verif`, `cookie` o un 401 suelto—: cada
 * palabra de más es un endpoint que no se reporta, y cada palabra de menos es
 * una rama buena cortada. El error barato es el primero.
 *
 * Las dos últimas van con el límite de palabra escrito a mano
 * (`(?<!\p{L})…(?!\p{L})`) y no con `\b`, porque en castellano se cruzan con
 * palabras que no tienen nada que ver: `guard` está adentro de «guardar» y
 * `firma` adentro de «confirmar», así que `app.post("/x", … guardar(…))` se
 * eximía solo y la regla no reportaba nunca nada en un repo en castellano. Con
 * `\b` no alcanza: el `\b` de JavaScript no cierra palabra contra una letra
 * acentuada, y acá al lado hay «sesión» y «confirmá».
 */
const SENAL_DE_AUTH =
  /auth|autentic|autoriz|sesi[oó]n|session|token|jwt|bearer|cookie|permis|getuser|currentuser|usuarioactual|verif|signature|hmac|secret|clerk|passport|depends\s*\(|login_required|csrf|api_?key|service_role|claims|\brol(?:es)?\b|\b401\b|\b403\b|(?<!\p{L})(?:guard(?:ia|ian|s)?|firma\p{L}*)(?!\p{L})/iu;

/** Un guardia puesto para todo el router: lo de abajo ya pasa por la sesión aunque su línea no lo diga. */
const GUARDIA_GLOBAL =
  /\.(?:use|addHook|register|beforeEach)\s*\([^)]{0,80}(?:auth|autentic|autoriz|sesi[oó]n|session|token|jwt|permis|passport|clerk|proteg|protect|(?<!\p{L})guard(?:ia|ian|s)?(?!\p{L}))|@UseGuards|before_request|\bpreHandler\s*:|\bonRequest\s*:/iu;

/**
 * Lo que es público por diseño. Pedirle sesión a un login es el falso positivo
 * más obvio de toda la regla: nadie puede estar logueado antes de loguearse.
 */
const RUTAS_PUBLICAS =
  /(?:^|\/)(?:auth|login|signin|sign-in|signup|sign-up|registro|register|logout|signout|sesion|session|password|contrase(?:n|ñ)a|olvide|forgot|reset|otp|magic|verificar|verify|confirmar|confirm|callback|health|healthz|ping|status|contacto|contact|newsletter|suscribir|subscribe|feedback)\b/i;

/** Cuánto se mira alrededor del endpoint: arriba el decorador o el middleware, abajo el cuerpo. */
const LINEAS_ARRIBA = 6;
const LINEAS_ABAJO = 30;
/** Cuántas líneas nuevas tiene que haber debajo para considerar que el cuerpo también es de esta rama. */
const CUERPO_NUEVO = 2;

function endpointsSinAuth(lineas: readonly LineaDeDiff[]): HallazgoDeSeguridad[] {
  const hallazgos: HallazgoDeSeguridad[] = [];

  for (const [archivo, todas] of porArchivo(lineas)) {
    // Cómo queda el archivo después de la rama: lo agregado y el contexto. El
    // chequeo puede estar en una línea que no se tocó.
    const despues = todas.filter((l) => l.signo !== "-");
    if (despues.some((l) => GUARDIA_GLOBAL.test(l.texto))) continue;

    for (let i = 0; i < despues.length; i++) {
      const linea = despues[i]!;
      if (linea.signo !== "+") continue;
      const metodo = metodoQueEscribe(linea.texto, archivo);
      if (!metodo) continue;

      const camino = caminoDe(linea.texto) ?? caminoDelArchivo(archivo);
      if (camino && RUTAS_PUBLICAS.test(camino)) continue;

      // El cuerpo tiene que ser nuevo también. Una línea sola que engancha un
      // handler que ya existía es un cambio de cableado, y el chequeo vive en
      // el handler, que el diff no muestra: ahí la regla se calla antes que
      // inventar. Lo que importa de verdad —el endpoint escrito de cero— llega
      // siempre con su cuerpo al lado.
      if (despues.slice(i + 1, i + 1 + LINEAS_ABAJO).filter((l) => l.signo === "+").length < CUERPO_NUEVO) continue;

      // Las comillas NO se sacan antes de buscar la señal: un
      // `headers.get("authorization")` es un chequeo y vive adentro de un
      // string. El precio es que un endpoint llamado «/api/tokens» se exime
      // solo, y ese falso negativo es mucho más barato que el falso positivo.
      const ventana = despues
        .slice(Math.max(0, i - LINEAS_ARRIBA), i + 1 + LINEAS_ABAJO)
        .map((l) => l.texto)
        .join("\n");
      if (SENAL_DE_AUTH.test(ventana)) continue;

      hallazgos.push({
        tipo: "endpoint-sin-auth",
        archivo,
        linea: linea.linea,
        detalle: `el endpoint ${metodo}${camino ? ` ${camino}` : ""} escribe o borra datos y no hay ningún chequeo de sesión, token ni permiso cerca: lo llama cualquiera desde la consola del navegador. Resolvé quién llama antes de tocar datos, o ponele el middleware que ya usa el resto.`,
      });
    }
  }
  return hallazgos;
}

function metodoQueEscribe(texto: string, archivo: string): string | undefined {
  const servidor = RUTA_DE_SERVIDOR.exec(texto);
  if (servidor) return servidor[1]!.toUpperCase();
  const decorador = DECORADOR_DE_RUTA.exec(texto);
  if (decorador) return decorador[1]!.toUpperCase();
  const flask = RUTA_DE_FLASK.exec(texto);
  if (flask) return flask[1]!.toUpperCase();
  if (ES_RUTA_DE_NEXT.test(archivo)) return HANDLER_DE_NEXT.exec(texto)?.[1];
  return undefined;
}

/** El primer texto entre comillas que empieza con «/»: el camino de la ruta. */
function caminoDe(texto: string): string | undefined {
  return /["'`](\/[^"'`]*)["'`]/.exec(texto)?.[1];
}

/** En Next el camino es la carpeta: `app/api/facturas/route.ts` es `/api/facturas`. */
function caminoDelArchivo(archivo: string): string | undefined {
  const carpeta = /(?:^|\/)app\/(.+)\/route\.[a-z]+$/i.exec(archivo);
  return carpeta ? `/${carpeta[1]!}` : undefined;
}

// ───────────────────────────── la fase ─────────────────────────────

function porArchivo(lineas: readonly LineaDeDiff[]): Map<string, LineaDeDiff[]> {
  const mapa = new Map<string, LineaDeDiff[]>();
  for (const linea of lineas) {
    const previas = mapa.get(linea.archivo);
    if (previas) previas.push(linea);
    else mapa.set(linea.archivo, [linea]);
  }
  return mapa;
}

export function resumirRiesgos(hallazgos: readonly HallazgoDeSeguridad[]): string {
  return (
    hallazgos.slice(0, 3).map((h) => `${h.archivo}:${h.linea} (${h.detalle})`).join("; ") +
    (hallazgos.length > 3 ? ` y ${hallazgos.length - 3} más` : "")
  );
}

export function verificadorDeSeguridad(): Verificador {
  return {
    nombre: "seguridad",
    costo: "gratis",
    async correr(universo) {
      const hallazgos = await riesgosDe(universo.ruta);
      if (hallazgos.length === 0) {
        return { paso: true, detalle: "seguridad: no agregó claves en el front, tablas sin RLS ni endpoints sin autenticar", gastado: 0 };
      }
      return {
        paso: false,
        detalle: `seguridad: ${resumirRiesgos(hallazgos)}`,
        evidencia: hallazgos.map((h) => `${h.archivo}:${h.linea}  ${h.tipo}\n  ${h.detalle}`).join("\n"),
        gastado: 0,
      };
    },
  };
}
