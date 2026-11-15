import { correrConPrompt, prepararComando, SilencioDelAgente, TopeDelAgente } from "./ejecutar.js";
import { oyenteDeClaude } from "../nucleo/voces.js";
import { conCuentaDeClaude, esLimiteDeUso } from "../nucleo/cuentas.js";
import { pidioConfig, restaurarConfigEjecutable, SOLO_CONFIG_DEL_USUARIO } from "../nucleo/config-ejecutable.js";
import { mismoModelo } from "../nucleo/router.js";
import { medirForma } from "../nucleo/forma.js";
import { FalloDelAgente } from "../nucleo/tipos.js";
import { objetosJson } from "../nucleo/json.js";
import type { Agente, Universo } from "../nucleo/tipos.js";
import { armarPrompt, leerContrato, PEDIDO_AL_SEGUIR, pedidoAlRetomar, pedidoDeCorreccion } from "./pedidos.js";

// Los usan los otros motores y los tests: siguen saliendo de acá.
export { armarPrompt, leerContrato, PEDIDO_AL_SEGUIR, pedidoAlRetomar, pedidoDeCorreccion } from "./pedidos.js";

/**
 * El agente de verdad: el CLI de Claude Code en modo headless, corriendo
 * con el cwd apuntado al worktree del universo.
 *
 * Por qué el CLI y no la API: ya está autenticado con la suscripción, trae
 * las herramientas de archivos y shell resueltas, y respeta el CLAUDE.md
 * del repo que está tocando. Enchufar otro motor —codex, gemini— es
 * escribir otra función de 20 líneas; el núcleo no se entera.
 *
 * El aislamiento no lo da el permiso sino el worktree: lo que el agente
 * escriba vive en una carpeta descartable, y si no cruza el portón se
 * borra sin haber tocado el repo de verdad.
 */

export interface OpcionesClaude {
  /** Alias o nombre completo. El barato para sembrar, el caro para decidir. */
  readonly modelo?: string;
  /** Con qué modelo se corrige lo que el portón rebotó. Por defecto, el mismo que escribió. */
  readonly modeloCorrector?: string;
  /** Milisegundos antes de darlo por colgado. */
  readonly tope?: number;
  /** Milisegundos sin salida antes de matar y retomar la sesión. */
  readonly silencio?: number;
  /** Espera entre retomas; se inyecta para que los tests no duerman. */
  readonly esperar?: (ms: number) => Promise<void>;
  /** Cuántas vueltas de herramientas puede dar antes de rendirse. */
  readonly vueltas?: number;
  /** Se le pega a la tarea: el contrato de superficie, el estilo del repo, lo que haga falta. */
  readonly contexto?: string;
  /** «editar» acepta cambios de archivos y nada más; «todo» corre sin pedir
   *  permiso —tests, builds— y es lo que usa lo que corre solo: siempre en
   *  un worktree y con los comandos de la política prohibidos. */
  readonly permisos?: "editar" | "todo";
  /** Comandos que el agente no puede correr, en el formato de Claude Code. */
  readonly prohibidos?: readonly string[];
  /** Herramientas explícitas para un bot que puede editar dentro de su carpeta. */
  readonly herramientas?: readonly string[];
  /** Permisos extra sin esconder las herramientas normales del agente. */
  readonly herramientasAdicionales?: readonly string[];
  /** El repo o la tarea son de afuera: no se carga su configuración (hooks, MCP), solo la del usuario. */
  readonly soloConfigDelUsuario?: boolean;
  readonly cmd?: string;
}

/** Lo que deja una corrida: la salida leída, lo de esta vuelta y quién corrió. */
interface Corrida {
  readonly leido: SalidaDeClaude;
  readonly gastado: number;
  readonly modelo?: string;
  /** Salió bien pero sin `total_cost_usd`: el costo no se sabe, no es cero. */
  readonly sinCosto?: boolean;
}

interface SalidaDeClaude {
  readonly result?: string;
  readonly is_error?: boolean;
  readonly total_cost_usd?: number;
  readonly num_turns?: number;
  readonly session_id?: string;
  /** «success», o el motivo de un error: «error_max_turns», «error_during_execution». */
  readonly subtype?: string;
  readonly errors?: readonly unknown[];
}

