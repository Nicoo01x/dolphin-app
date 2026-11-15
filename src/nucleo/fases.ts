import { access, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { leerConfig } from "./config.js";
import { leerMemoria } from "./memoria.js";
import { esClonado } from "./proyectos.js";
import { repartir } from "./router.js";
import { leerSpecs } from "./spec.js";
import { ORDEN_DE_COSTO, type ContextoDeVerificacion, type Costo, type Universo, type Veredicto, type Verificador } from "./tipos.js";
import { FASES_DE_NPM, fasesDelPaquete } from "./verificadores.js";

/**
 * Una fase del portón escrita por otra persona.
 *
 * El portón ya corre lo que el repo tiene (tipos, lint, tests, los comandos de
 * `porton.comandos`) y las fases propias (configuración, política, seguridad,
 * pantalla). Falta lo del medio: la comprobación que sabe hacer el equipo de
 * ESE repo y nadie más —que ninguna dependencia nueva entre sin licencia
 * permisiva, que cada migración tenga su vuelta atrás, que los textos estén en
 * la voz de la marca— y que quien la escribe pueda publicarla para que otro la
 * use. Eso es lo que falta para que el portón sea de todos y no solo nuestro.
 *
 * Se declara en `dolphin.config.json`, al lado de las demás:
 *
 * ```json
 * { "porton": { "fases": [
 *     { "nombre": "licencias",
 *       "modulo": "./dolphin/fases/licencias.mjs",
 *       "queHace": "ninguna dependencia nueva sin licencia permisiva",
 *       "opciones": { "permitidas": ["MIT", "ISC"] } }
 * ] } }
 * ```
 *
 * y el módulo exporta por defecto una fábrica: `(opciones) => Verificador`.
 * Ese es todo el contrato, y es el mismo que ya cumplían las fases propias: no
 * hay una segunda API que mantener estable.
 *
 * ## Por qué así, y no de otra forma
 *
 * - **Código en un archivo, no texto en el config.** Un `"codigo": "…"` que se
 *   evalúa convierte un archivo de datos en un archivo que se ejecuta, que es
 *   justo el agujero que tapa config-ejecutable.ts. Un módulo se lee, se revisa
 *   en un diff y se le escriben tests.
 * - **Declarada a mano, nunca descubierta sola.** No se levanta una carpeta de
 *   fases por convención: clonar un repo pasaría a traer fases que nadie leyó.
 *   Sumar una es una línea de un archivo versionado, y trampas.ts ya mira
 *   cuando una desaparece de ahí.
 * - **El contrato es `Verificador` pelado.** Nada de inyectarle «la API de
 *   Dolphin»: con la ruta de su worktree, una fase puede hacer todo lo que una
 *   fase necesita, y lo que no se le pasa no hay que mantenerlo estable.
 *
 * ## Qué se le concede
 *
 * Correr dentro del proceso de Dolphin —no hay caja— con el worktree de la
 * rama (`ruta`, `rama`, `base`, `entorno`), lo que el agente declaró haber
 * tocado, sus propias `opciones` y un veredicto que puede matar la rama.
 *
 * ## Qué no
 *
 * - **No corre en un repo que vino de afuera.** Igual que `porton.comandos`:
 *   la configuración de un repo clonado no se ejecuta. Un `git clone` no puede
 *   ejecutar código ajeno.
 *
 *   No va firmada como un turno del calendario (ver firma.ts) a propósito: eso
 *   protege archivos de `.dolphin/` que un repo puede traer de contrabando, y
 *   `dolphin.config.json` es justo el archivo que el repo versiona a propósito.
 *   Pedirle una firma obligaría a cada compañero que clona el repo a volver a
 *   firmarlo a mano. La línea es la de politica.ts: si el repo lo trajiste vos,
 *   su config vale; si entró clonando una URL, no se ejecuta.
 * - **El módulo se busca en el REPO, nunca en el worktree de la rama.** Si se
 *   buscara en el worktree, el agente podría escribir la fase que lo juzga.
 * - **Adentro del repo y nada más**: una ruta que se escapa, una URL o un
 *   paquete de un `node_modules` de más arriba quedan afuera. Un paquete tiene
 *   que estar instalado en ESTE repo.
 * - **El nombre lo pone el config, no el módulo**: así una fase de terceros no
 *   se puede hacer pasar por «seguridad» ni ocupar el nombre de una propia.
 * - **No se le cree el resultado a ciegas**: lo que devuelve se normaliza
 *   (`paso` tiene que ser booleano, el detalle se recorta a una línea, los
 *   videos no se toman) y una fase declarada `gratis` no puede informar plata:
 *   un gasto fantasma falsea «muertos gratis», que es la cifra que el producto
 *   pone de titular.
 * - **Y nunca rompe el portón**: un módulo que no está, un export que no es una
 *   fábrica, una explosión al cargar o al correr y un cuelgue se vuelven una
 *   fase SALTEADA con su motivo —la rama no paga el error de la fase—, igual
 *   que un comando que no está en la máquina (ver verificadores.ts).
 *
 * Y cada carga se **avisa**: `avisos` dice en voz humana qué código ajeno entró
 * al portón y de dónde salió. `dolphin fases` lo muestra.
 */

/** Una fase de terceros, como la declara `porton.fases` de dolphin.config.json. */
export interface FaseDeclarada {
  readonly nombre: string;
  /** Una ruta del repo (`./dolphin/fases/x.mjs`) o un paquete instalado en él. */
  readonly modulo: string;
  /** En una línea, qué comprueba: es lo que muestra `dolphin fases`. */
  readonly queHace?: string;
  /** Lo que recibe la fábrica. Dolphin no lo mira: es entre el repo y la fase. */
  readonly opciones?: unknown;
  /** Milisegundos antes de darla por colgada. Una fase que no termina no es un rebote. */
  readonly tope?: number;
}

/** De dónde salió el archivo que se cargó. */
export type OrigenDeFase = "repo" | "paquete";

export interface FaseCargada {
  readonly nombre: string;
  readonly modulo: string;
  readonly de?: OrigenDeFase;
  readonly queHace?: string;
  /** El que declaró el módulo: es lo que decide en qué escalón del portón entra. */
  readonly costo: Costo;
  /** Entró al portón. Falso: la declaración no sirve y no hay ni fase salteada que mostrar. */
  readonly enElPorton: boolean;
  /** Por qué no va a correr, o por qué no entró. Ausente: carga limpia. */
  readonly porQue?: string;
}

export interface FasesExternas {
  /** Lo que se suma al portón, en el orden declarado. */
  readonly verificadores: readonly Verificador[];
  /** Una por declaración, con de dónde salió y si se pudo cargar. */
  readonly fases: readonly FaseCargada[];
  /** Qué código ajeno se cargó, dicho para una persona. */
  readonly avisos: readonly string[];
}

export const SIN_FASES_EXTERNAS: FasesExternas = { verificadores: [], fases: [], avisos: [] };

/** Una fase que no termina deja esperando al portón entero: el mismo tope que un comando. */
const TOPE_POR_DEFECTO_MS = 180_000;
/** El detalle entra en una fila de la pantalla; la evidencia se lee en el parte. */
const TOPE_DETALLE = 200;
const TOPE_EVIDENCIA = 20_000;

/**
 * Los nombres que ya usa Dolphin. Una fase de terceros no puede llamarse así:
 * en la escalera, en la bitácora y en el parte las fases se nombran, y dos
 * «seguridad» hacen que no se sepa cuál dijo que pasó.
 */
export const NOMBRES_DE_DOLPHIN: readonly string[] = [
  "configuración",
  "política",
  "spec",
  "tests intactos",
  "seguridad",
  "memoria",
  "pantalla",
  "vision",
  "uso",
  "revisión",
  ...FASES_DE_NPM,
];

/**
 * Un nombre lo bastante corto y manso para una fila: letras (con tildes),
 * números y separadores. Sin saltos de línea ni `<`, que terminan en el HTML
 * del parte.
 */
const NOMBRE_SANO = /^[\p{L}\p{N}][\p{L}\p{N} ._:-]{0,39}$/u;

/** Para comparar nombres: sin tildes y en minúscula, así «Politica» choca con «política». */
function comoSeCompara(nombre: string): string {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

const RESERVADOS = new Set(NOMBRES_DE_DOLPHIN.map(comoSeCompara));

function unaLinea(texto: string, tope: number): string {
  const plano = texto.replace(/\s+/g, " ").trim();
  return plano.length > tope ? `${plano.slice(0, tope - 1)}…` : plano;
}

function mensajeDe(error: unknown): string {
  return unaLinea(error instanceof Error ? error.message : String(error), 160) || "sin motivo";
}

/** Lo que se declaró, validado: lo que no tiene nombre sano y módulo de texto no entra. */
export function fasesDeclaradas(crudas: readonly unknown[] | undefined): { declarada: FaseDeclarada; porQue?: string }[] {
  const vistos = new Set<string>();
  const salida: { declarada: FaseDeclarada; porQue?: string }[] = [];

  for (const cruda of crudas ?? []) {
    if (!cruda || typeof cruda !== "object") continue;
    const c = cruda as { nombre?: unknown; modulo?: unknown; queHace?: unknown; opciones?: unknown; tope?: unknown };
    if (typeof c.nombre !== "string" || typeof c.modulo !== "string") continue;
    const nombre = c.nombre.trim();
    const modulo = c.modulo.trim();
    if (!NOMBRE_SANO.test(nombre) || modulo === "") continue;

    const declarada: FaseDeclarada = {
      nombre,
      modulo,
      ...(typeof c.queHace === "string" && c.queHace.trim() !== "" ? { queHace: unaLinea(c.queHace, 120) } : {}),
      ...(c.opciones !== undefined ? { opciones: c.opciones } : {}),
      ...(typeof c.tope === "number" && Number.isFinite(c.tope) && c.tope > 0 ? { tope: c.tope } : {}),
    };

    const clave = comoSeCompara(nombre);
    if (RESERVADOS.has(clave)) {
      salida.push({ declarada, porQue: `«${nombre}» es el nombre de una fase de Dolphin: elegí otro y la fase entra` });
      continue;
    }
    if (vistos.has(clave)) {
      salida.push({ declarada, porQue: `hay dos fases llamadas «${nombre}»: en la escalera no se sabría cuál habló` });
      continue;
    }
    vistos.add(clave);
    salida.push({ declarada });
  }
  return salida;
}

const existe = (ruta: string) => access(ruta).then(() => true, () => false);

function dentroDelRepo(repo: string, archivo: string): boolean {
  const rel = relative(resolve(repo), resolve(archivo));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const ES_RUTA = /^\.{1,2}[/\\]/;
const TIENE_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;

/** El nombre del paquete de un especificador, con su subcamino: `@scope/pkg/fases/x.js`. */
function partirEspecificador(modulo: string): { paquete: string; subcamino: string } {
  const partes = modulo.split("/");
  const corte = modulo.startsWith("@") ? 2 : 1;
  return { paquete: partes.slice(0, corte).join("/"), subcamino: partes.slice(corte).join("/") };
}

/**
 * La entrada de un package.json, sin resolver condiciones de verdad: alcanza
 * para encontrar el archivo de una fase, y lo que no se encuentra se saltea con
 * su motivo en vez de adivinar.
 */
function entradaDelPaquete(pkg: unknown, hondo = 0): string | undefined {
  if (typeof pkg === "string") return pkg;
  if (hondo > 6 || !pkg || typeof pkg !== "object") return undefined;
  const o = pkg as Record<string, unknown>;
  for (const clave of [".", "import", "module", "default", "require"]) {
    if (clave in o) {
      const encontrado = entradaDelPaquete(o[clave], hondo + 1);
      if (encontrado) return encontrado;
    }
  }
  return undefined;
}

/**
 * Qué archivo es el módulo de una fase. Siempre adentro del repo y a partir
 * del repo: un paquete se busca en SU `node_modules` y en ninguno de más
 * arriba, así una fase es siempre una dependencia declarada de este repo.
 */
export async function archivoDeFase(repo: string, modulo: string): Promise<{ archivo: string; de: OrigenDeFase } | { porQue: string }> {
  const esRuta = ES_RUTA.test(modulo) || isAbsolute(modulo);
  if (!esRuta && TIENE_ESQUEMA.test(modulo)) {
    return { porQue: `«${modulo}» no es una ruta del repo ni un paquete instalado: una fase no se baja de internet ni sale de un módulo de Node` };
  }

  if (esRuta) {
    const archivo = resolve(repo, modulo);
    if (!dentroDelRepo(repo, archivo)) return { porQue: `«${modulo}» cae fuera del repo: una fase vive adentro del repo que la declara` };
    if (!(await existe(archivo))) return { porQue: `no encontré «${modulo}» en el repo` };
    return { archivo, de: "repo" };
  }

  const { paquete, subcamino } = partirEspecificador(modulo);
  const raiz = join(repo, "node_modules", paquete);
  if (!dentroDelRepo(repo, raiz)) return { porQue: `«${modulo}» no es un nombre de paquete que pueda buscar en el repo` };

  // Sin «./» adelante, «fases/x.mjs» es un paquete para Node, no una ruta. Es el
  // error más fácil de cometer escribiendo el config, así que se nombra.
  const comoRuta = (await existe(resolve(repo, modulo))) ? `; si querías una ruta del repo, escribila «./${modulo}»` : "";

  if (subcamino !== "") {
    const archivo = resolve(raiz, subcamino);
    if (!dentroDelRepo(repo, archivo)) return { porQue: `«${modulo}» se escapa del paquete` };
    if (!(await existe(archivo))) return { porQue: `no encontré «${modulo}» en el node_modules del repo${comoRuta}` };
    return { archivo, de: "paquete" };
  }

  const crudo = await readFile(join(raiz, "package.json"), "utf8").catch(() => undefined);
  if (crudo === undefined) {
    return { porQue: `el paquete «${paquete}» no está instalado en este repo (probá instalarlo acá, no global)${comoRuta}` };
  }
  let entrada: string | undefined;
  try {
    const pkg = JSON.parse(crudo) as { exports?: unknown; module?: unknown; main?: unknown };
    entrada = entradaDelPaquete(pkg.exports) ?? entradaDelPaquete(pkg.module) ?? entradaDelPaquete(pkg.main) ?? "index.js";
  } catch {
    return { porQue: `el package.json de «${paquete}» no se pudo leer` };
  }
  const archivo = resolve(raiz, entrada);
  if (!dentroDelRepo(repo, archivo)) return { porQue: `la entrada de «${paquete}» apunta fuera del repo` };
  if (!(await existe(archivo))) return { porQue: `«${paquete}» declara «${entrada}» y ese archivo no está` };
  return { archivo, de: "paquete" };
}

/** Se corta de esperar, pero no se cancela: una fase colgada es su problema, no el del portón. */
function conTope<T>(promesa: Promise<T>, ms: number, queDecir: string): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error(queDecir)), ms);
    reloj.unref?.();
    promesa.then(
      (valor) => {
        clearTimeout(reloj);
        resolver(valor);
      },
      (error) => {
        clearTimeout(reloj);
        rechazar(error);
      },
    );
  });
}

