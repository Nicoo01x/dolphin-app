import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * `dolphin.config.json`: lo que un repo le dice a Dolphin, versionado con el
 * código. Un solo lector para todos los comandos, así ninguno se queda con
 * una copia vieja de cómo se lee.
 */

export interface ConfigDeDolphin {
  /** Milisegundos sin salida de un agente antes de retomar su sesión. */
  readonly silencio?: number;
  /** El agente corre con una suscripción ya pagada: no se muestra plata en ningún lado. */
  readonly suscripcion?: boolean;
  /** Lo que corre solo: archivos y comandos prohibidos (ver politica.ts). */
  readonly politica?: {
    readonly archivosProhibidos?: readonly string[];
    readonly comandosProhibidos?: readonly string[];
  };
  /** Máquinas donde un turno puede correr por SSH (ver ssh.ts). */
  readonly hosts?: Readonly<Record<string, { readonly destino: string; readonly repo: string; readonly dolphin: string }>>;
  /** Quién escribe, quién corrige y quién revisa (ver router.ts). */
  readonly modelos?: import("./router.js").ConfigDeModelos;
  /**
   * Si una rama cambia tests que ya existían: «avisar» (la consola la marca),
   * «aprobar» (mergearla o abrirle un PR pide tu aprobación) o «cortar».
   */
  readonly testsExistentes?: "avisar" | "aprobar" | "cortar";
  /** La fase de seguridad (claves en el front, tablas sin RLS, endpoints sin autenticar): `false` la apaga. */
  readonly seguridad?: boolean;
  /** La fase de pantalla: cómo se levanta la app de cada rama (ver escalon-pantalla.ts). */
  readonly pantalla?: import("../tester/escalon-pantalla.js").ConfigDePantalla;
  /** El explorador: textos que nunca toca, además de los de siempre. */
  readonly explorar?: {
    readonly noTocar?: readonly string[];
  };
  /**
   * Con qué comando se lanza el agente que habla ACP (ver agentes/acp.ts). Es lo único que hace
   * falta para sumar un motor que hable el protocolo: después, `--agente acp`.
   *
   * ```json
   * { "acp": { "cmd": "gemini", "args": ["--experimental-acp"] } }
   * ```
   */
  readonly acp?: { readonly cmd: string; readonly args?: readonly string[] };
  /** El agente corre en una caja que solo ve su worktree (ver aislado.ts). Sin caja en la máquina, no corre. */
  readonly aislado?: boolean | import("./aislado.js").ConfigAislada;
  /** Cómo se deja listo el worktree de cada rama: dependencias, archivos y un comando (ver entorno.ts). */
  readonly entorno?: import("./entorno.js").ConfigDeEntorno;
  /** Qué fases corre Guardian sobre la rama principal, y cuántas veces repite una que se rompió (ver guardian.ts). */
  readonly guardian?: import("./guardian.js").ConfigDeGuardian;
  /**
   * Vision: la app de cada rama recorrida como alguien nuevo y juzgada por
   * otro modelo (ver tester/vision.ts). Necesita `pantalla`. Se prende a
   * mano porque tarda y paga un juez; `juez` fija su modelo y `anchos`, los
   * tamaños de pantalla.
   */
  readonly vision?: boolean | { readonly juez?: string; readonly anchos?: readonly number[] };
  /**
   * La fase `uso`: un modelo barato usa lo que la rama cambió en la app corriendo —electron o web, en un
   * perfil descartable y por depuración remota— y dice qué vio (ver tester/uso.ts y docs/porton.md). Se prende
   * con esta clave; no necesita `pantalla`.
   */
  readonly uso?: import("../tester/uso-config.js").ConfigDeUso;
  /** El tope de uso que hace pausar el autopiloto nocturno. */
  readonly autopiloto?: { readonly topeCupoPct?: number };
  /**
   * Fases del portón que no son scripts de npm (pytest, go test, cargo test…): las propone el
   * arranque (ver arranque.ts). Un repo de afuera no las corre: su configuración no se ejecuta.
   *
   * `fases` son las que escribió otra persona: un módulo del repo o un paquete instalado en él
   * que devuelve un `Verificador` (ver fases.ts y docs/fases.md). Tampoco corren de afuera.
   */
  readonly porton?: {
    /** Cuántos comandos pesados (tsc, tests, build) a la vez en toda la máquina; por defecto sale de la memoria y los núcleos (ver cola-de-verificacion.ts). */
    readonly verificacionesALaVez?: number;
    readonly comandos?: readonly import("./arranque.js").ComandoDelPorton[];
    readonly fases?: readonly import("./fases.js").FaseDeclarada[];
  };
  /** Cómo decide la app de terminal qué hacer con cada mensaje (ver tui/pensar.ts). */
  readonly terminal?: import("../tui/pensar.js").ConfigDeTerminal;
}

export async function leerConfig(repo: string): Promise<ConfigDeDolphin> {
  try {
    const datos = JSON.parse(await readFile(join(repo, "dolphin.config.json"), "utf8")) as unknown;
    return datos && typeof datos === "object" ? (datos as ConfigDeDolphin) : {};
  } catch {
    return {};
  }
}