/**
 * Por qué falló una corrida, en palabras: el `result`, o el `subtype` y los
 * `errors` que el CLI deja cuando no hay `result` (quedarse sin vueltas, por
 * ejemplo). Sin esto, un `error_max_turns` se informaba «sin explicación».
 */
export function mensajeDeError(leido: SalidaDeClaude): string {
  if (typeof leido.result === "string" && leido.result.trim() !== "") return recortar(leido.result);
  const errores = (leido.errors ?? []).map((e) => (typeof e === "string" ? e : JSON.stringify(e))).filter(Boolean);
  if (leido.subtype === "error_max_turns") return `se quedó sin vueltas antes de terminar (error_max_turns)${errores.length > 0 ? `: ${recortar(errores.join("; "))}` : ""}`;
  if (errores.length > 0) return recortar(errores.join("; "));
  return leido.subtype && leido.subtype !== "success" ? `el agente terminó con «${leido.subtype}»` : "el agente devolvió un error sin explicación";
}

/**
 * La sesión del CLI en la que escribió cada worktree. La corrección la
 * retoma (`--resume`) en vez de arrancar de cero: el agente ya leyó el repo
 * y sabe qué cambió, así que no lo vuelve a explorar.
 *
 * Dos cosas medidas el 22/10 deciden cómo se usa:
 * - en una sesión retomada, `total_cost_usd` es el ACUMULADO de la sesión
 *   (0,00905 = 0,00506 de la primera vuelta + 0,00399 de la segunda): lo de
 *   esta vuelta es la diferencia. Tomarlo tal cual cuenta dos veces la escritura;
 * - el caché del CLI dura una hora y es por modelo: con el mismo modelo la
 *   charla vuelve leída del caché; con otro se reenvía entera sin él, y eso
 *   puede salir más caro que empezar de cero. Se retoma solo si corrige el
 *   mismo modelo que escribió.
 */
interface Sesion {
  readonly id: string;
  readonly modelo?: string;
  /** Lo pagado hasta acá en la sesión: el `total_cost_usd` de su última vuelta. */
  readonly acumulado: number;
}

/** Mismo modelo, o los dos el de la cuenta: solo así la charla vuelve del caché. */
function mismoOPorDefecto(a?: string, b?: string): boolean {
  return a === undefined || b === undefined ? a === b : mismoModelo(a, b);
}