function saltear(nombre: string, porQue: string): Veredicto & { gastado: number } {
  return { paso: true, salteada: true, detalle: `${nombre}: ${porQue}`, gastado: 0 };
}

/** Una fase que no se pudo cargar sigue estando en la escalera: salteada, con su motivo a la vista. */
function faseSalteada(nombre: string, porQue: string): Verificador {
  return {
    nombre,
    costo: "gratis",
    async correr() {
      return saltear(nombre, `${porQue}, se salteó`);
    },
  };
}

/** Lo único que ve una fase del universo: su worktree, no el repo de la persona. */
function loQueSeLeConcede(universo: Universo): Universo {
  return {
    id: universo.id,
    rama: universo.rama,
    ruta: universo.ruta,
    nacido: universo.nacido,
    ...(universo.base ? { base: universo.base } : {}),
    ...(universo.entorno ? { entorno: universo.entorno } : {}),
  };
}

/**
 * El veredicto de una fase ajena, pasado en limpio. `paso` tiene que ser un
 * booleano de verdad: con un `"no"` de texto la rama pasaría por truthy, y
 * adivinar qué quiso decir es peor que decir que la fase se rompió.
 */
function normalizar(nombre: string, costo: Costo, crudo: unknown, aviso?: string): Veredicto & { gastado: number } {
  if (!crudo || typeof crudo !== "object") return saltear(nombre, "no devolvió un veredicto, se salteó");
  const v = crudo as { paso?: unknown; detalle?: unknown; evidencia?: unknown; salteada?: unknown; gastado?: unknown };
  if (typeof v.paso !== "boolean") return saltear(nombre, "su veredicto no dice si pasó o no, se salteó");

  const dicho = typeof v.detalle === "string" && v.detalle.trim() !== "" ? unaLinea(v.detalle, TOPE_DETALLE) : v.paso ? "pasó" : "no pasó";
  const detalle = comoSeCompara(dicho).startsWith(`${comoSeCompara(nombre)}:`) ? dicho : `${nombre}: ${dicho}`;
  // Una fase gratis no puede informar plata: un gasto fantasma falsea «muertos gratis».
  const gastado = costo !== "gratis" && typeof v.gastado === "number" && Number.isFinite(v.gastado) && v.gastado >= 0 ? v.gastado : 0;
  const suya = typeof v.evidencia === "string" ? v.evidencia.slice(0, TOPE_EVIDENCIA) : "";
  const evidencia = [aviso, suya].filter((t) => t !== undefined && t !== "").join("\n");

  return {
    paso: v.paso,
    detalle,
    gastado,
    ...(evidencia !== "" ? { evidencia } : {}),
    ...(v.salteada === true ? { salteada: true as const } : {}),
  };
}

