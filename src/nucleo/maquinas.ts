import type { Host } from "./ssh.js";
import { citarShell, destinoValido } from "./ssh.js";

/**
 * Tus máquinas: listarlas, ver cuáles contestan, abrir un túnel y correr algo allá mirándolo acá.
 *
 * Correr en otra máquina ya existía (`nucleo/ssh.ts`), pero sólo lo alcanzaba el calendario: la
 * única forma de usar tu VPS era agendar un turno. Esto le da puerta de entrada directa, que es
 * lo que pidió Nico: elegir el VPS, poner el túnel y verlo trabajar desde acá.
 *
 * Acá no se corre nada: se ARMA el comando y se decide qué significa cada salida. El que lanza
 * procesos es el CLI, y por eso todo esto se prueba sin tocar un VPS.
 *
 * Tres cosas que no se negocian, heredadas de ssh.ts y por los mismos motivos:
 * - `BatchMode=yes`: si la clave no está, falla ahora en vez de esperar una contraseña que nadie
 *   va a escribir a las 3 de la mañana.
 * - El destino se valida: uno que empieza con «-» ssh lo lee como opción, y `-oProxyCommand=…`
 *   corre lo que quiera en ESTA máquina. El dolphin.config.json que lo trae viene versionado.
 * - Lo que se manda a la otra punta va entrecomillado con `citarShell`.
 */

/** Una máquina configurada, con su nombre. */
export interface Maquina {
  readonly nombre: string;
  readonly host: Host;
}

/** Si contesta, y en cuánto. */
export interface Alcance {
  readonly nombre: string;
  readonly llega: boolean;
  readonly ms: number;
  /** La primera línea del error, cuando no llega. Es lo único accionable que hay para decir. */
  readonly porque?: string;
}

/** Lo que el CLI necesita para correr algo: un programa y sus argumentos, ya listos. */
export interface Invocacion {
  readonly programa: string;
  readonly argumentos: readonly string[];
}

export class MaquinaDesconocida extends Error {}
export class DestinoPeligroso extends Error {}

/** Las máquinas del config, ordenadas por nombre para que la lista no baile entre corridas. */
export function maquinasDe(
  hosts: Readonly<Record<string, Host>> | undefined,
): readonly Maquina[] {
  return Object.entries(hosts ?? {})
    .map(([nombre, host]) => ({ nombre, host }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** La máquina que se pidió, o un error que nombra las que sí existen. */
export function maquinaLlamada(
  nombre: string,
  hosts: Readonly<Record<string, Host>> | undefined,
): Maquina {
  const todas = maquinasDe(hosts);
  const cual = todas.find((m) => m.nombre === nombre);
  if (!cual) {
    const lista = todas.length > 0 ? todas.map((m) => m.nombre).join(", ") : "ninguna";
    throw new MaquinaDesconocida(
      `no tengo una máquina llamada «${nombre}». Configuradas: ${lista}. Se agregan en dolphin.config.json, en "hosts".`,
    );
  }
  revisarDestino(cual);
  return cual;
}

function revisarDestino(maquina: Maquina): void {
  if (!destinoValido(maquina.host.destino)) {
    throw new DestinoPeligroso(
      `el destino de «${maquina.nombre}» no es un destino de ssh: «${maquina.host.destino}». Tiene que ser usuario@maquina o un alias, y no puede empezar con «-».`,
    );
  }
}

/** Las opciones comunes: nunca preguntar nada, y no colgarse esperando una máquina apagada. */
function opcionesBase(segundosDeEspera: number): readonly string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.round(segundosDeEspera))}`,
  ];
}

/** «¿Estás ahí?»: lo más barato que se le puede preguntar a una máquina. */
export function comandoDeAlcance(maquina: Maquina, segundosDeEspera = 5): Invocacion {
  revisarDestino(maquina);
  return {
    programa: "ssh",
    argumentos: [...opcionesBase(segundosDeEspera), maquina.host.destino, "true"],
  };
}

/**
 * El túnel: lo que corre allá se abre en `localhost` de acá.
 *
 * `-N` porque un túnel no corre ningún comando, y sin eso ssh abre una shell que queda viva sin
 * que nadie la mire. `ExitOnForwardFailure` es lo que convierte «el puerto ya estaba ocupado» en
 * un error en vez de un túnel que parece abierto y no reenvía nada — que es la forma más cara de
 * perder una hora.
 *
 * `ServerAliveInterval` existe porque la gracia del túnel es dejarlo puesto: sin eso, un NAT
 * silencioso lo corta a los pocos minutos y la pantalla local se queda congelada sin avisar.
 */
export function comandoDeTunel(
  maquina: Maquina,
  puertos: { readonly local: number; readonly remoto?: number },
): Invocacion {
  revisarDestino(maquina);
  const local = revisarPuerto(puertos.local, "local");
  const remoto = revisarPuerto(puertos.remoto ?? puertos.local, "remoto");
  return {
    programa: "ssh",
    argumentos: [
      ...opcionesBase(10),
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-L",
      // 127.0.0.1 y no sólo el puerto: sin la dirección, ssh escucha según GatewayPorts y el
      // túnel puede quedar expuesto a toda la red local.
      `127.0.0.1:${local}:127.0.0.1:${remoto}`,
      maquina.host.destino,
    ],
  };
}

function revisarPuerto(puerto: number, cual: string): number {
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new RangeError(`el puerto ${cual} tiene que ser un número de 1 a 65535, no «${puerto}»`);
  }
  return puerto;
}

/**
 * Correr algo allá y verlo acá, en vivo.
 *
 * `-t` pide una terminal del otro lado: sin eso, un agente que escribe con colores y vuelve sobre
 * la misma línea sale como un chorro de basura, y un Ctrl+C de acá no llega como señal allá.
 *
 * El `cd` va pegado con `&&` y no con `;` para que un repo que no existe falle ahí mismo en vez
 * de correr el comando en el home de la otra máquina, que es de donde salen las sorpresas.
 */
export function comandoParaCorrer(maquina: Maquina, comando: string): Invocacion {
  revisarDestino(maquina);
  if (comando.trim() === "") {
    throw new RangeError("no me dijiste qué correr allá");
  }
  const adentro = `cd ${citarShell(maquina.host.repo)} && ${comando}`;
  return {
    programa: "ssh",
    argumentos: [...opcionesBase(10), "-t", maquina.host.destino, adentro],
  };
}

/** Lo mismo, pero corriendo el dolphin de ALLÁ: es el caso de «sembrá esto en el VPS». */
export function comandoDeDolphinRemoto(
  maquina: Maquina,
  argumentos: readonly string[],
): Invocacion {
  const linea = [`${maquina.host.dolphin}/dolphin`, ...argumentos].map(citarShell).join(" ");
  return comandoParaCorrer(maquina, linea);
}

/** Cómo se lee una corrida de `comandoDeAlcance`. */
export function leerAlcance(
  nombre: string,
  salida: { readonly codigo: number | null; readonly error: string },
  ms: number,
): Alcance {
  if (salida.codigo === 0) {
    return { nombre, llega: true, ms };
  }
  const primera = salida.error.split("\n").map((l) => l.trim()).find((l) => l !== "");
  return { nombre, llega: false, ms, porque: primera ?? `ssh salió con ${salida.codigo}` };
}