export function agenteClaude(opciones: OpcionesClaude = {}): Agente {
  const pedido = opciones.cmd ?? "claude";
  // Por worktree: cada rama tiene la suya, y corren a la vez.
  const sesiones = new Map<string, Sesion>();
  const anotarSesion = (universo: Universo, leido: SalidaDeClaude, modelo?: string) => {
    if (leido.session_id) {
      sesiones.set(universo.ruta, { id: leido.session_id, ...(modelo ? { modelo } : {}), acumulado: leido.total_cost_usd ?? 0 });
    }
  };

  return {
    nombre: opciones.modelo ? `claude ${opciones.modelo}` : "claude",

    async trabajar(universo: Universo, tarea: string, enfoque?: { nombre: string; instruccion: string; modelo?: string }, senal?: AbortSignal) {
      const prompt = armarPrompt(tarea, opciones.contexto, enfoque?.instruccion);
      const { leido, gastado, modelo, sinCosto } = await correrClaude(prompt, universo, enfoque?.modelo ?? opciones.modelo, undefined, senal);
      anotarSesion(universo, leido, modelo);

      const forma = await medirForma(universo.ruta);

      // Un agente que no tocó un solo archivo no "trabajó": contestó. Si
      // esto pasara en silencio, el universo cruzaría el portón intacto y
      // ganaría por ser el más simple de todos. Sería el peor bug posible.
      if (forma.archivos === 0) {
        throw new FalloDelAgente("no tocó ningún archivo: contestó en vez de trabajar", gastado, sinCosto === true);
      }

      const contrato = leerContrato(leido.result ?? "");

      return {
        forma,
        gastado,
        ...(contrato ? { contrato } : {}),
        ...(modelo ? { modelo } : {}),
        ...(sinCosto ? { costoDesconocido: true } : {}),
      };
    },

    async corregir(universo, tarea, falla, enfoque) {
      // Lo que el agente escribió en la configuración que se ejecuta sola se deshace antes de
      // volver a correr: si no, sus hooks correrían en esta vuelta, por encima de la política.
      // Salvo que la tarea sea justamente esa configuración: ahí deshacerlo es borrarle el trabajo.
      const deshecho = pidioConfig(tarea) ? [] : await restaurarConfigEjecutable(universo.ruta);
      // Corrige el modelo del corrector si hay uno; si no, el que escribió esta rama.
      const modelo = opciones.modeloCorrector ?? enfoque?.modelo ?? opciones.modelo;
      const previa = sesiones.get(universo.ruta);
      const retomar = previa && mismoOPorDefecto(previa.modelo, modelo) ? previa : undefined;

      let corrida: Corrida | undefined;
      if (retomar) {
        try {
          corrida = await correrClaude(pedidoAlRetomar(falla, deshecho), universo, modelo, retomar);
        } catch (error) {
          // Solo si lo que falló es retomar —la sesión ya no está— se corrige de cero. Una
          // salida que no se pudo leer también llega sin gastar, y repetirla era pagar dos veces.
          const sinSesion = error instanceof FalloDelAgente && error.gastado === 0 && /no conversation found|session (?:not found|.*(?:expired|no longer))|could not (?:find|resume) (?:the )?session/i.test(error.message);
          if (!sinSesion) throw error;
        }
      }
      const reanudada = corrida !== undefined;
      // De cero, el veredicto viaja entero con la tarea: el agente corrige con el
      // error a la vista, en el MISMO worktree donde ya está su trabajo.
      corrida ??= await correrClaude(pedidoDeCorreccion(tarea, falla, deshecho), universo, modelo);
      anotarSesion(universo, corrida.leido, corrida.modelo);

      const forma = await medirForma(universo.ruta);
      // Una «corrección» que deshizo todo no corrigió: con cero archivos los tests
      // vuelven a verde y la rama ganaba por ser la más simple, sin nada que entregar.
      if (forma.archivos === 0) {
        throw new FalloDelAgente("la corrección deshizo todo: no quedó ningún cambio", corrida.gastado, corrida.sinCosto === true);
      }
      const contrato = leerContrato(corrida.leido.result ?? "");
      return {
        forma,
        gastado: corrida.gastado,
        ...(contrato ? { contrato } : {}),
        ...(corrida.modelo ? { modelo: corrida.modelo } : {}),
        ...(reanudada ? { reanudada: true } : {}),
        ...(corrida.sinCosto ? { costoDesconocido: true } : {}),
      };
    },

    async retomar(universo, mensaje) {
      const previa = sesiones.get(universo.ruta);
      if (!previa) return undefined;
      const modelo = previa.modelo ?? opciones.modelo;
      const corrida = await correrClaude(mensaje, universo, modelo, previa);
      anotarSesion(universo, corrida.leido, corrida.modelo);
      const forma = await medirForma(universo.ruta);
      if (forma.archivos === 0) throw new FalloDelAgente("la retoma no dejó cambios", corrida.gastado, corrida.sinCosto === true);
      const contrato = leerContrato(corrida.leido.result ?? "");
      return {
        forma,
        gastado: corrida.gastado,
        ...(contrato ? { contrato } : {}),
        ...(corrida.modelo ? { modelo: corrida.modelo } : {}),
        ...(corrida.sinCosto ? { costoDesconocido: true } : {}),
      };
    },
  };

  /**
   * Una corrida del CLI: la comparten escribir y corregir. Con `sesion`, la
   * retoma, y lo gastado es lo de esta vuelta, no el acumulado de la sesión.
   */
  async function correrClaude(prompt: string, universo: Universo, modelo?: string, sesion?: Sesion, senal?: AbortSignal): Promise<Corrida> {
    // Con los argumentos adentro: si el CLI se instaló por npm, lo que hay en el
    // PATH es un .cmd que va por cmd.exe, y lo que se pegaba después de su línea
    // quedaba fuera de las comillas —«Bash(git push:*)» llegaba partido en dos y
    // la política no prohibía nada—.
    let sesionActual = sesion;
    let reintentosPorSilencio = 0;
    let pedidoActual = prompt;
    let leido: SalidaDeClaude;
    for (;;) {
      const listo = prepararComando(pedido, argumentosDeClaude(opciones, modelo, sesionActual?.id));
      if (!listo) {
        throw new Error(`no encontré «${pedido}» en el PATH: instalá Claude Code (claude.com/claude-code) o sumá su carpeta al PATH`);
      }

      try {
        // Con la cuenta en uso; si llegó a su límite, la misma corrida sigue con otra que tenga cupo.
        leido = await conCuentaDeClaude(
          async (deLaCuenta) => {
            const { salida, error: deError } = await correrConPrompt(
              listo.cmd,
              listo.args,
              pedidoActual,
              universo.ruta,
              opciones.tope ?? 600_000,
              { ...universo.entorno, ...deLaCuenta },
              listo.verbatim,
              oyenteDeClaude(universo.ruta),
              senal,
              opciones.silencio ?? 10 * 60_000,
            );
            const leidoCrudo = leerSalida(salida);
            // Sin la línea del resultado, el motivo está en stderr (con stream-json, stdout nunca viene vacío).
            return leidoCrudo.is_error && leidoCrudo.total_cost_usd === undefined && deError?.trim() ? { ...leidoCrudo, result: deError.trim().slice(0, 400) } : leidoCrudo;
          },
          (x) => x.is_error === true && esLimiteDeUso(mensajeDeError(x)),
        );
        break;
      } catch (error) {
        // Se lo cortó el tope, pero el turno YA había terminado: el CLI escribió su línea de
        // resultado y se quedó vivo por algo que la tarea dejó de fondo (un `pnpm dev` que no
        // termina mantiene sus pipes abiertos y el proceso no sale nunca). El trabajo está hecho
        // y el costo informado: tirarlo era decirle a la persona «no salió» después de que el
        // agente le había contestado. Pasó con «prendeme la app»: 11 minutos de nada y un «no
        // salió» por una app que estaba corriendo.
        if (error instanceof TopeDelAgente) {
          const yaTermino = resultadoDelStream(error.salidaParcial);
          if (yaTermino && yaTermino.is_error !== true) {
            leido = yaTermino;
            break;
          }
          throw error;
        }
        if (!(error instanceof SilencioDelAgente) || reintentosPorSilencio >= 2) throw error;
        const id = sesionActual?.id ?? sesionIdDe(error.salidaParcial);
        if (!id) throw new Error(`${error.message}; Claude no dejó una sesión para retomar`);
        reintentosPorSilencio += 1;
        sesionActual = { id, ...(modelo ? { modelo } : {}), acumulado: sesionActual?.acumulado ?? 0 };
        // Si alcanzó a contestar, el pedido ya está en la sesión: mandarlo entero otra vez lo hacía
        // arrancar de nuevo sobre su propio trabajo. Si no contestó nada, puede no haberlo recibido.
        if (/"type"\s*:\s*"assistant"/.test(error.salidaParcial)) pedidoActual = PEDIDO_AL_SEGUIR;
        const espera = Math.min(10_000 * 2 ** (reintentosPorSilencio - 1), 5 * 60_000);
        await (opciones.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(espera);
      }
    }
    // Si el CLI devolviera otra sesión (una copia), su costo ya es solo suyo: no hay nada que restar.
    const yaPagado = sesionActual && (leido.session_id === undefined || leido.session_id === sesionActual.id) ? sesionActual.acumulado : 0;
    const gastado = redondear(Math.max(0, (leido.total_cost_usd ?? 0) - yaPagado));

    if (leido.is_error) {
      // Sin costo informado no es gratis: no se sabe cuánto gastó.
      throw new FalloDelAgente(mensajeDeError(leido), gastado, leido.total_cost_usd === undefined);
    }

    // Con --output-format json el CLI siempre dice cuánto costó; si un día deja de decirlo, no es gratis.
    return { leido, gastado, ...(modelo ? { modelo } : {}), ...(leido.total_cost_usd === undefined ? { sinCosto: true } : {}) };
  }
}

/** El stream puede haber alcanzado a anunciar la sesión antes de quedar mudo. */
function sesionIdDe(salida: string): string | undefined {
  const encontrado = /"session_id"\s*:\s*"([^"]+)"/.exec(salida);
  return encontrado?.[1];
}