function dondeSalio(de: OrigenDeFase, modulo: string): string {
  return de === "paquete" ? `del paquete «${modulo}», que no se revisa en los diffs de este repo` : `del archivo «${modulo}» del repo`;
}

/**
 * Carga las fases declaradas y las deja listas para el portón. Nada de lo que
 * pase acá tira: cada falla se vuelve una fase salteada con su motivo.
 */
export async function cargarFasesExternas(repo: string, crudas: readonly unknown[] | undefined, opciones: { readonly tope?: number } = {}): Promise<FasesExternas> {
  const verificadores: Verificador[] = [];
  const fases: FaseCargada[] = [];
  const avisos: string[] = [];

  for (const { declarada, porQue } of fasesDeclaradas(crudas)) {
    const comun = {
      nombre: declarada.nombre,
      modulo: declarada.modulo,
      ...(declarada.queHace ? { queHace: declarada.queHace } : {}),
    };

    if (porQue) {
      fases.push({ ...comun, costo: "gratis", enElPorton: false, porQue });
      avisos.push(`La fase «${declarada.nombre}» quedó afuera del portón: ${porQue}.`);
      continue;
    }

    const donde = await archivoDeFase(repo, declarada.modulo);
    if ("porQue" in donde) {
      verificadores.push(faseSalteada(declarada.nombre, donde.porQue));
      fases.push({ ...comun, costo: "gratis", enElPorton: true, porQue: donde.porQue });
      avisos.push(`La fase «${declarada.nombre}» no se pudo cargar y se va a saltear: ${donde.porQue}.`);
      continue;
    }

    const cargada = await cargarUna(declarada, donde, opciones.tope);
    verificadores.push(cargada.verificador);
    fases.push({ ...comun, de: donde.de, costo: cargada.verificador.costo, enElPorton: true, ...(cargada.porQue ? { porQue: cargada.porQue } : {}) });
    avisos.push(
      cargada.porQue
        ? `La fase «${declarada.nombre}» no se pudo cargar y se va a saltear: ${cargada.porQue}.`
        : `La fase «${declarada.nombre}» es código de terceros, ${dondeSalio(donde.de, declarada.modulo)}: corre con los permisos de Dolphin y su veredicto puede cortar una rama (ver docs/fases.md).`,
    );
  }

  return { verificadores, fases, avisos };
}

