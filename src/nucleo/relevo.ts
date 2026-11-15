import { medirForma } from "./forma.js";
import { armarTraspaso, type LoQuePaso } from "./traspaso.js";
import { FalloDelAgente } from "./tipos.js";
import type { Agente, Falla, Trabajo, Universo } from "./tipos.js";

/**
 * Cambiar de motor a mitad de tarea, en el mismo worktree.
 *
 * El caso: la rama arrancó con Claude, a los veinte minutos se terminó el cupo de las 5 h y la
 * rama queda a medio escribir. Hoy eso es una rama perdida: el worktree tiene trabajo adentro y
 * nadie lo sigue. Con el relevo entra otro motor **en el mismo worktree**, lee el traspaso de lo
 * que ya se hizo (ver traspaso.ts) y sigue desde ahí.
 *
 * Tres reglas que definen qué es este archivo:
 *
 * 1. **Nunca se rota entre cuentas del mismo proveedor.** Dos cuentas de Claude son dos cuentas
 *    de Anthropic, y usar la segunda cuando la primera se agotó es esquivar el límite que la
 *    empresa puso: choca con sus términos. El relevo es a OTRO proveedor, y la cadena se valida
 *    al armarla —no a mitad de una tarea, cuando ya es tarde—. Lo que sí existe y es legítimo es
 *    `cuentas.ts`: elegir con qué cuenta trabajar antes de empezar, porque la persona tiene dos.
 *
 * 2. **Sólo se releva a un motor que NO PUDO trabajar**, no a uno que trabajó mal. Un motor que
 *    escribió algo y rebotó en una fase es el caso del bucle de corrección del portón, que ya
 *    existe; pagarle a un segundo motor por el mismo error multiplica el gasto de la tarea por la
 *    cantidad de motores de la cadena. Qué cuenta como «no pudo» lo decide `esNoDisponible`.
 *
 * 3. **Lo que gastó el que se cayó se paga igual.** Es el mismo principio que `FalloDelAgente`:
 *    perder ese número informa de menos y hace pasar por gratis lo que costó plata.
 *
 * El relevo de antes de arrancar ya existía en `prepararSiembra` (si Claude no tiene cupo, la
 * siembra arranca con Codex). Esto es el otro: el que pasa cuando ya hay worktrees abiertos.
 */

/**
 * Con quién tiene la cuenta la persona, que es quien le pone el límite.
 *
 * Es lo que decide si dos motores pueden estar en la misma cadena. Va por el proveedor de la
 * SUSCRIPCIÓN y no por el modelo que corre abajo: Copilot sirve modelos de varias empresas, pero
 * el cupo que se agota es el de GitHub.
 */
const PROVEEDOR_DE_MOTOR: Readonly<Record<string, string>> = {
  claude: "anthropic",
  codex: "openai",
  gemini: "google",
  antigravity: "google",
  qwen: "alibaba",
  copilot: "github",
  cursor: "cursor",
  droid: "factory",
  amp: "sourcegraph",
};

/**
 * `undefined` cuando no lo sabemos: `opencode` y `acp` corren con la clave que la persona puso,
 * así que el proveedor depende de su configuración y no del motor. Decir «propio» y compararlo
 * sería inventar: dos motores que no sabemos de quién son no se pueden declarar distintos.
 */
export function proveedorDeMotor(nombre: string): string | undefined {
  return PROVEEDOR_DE_MOTOR[nombre.split(" ")[0] ?? nombre];
}

/**
 * Lo que dicen los motores cuando no pueden trabajar, medido en sus salidas.
 *
 * Son dos familias: el cupo o la cuota (el motor existe, funciona, y hoy no te atiende) y la
 * puerta cerrada (no está instalado, falta la clave, la sesión venció). Las dos se relevan; un
 * test en rojo o un archivo mal escrito, no.
 */