/**
 * La línea `{"type":"result"}` del stream, si ya está. Es la prueba de que el turno TERMINÓ, que no
 * es lo mismo que que el proceso haya salido: el CLI puede quedar vivo por algo que la tarea dejó
 * de fondo. Sin esta línea no hay resultado, y lo que haya en la salida es un turno a medias.
 */
export function resultadoDelStream(crudo: string): SalidaDeClaude | undefined {
  const lineas = crudo.trim().split("\n");
  if (lineas.length <= 1) return undefined;
  for (let i = lineas.length - 1; i >= 0; i--) {
    try {
      const dato = JSON.parse(lineas[i]!) as SalidaDeClaude & { type?: string };
      if (dato && dato.type === "result") return dato;
    } catch {
      // una línea que no es JSON (un aviso del CLI): se sigue buscando
    }
  }
  return undefined;
}

export function leerSalida(crudo: string): SalidaDeClaude {
  const texto = crudo.trim();
  if (texto === "") return { is_error: true, result: "el agente no devolvió nada" };

  // Con stream-json son muchas líneas y el resultado es la de tipo «result», casi siempre la última.
  const delStream = resultadoDelStream(texto);
  if (delStream) return delStream;

  try {
    return JSON.parse(texto) as SalidaDeClaude;
  } catch {
    // Con --output-format json no debería pasar, pero si el CLI escupe
    // texto suelto (una actualización, un aviso), se busca el último objeto
    // que parezca su resultado. Desde la última «{» no servía: la salida trae
    // objetos anidados y esa llave es la de adentro.
    const resultado = objetosJson(texto).find(
      (o): o is SalidaDeClaude => typeof o === "object" && o !== null && ("result" in o || "is_error" in o || "total_cost_usd" in o),
    );
    return resultado ?? { is_error: true, result: recortar(texto) };
  }
}