async function cargarUna(
  declarada: FaseDeclarada,
  donde: { archivo: string; de: OrigenDeFase },
  topeDeAfuera?: number,
): Promise<{ verificador: Verificador; porQue?: string }> {
  const nombre = declarada.nombre;
  const tope = declarada.tope ?? topeDeAfuera ?? TOPE_POR_DEFECTO_MS;

  let crudo: unknown;
  try {
    // Se carga desde el repo, nunca desde el worktree de la rama: si no, el
    // agente podría escribir la fase que lo juzga.
    crudo = await import(pathToFileURL(donde.archivo).href);
  } catch (error) {
    const porQue = `el módulo se rompió al cargarse (${mensajeDe(error)})`;
    return { verificador: faseSalteada(nombre, porQue), porQue };
  }

  const fabrica = (crudo as { default?: unknown } | undefined)?.default;
  if (typeof fabrica !== "function") {
    const porQue = `«${declarada.modulo}» no exporta por defecto una función que devuelva la fase`;
    return { verificador: faseSalteada(nombre, porQue), porQue };
  }

  let suyo: unknown;
  try {
    suyo = await conTope(Promise.resolve(fabrica(declarada.opciones)), tope, `la fábrica no contestó en ${Math.round(tope / 1000)} s`);
  } catch (error) {
    const porQue = `la fábrica falló (${mensajeDe(error)})`;
    return { verificador: faseSalteada(nombre, porQue), porQue };
  }

  if (!suyo || typeof suyo !== "object" || typeof (suyo as { correr?: unknown }).correr !== "function") {
    const porQue = `«${declarada.modulo}» devolvió algo que no es una fase (le falta «correr»)`;
    return { verificador: faseSalteada(nombre, porQue), porQue };
  }
  const ajena = suyo as Verificador;

  const costo: Costo = ORDEN_DE_COSTO.includes(ajena.costo) ? ajena.costo : "gratis";
  // La procedencia viaja en la evidencia: ahí la ve quien lee por qué rebotó una rama.
  const aviso = `— esta fase la puso ${dondeSalio(donde.de, declarada.modulo)}`;

  return {
    verificador: {
      // El nombre es el del config, no el del módulo: una fase de terceros no
      // se hace pasar por otra.
      nombre,
      costo,
      async correr(universo: Universo, contexto?: ContextoDeVerificacion) {
        try {
          const veredicto = await conTope(
            Promise.resolve(ajena.correr(loQueSeLeConcede(universo), contexto)),
            tope,
            `no contestó en ${Math.round(tope / 1000)} s`,
          );
          return normalizar(nombre, costo, veredicto, aviso);
        } catch (error) {
          // Que la fase se rompa no es culpa de la rama: se saltea, como un comando que no está.
          return saltear(nombre, `la fase falló (${mensajeDe(error)}), se salteó`);
        }
      },
    },
  };
}