const NO_DISPONIBLE: readonly RegExp[] = [
  // Cupo, cuota y límite de velocidad, en los idiomas en que llegan.
  /\b(?:usage|rate)\s+limit/i,
  /\blímite de (?:uso|velocidad)/i,
  /\bl[ií]mite\b.*\b(?:5\s*h|semana|diario)/i,
  /\bquota\b/i,
  /\bcupo\b/i,
  /\bout of (?:credit|credits|tokens)\b/i,
  /\bsin (?:cr[ée]ditos|saldo)\b/i,
  /\binsufficient_quota\b/i,
  /\b(?:429|503|529)\b/,
  // Sin `\b` al final: el de Anthropic llega como `overloaded_error` y el guion bajo cuenta
  // como letra, así que `\boverloaded\b` no lo agarraba.
  /\boverloaded/i,
  /\bservice unavailable\b/i,
  /\btemporarily unavailable\b/i,
  // Puerta cerrada: no hay con qué entrar.
  /\b(?:401|403)\b/,
  /\bunauthorized\b/i,
  /\bauthentication (?:failed|required|error)\b/i,
  /\binvalid(?:\s+|_)api(?:\s+|_)key\b/i,
  /\byou must specify the [A-Z_]*API_KEY\b/i,
  /\b[A-Z][A-Z0-9_]*API_KEY\b.*\b(?:falta|missing|not set|required|specify)\b/i,
  /\b(?:falta|missing|not set)\b.*\b[A-Z][A-Z0-9_]*API_KEY\b/i,
  /\bsesi[óo]n (?:vencida|expirada)\b/i,
  /\bsession (?:expired|has expired)\b/i,
  /\b(?:not logged in|please log in|login required|run `?\w+ login)/i,
  /no encontré «[^»]+» en el PATH/i,
  /\bcommand not found\b/i,
  /\bENOENT\b/,
];

/**
 * ¿Este motivo dice «no pude trabajar» y no «trabajé mal»?
 *
 * Ante la duda contesta que no, y esa asimetría es a propósito: equivocarse para este lado cuesta
 * una rama que se corta como hoy, y para el otro cuesta pagarle a todos los motores de la cadena
 * por el mismo error.
 */
export function esNoDisponible(motivo: string): boolean {
  return NO_DISPONIBLE.some((patron) => patron.test(motivo));
}

export interface MotorDeLaCadena {
  readonly agente: Agente;
  /**
   * Con quién tiene la cuenta. Si se omite, sale de `proveedorDeMotor(agente.nombre)`; pasarlo a
   * mano sirve para un `opencode` o un `acp` que la persona sabe contra qué apunta.
   */
  readonly proveedor?: string;
}

export interface OpcionesDeRelevo {
  /**
   * Si este motor puede trabajar ahora, preguntado ANTES de pagarle un intento. En producción es
   * `antesDeArrancar` de cupo.ts, que lee el plan de uso. Sin esto se le paga el intento a un
   * motor que ya sabíamos agotado.
   */
  readonly disponible?: (motor: string) => Promise<boolean> | boolean;
  /** Los archivos que la rama ya tiene tocados. Por defecto los mide git en el worktree. */
  readonly tocados?: (universo: Universo) => Promise<readonly string[]>;
  /** Para avisar a la consola y al parte que la rama cambió de manos. */
  readonly alRelevar?: (evento: { universo: Universo; salio: string; entra: string; porQue: string }) => void;
}

/** Lo que pasó con un motor de la cadena, para armar el motivo del corte si no queda ninguno. */
interface Intento {
  readonly motor: string;
  readonly porQue: string;
}

async function archivosDe(universo: Universo, opciones: OpcionesDeRelevo): Promise<readonly string[]> {
  if (opciones.tocados) return opciones.tocados(universo).catch(() => []);
  // Sin git (o sin cambios todavía) la lista queda vacía: el traspaso igual sirve.
  return medirForma(universo.ruta)
    .then((forma) => (forma.tocados ?? []).map((t) => t.ruta))
    .catch(() => []);
}

/**
 * Valida una cadena por los NOMBRES de sus motores, sin construir ninguno.
 *
 * Así la línea de comandos puede rechazar `--agente claude --relevo claude` antes de preparar
 * nada: una cadena mal armada descubierta a mitad de una siembra ya costó worktrees y plata. El
 * motivo va escrito para entenderse sin leer este archivo.
 */
export function revisarNombres(cadena: readonly { readonly nombre: string; readonly proveedor?: string }[]): void {
  if (cadena.length === 0) throw new Error("una cadena de relevo necesita al menos un motor");
  const vistos = new Set<string>();
  const proveedores = new Map<string, string>();
  for (const { nombre, proveedor: declarado } of cadena) {
    if (vistos.has(nombre)) throw new Error(`«${nombre}» está dos veces en la cadena de relevo: relevarse a sí mismo no arregla que no esté disponible`);
    vistos.add(nombre);
    const proveedor = declarado ?? proveedorDeMotor(nombre);
    if (proveedor === undefined) continue;
    const yaEsta = proveedores.get(proveedor);
    if (yaEsta) {
      throw new Error(
        `«${yaEsta}» y «${nombre}» son los dos de ${proveedor}: el relevo no rota entre cuentas del mismo proveedor, porque usar la segunda cuando la primera se agotó esquiva su límite. Elegí un motor de otra empresa (para elegir entre tus cuentas, antes de empezar, está «dolphin cuenta»)`,
      );
    }
    proveedores.set(proveedor, nombre);
  }
}

/** Lo mismo, sobre una cadena ya armada. */
export function revisarCadena(cadena: readonly MotorDeLaCadena[]): void {
  revisarNombres(cadena.map((e) => ({ nombre: e.agente.nombre, ...(e.proveedor ? { proveedor: e.proveedor } : {}) })));
}

/**
 * Un agente que, cuando el titular no puede trabajar, le pasa la rama al siguiente de la cadena
 * con el traspaso de lo que ya se hizo.
 */
export function conRelevo(cadena: readonly MotorDeLaCadena[], opciones: OpcionesDeRelevo = {}): Agente {
  revisarCadena(cadena);
  const titular = cadena[0]!.agente;

  /**
   * Corre la cadena en orden. `pedir` recibe el agente y la tarea que le toca —la original para
   * el titular, el traspaso para el que entra— y hace el trabajo.
   */
  async function enCadena(
    universo: Universo,
    base: Omit<LoQuePaso, "motorAnterior" | "seFue" | "archivos">,
    pedir: (agente: Agente, tarea: string) => Promise<Trabajo>,
  ): Promise<Trabajo> {
    const intentos: Intento[] = [];
    let gastado = 0;
    let costoDesconocido = false;
    let tarea = base.tarea;

    for (const [indice, eslabon] of cadena.entries()) {
      const nombre = eslabon.agente.nombre;
      const anterior = intentos.at(-1);

      if (opciones.disponible && !(await opciones.disponible(nombre))) {
        intentos.push({ motor: nombre, porQue: "no estaba disponible para arrancar" });
        continue;
      }

      if (anterior) {
        // El traspaso se arma acá y no antes: recién ahora se sabe quién se fue y por qué, y los
        // archivos se miden sobre el worktree como lo dejó, que es lo que el que entra va a ver.
        const traspaso = armarTraspaso({
          ...base,
          motorAnterior: anterior.motor,
          seFue: anterior.porQue,
          archivos: await archivosDe(universo, opciones),
        });
        tarea = traspaso.texto;
        opciones.alRelevar?.({ universo, salio: anterior.motor, entra: nombre, porQue: anterior.porQue });
      }

      try {
        const trabajo = await pedir(eslabon.agente, tarea);
        // Lo que gastaron los que se cayeron antes va en el total: la rama costó eso.
        return {
          ...trabajo,
          gastado: trabajo.gastado + gastado,
          ...(costoDesconocido || trabajo.costoDesconocido ? { costoDesconocido: true } : {}),
          ...(indice > 0 ? { relevo: { salio: intentos.map((i) => i.motor), entro: nombre } } : {}),
        };
      } catch (error) {
        const porQue = error instanceof Error ? error.message : String(error);
        if (error instanceof FalloDelAgente) {
          gastado += error.gastado;
          if (error.costoDesconocido) costoDesconocido = true;
        }
        // Trabajó y le salió mal: eso no se releva (ver la regla 2 del encabezado). El fallo sube
        // con lo que gastaron los anteriores, que ya no se puede perder.
        if (!esNoDisponible(porQue)) {
          throw new FalloDelAgente(
            intentos.length > 0 ? `${nombre}: ${porQue} (antes: ${intentos.map((i) => `${i.motor}, ${i.porQue}`).join("; ")})` : porQue,
            gastado,
            costoDesconocido,
          );
        }
        intentos.push({ motor: nombre, porQue });
      }
    }

    throw new FalloDelAgente(
      `ningún motor de la cadena pudo trabajar: ${intentos.map((i) => `${i.motor} (${i.porQue})`).join("; ")}`,
      gastado,
      costoDesconocido,
    );
  }

  return {
    nombre: titular.nombre,
    async trabajar(universo, tarea, enfoque, senal) {
      return enCadena(universo, { tarea, rama: universo.rama }, (agente, pedido) => agente.trabajar(universo, pedido, enfoque, senal));
    },
    async corregir(universo, tarea, falla: Falla, enfoque) {
      return enCadena(universo, { tarea, rama: universo.rama, falla }, (agente, pedido) =>
        // El que entra puede no saber corregir (es opcional en la interfaz). No se pierde el
        // relevo por eso: el traspaso ya lleva adentro por qué rebotó, así que `trabajar` alcanza.
        agente.corregir ? agente.corregir(universo, pedido, falla, enfoque) : agente.trabajar(universo, pedido, enfoque),
      );
    },
    // Retomar un turno de escritura necesita la sesión del motor que lo tenía: no se releva.
    ...(titular.retomar ? { retomar: titular.retomar.bind(titular) } : {}),
  };
}