function recortar(texto: string, largo = 200): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}

function redondear(dolares: number): number {
  return Math.round(dolares * 1_000_000) / 1_000_000;
}

/** Los argumentos de escribir y corregir. El prompt va por stdin, no como argumento: ver src/agentes/ejecutar.ts */
export function argumentosDeClaude(opciones: OpcionesClaude, modelo?: string, sesion?: string): string[] {
  // stream-json (con --verbose, que el CLI exige para eso): cada paso sale apenas pasa y es la
  // terminal en vivo de la sesión; el resultado con el costo sigue siendo la última línea.
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", opciones.permisos === "todo" ? "bypassPermissions" : "acceptEdits"];
  if (modelo) args.push("--model", modelo);
  if (opciones.vueltas) args.push("--max-turns", String(opciones.vueltas));
  if (sesion) args.push("--resume", sesion);
  if (opciones.soloConfigDelUsuario) args.push(...SOLO_CONFIG_DEL_USUARIO);
  const permitidas = [...(opciones.herramientas ?? []), ...(opciones.herramientasAdicionales ?? [])];
  if (permitidas.length) args.push("--allowedTools", permitidas.join(","));
  if (opciones.herramientas?.length) args.push("--tools", opciones.herramientas.join(","));
  // Va al final: --disallowedTools se lleva todos los argumentos que le siguen.
  if (opciones.prohibidos && opciones.prohibidos.length > 0) args.push("--disallowedTools", ...conPowerShell(opciones.prohibidos));
  return args;
}

/**
 * Cada `Bash(…)` prohibido, también como `PowerShell(…)`: en Windows Claude
 * Code tiene su propia herramienta de PowerShell con sus propias reglas, y
 * con `bypassPermissions` un `git push` por PowerShell no lo frenaba nada.
 */
export function conPowerShell(prohibidos: readonly string[]): string[] {
  return [...new Set(prohibidos.flatMap((p) => {
    const comando = /^Bash\((.*)\)$/.exec(p)?.[1];
    return comando === undefined ? [p] : [p, `PowerShell(${comando})`];
  }))];
}