/* ───────────────────────── el catálogo ───────────────────────── */

export type DeDonde = "dolphin" | "repo" | "modulo";

export interface FilaDeFase {
  readonly nombre: string;
  readonly de: DeDonde;
  readonly costo: Costo;
  /** En una línea, qué mira. */
  readonly queHace: string;
  /** Corre en este repo, con la configuración que tiene hoy. */
  readonly corre: boolean;
  /** Por qué no corre, o qué le falta. */
  readonly porQue?: string;
}

/**
 * Las fases propias, con lo que mira cada una y cuándo está prendida. La
 * escalera de verdad se arma en siembra.ts; esta tabla lee las mismas fuentes
 * para poder contarla, y lo que decide sigue siendo la siembra.
 */
interface FasePropia {
  readonly nombre: string;
  readonly costo: Costo;
  readonly queHace: string;
  readonly cuando: string;
}

const PROPIAS: readonly FasePropia[] = [
  { nombre: "configuración", costo: "gratis", queHace: "que la rama no toque lo que el repo ejecuta solo (.claude/, .mcp.json, hooks)", cuando: "siempre" },
  { nombre: "política", costo: "gratis", queHace: "lo que corre solo no deploya ni toca migraciones", cuando: "cuando la siembra corre sola (--automatico)" },
  { nombre: "spec", costo: "gratis", queHace: "cada spec del repo sigue cumpliéndose", cuando: "cuando el repo tiene specs" },
  { nombre: "tests intactos", costo: "gratis", queHace: "no se pone verde cambiando tests que ya existían", cuando: '"testsExistentes": "cortar"' },
  { nombre: "seguridad", costo: "gratis", queHace: "claves en el front, tablas sin RLS, endpoints que escriben sin autenticar", cuando: 'salvo "seguridad": false' },
  { nombre: "pantalla", costo: "gratis", queHace: "la app de la rama, usada por cinco personas", cuando: 'cuando "pantalla" dice cómo se levanta la app' },
  { nombre: "vision", costo: "barato", queHace: "un juez mira la app andando, nunca el código", cuando: '"vision": true, con "pantalla"' },
  { nombre: "uso", costo: "barato", queHace: "un modelo usa la app andando (escritorio o web) y cuenta qué vio", cuando: 'cuando "uso" dice cómo se levanta la app' },
  { nombre: "revisión", costo: "barato", queHace: "otro modelo lee el diff contra la tarea", cuando: 'salvo "modelos": { "revisar": false }' },
];

/**
 * Todo lo que puede cruzar una rama de este repo: las de Dolphin, las del repo
 * y las de terceros, con qué hacen, cuánto cuestan y si hoy corren.
 *
 * Ojo: cargar el catálogo CARGA los módulos de las fases de terceros (es la
 * forma de saber si andan). En un repo que vino de afuera no se cargan, igual
 * que en el portón.
 */
export async function catalogoDeFases(repo: string): Promise<{ filas: readonly FilaDeFase[]; avisos: readonly string[] }> {
  const config = await leerConfig(repo);
  const [memoria, specs, deNpm, deAfuera] = await Promise.all([
    leerMemoria(repo),
    leerSpecs(repo).catch(() => []),
    fasesDelPaquete(repo),
    esClonado(repo).catch(() => false),
  ]);
  const revisar = repartir("claude", config.modelos ?? {}).revisar;

  const prendida: Record<string, boolean> = {
    configuración: true,
    política: true,
    spec: specs.length > 0,
    "tests intactos": config.testsExistentes === "cortar",
    seguridad: config.seguridad !== false,
    pantalla: config.pantalla !== undefined,
    vision: config.pantalla !== undefined && Boolean(config.vision),
    revisión: revisar !== null,
  };

  const filas: FilaDeFase[] = PROPIAS.map((p) => ({
    nombre: p.nombre,
    de: "dolphin" as const,
    costo: p.costo,
    queHace: p.queHace,
    corre: prendida[p.nombre] ?? true,
    ...(prendida[p.nombre] ? {} : { porQue: p.cuando }),
  }));

  for (const recuerdo of memoria.recuerdos) {
    if (!recuerdo.activo || recuerdo.candidato === true || recuerdo.patron === undefined) continue;
    filas.push({ nombre: `memoria: ${unaLinea(recuerdo.dicho, 34)}`, de: "dolphin", costo: "gratis", queHace: "tu corrección, como fase: una línea nueva que la rompa corta la rama", corre: true });
  }

  for (const script of deNpm) {
    filas.push({ nombre: script, de: "repo", costo: "gratis", queHace: `npm run ${script}`, corre: true });
  }

  for (const cruda of config.porton?.comandos ?? []) {
    const c = cruda as { nombre?: unknown; cmd?: unknown; args?: unknown };
    if (typeof c.nombre !== "string" || typeof c.cmd !== "string") continue;
    const args = Array.isArray(c.args) ? c.args.filter((a): a is string => typeof a === "string") : [];
    filas.push({
      nombre: c.nombre,
      de: "repo",
      costo: "gratis",
      queHace: [c.cmd, ...args].join(" "),
      corre: !deAfuera,
      ...(deAfuera ? { porQue: "el repo vino de afuera: su configuración no se ejecuta" } : {}),
    });
  }

  const externas = deAfuera
    ? {
        ...SIN_FASES_EXTERNAS,
        fases: fasesDeclaradas(config.porton?.fases).map(({ declarada }) => ({
          nombre: declarada.nombre,
          modulo: declarada.modulo,
          ...(declarada.queHace ? { queHace: declarada.queHace } : {}),
          costo: "gratis" as const,
          enElPorton: false,
          porQue: "el repo vino de afuera: su configuración no se ejecuta",
        })),
      }
    : await cargarFasesExternas(repo, config.porton?.fases);

  for (const fase of externas.fases) {
    filas.push({
      nombre: fase.nombre,
      de: "modulo",
      costo: fase.costo,
      queHace: fase.queHace ?? fase.modulo,
      corre: fase.enElPorton && fase.porQue === undefined,
      ...(fase.porQue ? { porQue: fase.porQue } : {}),
    });
  }

  return { filas, avisos: externas.avisos };
}

/** El catálogo dicho para una terminal, con la forma de `dolphin motores`. */
export function lineasDeFases(filas: readonly FilaDeFase[], avisos: readonly string[] = []): string[] {
  const lineas: string[] = ["", "  dolphin fases · lo que cruza una rama en este repo"];
  const grupos: readonly { de: DeDonde; titulo: string }[] = [
    { de: "dolphin", titulo: "de Dolphin" },
    { de: "repo", titulo: "del repo" },
    { de: "modulo", titulo: "de un módulo (código de terceros)" },
  ];

  for (const grupo of grupos) {
    const delGrupo = filas.filter((f) => f.de === grupo.de);
    if (delGrupo.length === 0) continue;
    lineas.push("", `  ${grupo.titulo}:`);
    const ancho = Math.max(...delGrupo.map((f) => f.nombre.length));
    for (const fila of delGrupo) {
      lineas.push(`  ${fila.corre ? "✓" : "·"} ${fila.nombre.padEnd(ancho)}  ${fila.costo.padEnd(7)} ${fila.queHace}${fila.porQue ? ` · ${fila.porQue}` : ""}`);
    }
  }

  if (filas.length === 0) lineas.push("", "  No encontré ninguna fase: ni scripts de npm, ni comandos, ni módulos.");

  for (const aviso of avisos) lineas.push("", `  ! ${aviso}`);

  lineas.push(
    "",
    "  ✓ corre en este repo · · existe y hoy no corre (al lado dice por qué)",
    "  de los scripts de npm corre lo que pidas con --verificar",
    "  una fase propia se escribe y se comparte como un módulo: ver docs/fases.md",
    "",
  );
  return lineas;
}
