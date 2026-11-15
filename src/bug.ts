import { access, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { git, gitValor } from "./nucleo/git.js";
import { correrOraculo, porQueDelOraculo, type VeredictoDelOraculo } from "./nucleo/oraculo.js";
import type { Motor } from "./nucleo/router.js";
import type { Agente } from "./nucleo/tipos.js";
import { prepararSiembra, sembrarTarea, tallerDeLaSiembra, type PedidoDeTarea } from "./siembra.js";
import { quitarWorktree } from "./nucleo/entorno.js";

/**
 * Del bug que viste al arreglo, sin escribir un ticket. En este orden, que es lo que lo hace confiable:
 *
 *   1. un agente escribe UNA prueba que reproduce el bug, y Dolphin la corre: tiene que FALLAR hoy.
 *      Si pasa, el bug no se reprodujo y no se arregla a ciegas: se dice y se para.
 *   2. la prueba queda en un commit y el arreglo se siembra ENCIMA, con esa prueba como oráculo: no
 *      está arreglado hasta que la prueba pase (y el portón de siempre también). Hasta 3 intentos,
 *      cada uno con lo que imprimió la prueba como pista.
 *
 * Lo que viste puede venir con el elemento que señalaste con X-ray (app, ventana, rol, nombre…).
 */

export interface PedidoDeBug {
  readonly repo: string;
  readonly descripcion: string;
  /** Lo que señalaste con X-ray, en texto: va tal cual al pedido de la prueba. */
  readonly elemento?: string;
  readonly agente: Motor;
  readonly verificar?: readonly string[];
}

export type EtapaDeBug = "no-reproducido" | "arreglado" | "sin-arreglo";

export interface ResultadoDeBug {
  readonly etapa: EtapaDeBug;
  readonly porQue: string;
  /** El comando de la prueba que reproduce el bug. */
  readonly prueba?: string;
  /** Lo que imprimió la prueba antes del arreglo (fallando) y después (pasando). */
  readonly antes?: VeredictoDelOraculo;
  readonly despues?: VeredictoDelOraculo;
  readonly rama?: string;
  readonly ruta?: string;
  readonly intentos: number;
  readonly gastado: number;
}

export interface Reproduccion {
  readonly comando?: string;
  readonly ruta: string;
  readonly rama: string;
  readonly gastado: number;
  cerrar(): Promise<void>;
  /** Deja el worktree y su rama: la prueba que reproduce el bug vale aunque no se haya arreglado. */
  conservar(): Promise<void>;
}

export interface Arreglo {
  readonly rama?: string;
  readonly ruta?: string;
  readonly porQue: string;
  readonly gastado: number;
}

export interface DepsDeBug {
  /** El agente que escribe la prueba (por defecto, el del pedido). */
  readonly agente?: Agente;
  /** Siembra el arreglo encima del commit de la prueba. */
  readonly arreglar?: (pedido: PedidoDeTarea, base: string) => Promise<Arreglo>;
  readonly contar?: (texto: string) => void;
}

const ARCHIVO_DE_LA_PRUEBA = ".dolphin-prueba";
export const INTENTOS_DE_ARREGLO = 3;

export function pedidoDeReproducir(descripcion: string, elemento?: string): string {
  return [
    "Hay un bug en este proyecto. Lo que vio la persona:",
    `«${descripcion}»`,
    ...(elemento ? ["", "Lo que señaló en la pantalla:", elemento] : []),
    "",
    "Escribí UNA prueba automática que reproduzca ese bug: tiene que FALLAR hoy, justamente por el bug, y pasar cuando esté arreglado. Usá el sistema de pruebas que ya tenga el repo; si no tiene, un script de node que salga con 1 cuando el bug está y con 0 cuando no.",
    "NO arregles nada: solo la prueba.",
    `Al final, escribí en un archivo llamado ${ARCHIVO_DE_LA_PRUEBA}, en la raíz del repo, el comando que corre SOLO esa prueba (una línea, por ejemplo: npx vitest run tests/carrito.test.ts -t "cupón vencido").`,
  ].join("\n");
}

export function pedidoDeArreglo(descripcion: string, prueba: string, pista?: string): string {
  return [
    `Arreglá este bug: «${descripcion}».`,
    "",
    `Ya hay una prueba que lo reproduce y hoy falla: \`${prueba}\`. Está arreglado cuando esa prueba pasa; no la cambies ni la saltees, arreglá el código.`,
    "Arreglá la causa, no el síntoma, con el cambio más chico que la resuelva, y que lo que ya andaba siga andando.",
    ...(pista ? ["", "El intento anterior no alcanzó. Lo que imprimió la prueba:", pista] : []),
  ].join("\n");
}

/** Abre un worktree, le pide la prueba al agente, lee el comando y lo deja todo listo para correrla. */
async function reproducirDeVerdad(pedido: PedidoDeBug, agente?: Agente): Promise<Reproduccion> {
  const pedidoBase: PedidoDeTarea = { repo: pedido.repo, tarea: pedidoDeReproducir(pedido.descripcion, pedido.elemento), agente: pedido.agente, automatico: true };
  const preparada = await prepararSiembra(pedidoBase);
  const base = await gitValor(["rev-parse", "HEAD"], pedido.repo);
  const taller = await tallerDeLaSiembra(pedidoBase, preparada, base);
  const universo = await taller.abrir("bug", `dolphin-bug/${Date.now().toString(36)}`);
  const trabajo = await (agente ?? preparada.agente).trabajar(universo, pedidoBase.tarea);
  const archivo = join(universo.ruta, ARCHIVO_DE_LA_PRUEBA);
  const comando = (await readFile(archivo, "utf8").catch(() => "")).split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  await rm(archivo, { force: true });
  return { ...(comando ? { comando } : {}), ruta: universo.ruta, rama: universo.rama, gastado: trabajo.gastado, cerrar: () => taller.cerrar(universo), conservar: () => taller.soltar(universo) };
}

async function arreglarDeVerdad(pedido: PedidoDeTarea, base: string): Promise<Arreglo> {
  const preparada = await prepararSiembra(pedido);
  const { cosecha } = await sembrarTarea(pedido, preparada, { base, reintentos: 1 });
  const g = cosecha.ganador;
  return { ...(g ? { rama: cosecha.entregada?.rama ?? g.universo.rama, ruta: g.universo.ruta } : {}), porQue: cosecha.porQueGano ?? "no pasó el portón", gastado: cosecha.gastado };
}

const salidaDeComandoRoto = /(?:command not found|is not recognized as an internal or external command|no se reconoce como un comando|cannot find module|no such file or directory|no test files?(?: found)?)/i;

/** Un fallo útil: el comando existe, apunta a un archivo de prueba real y no falló por infraestructura. */
async function validarReproduccion(ruta: string, comando: string, veredicto: VeredictoDelOraculo): Promise<string | null> {
  if (veredicto.paso) return "la prueba pasa con el código de hoy: no reproduce el bug, y no lo arreglo a ciegas";
  if (salidaDeComandoRoto.test(veredicto.salida)) return "el comando de la prueba no pudo correr o no encontró el archivo de prueba";
  const referencias = [...comando.matchAll(/(?:^|[\s"'`])((?:\.{0,2}[\\/])?[\w.-]+(?:[\\/][\w.-]+)+)/g)].map((m) => m[1]!);
  const existe = await Promise.all(referencias.map(async (referencia) => access(resolve(ruta, referencia)).then(() => referencia, () => null)));
  const archivo = existe.find((x): x is string => x !== null);
  return archivo ? null : "el comando no apunta a un archivo de prueba que exista en el worktree";
}

async function cerrarArreglo(repo: string, arreglo: Arreglo): Promise<void> {
  if (arreglo.ruta) await quitarWorktree(repo, arreglo.ruta).catch(() => {});
  if (arreglo.rama) await git(["branch", "-D", arreglo.rama], repo).catch(() => {});
}

/** Cómo termina un /bug, en una respuesta. */
export function textoDelBug(r: ResultadoDeBug): string {
  if (r.etapa === "arreglado") return `Arreglado: ${r.porQue}. La prueba (\`${r.prueba}\`) viaja con el arreglo en ${r.rama}${r.ruta ? `, en ${r.ruta}` : ""}.`;
  if (r.etapa === "sin-arreglo") return `No lo pude arreglar: ${r.porQue}. Con esa prueba ya tenés el bug acorralado: \`${r.prueba}\`.`;
  return `No lo reproduje: ${r.porQue}. Contame un poco más de cómo pasa y lo vuelvo a intentar.`;
}

export async function deBugAArreglo(pedido: PedidoDeBug, deps: DepsDeBug = {}): Promise<ResultadoDeBug> {
  const contar = deps.contar ?? (() => {});
  contar("Primero, una prueba que reproduzca el bug.");
  const repro = await reproducirDeVerdad(pedido, deps.agente);
  let gastado = repro.gastado;
  if (!repro.comando) {
    await repro.cerrar().catch(() => {});
    return { etapa: "no-reproducido", porQue: `el agente no dejó el comando de la prueba en ${ARCHIVO_DE_LA_PRUEBA}`, intentos: 0, gastado };
  }
  const antes = await correrOraculo(repro.comando, repro.ruta);
  const porQueNoReproduce = await validarReproduccion(repro.ruta, repro.comando, antes);
  if (porQueNoReproduce) {
    // Si la prueba ya pasa, no reproduce nada: arreglar a ciegas sería adivinar.
    await repro.cerrar().catch(() => {});
    return { etapa: "no-reproducido", porQue: porQueNoReproduce, prueba: repro.comando, antes, intentos: 0, gastado };
  }
  contar(`La prueba lo reproduce (falla): ${porQueDelOraculo(antes).split("\n")[0]!.replace(/^el oráculo no pasó: /, "")}`);
  // La prueba queda en un commit: el arreglo se siembra encima, así la ve y no la puede esquivar.
  await git(["add", "-A"], repro.ruta);
  try {
    await git(["commit", "-qm", `prueba: reproduce «${pedido.descripcion.slice(0, 60)}»`], repro.ruta);
  } catch {
    await repro.cerrar().catch(() => {});
    return { etapa: "no-reproducido", porQue: "el agente no dejó cambios para guardar junto con la prueba", prueba: repro.comando, antes, intentos: 0, gastado };
  }
  const commit = await gitValor(["rev-parse", "HEAD"], repro.ruta);

  const arreglar = deps.arreglar ?? arreglarDeVerdad;
  let pista: string | undefined;
  for (let intento = 1; intento <= INTENTOS_DE_ARREGLO; intento++) {
    contar(`Arreglo, intento ${intento} de ${INTENTOS_DE_ARREGLO}.`);
    const arreglo = await arreglar(
      { repo: pedido.repo, tarea: pedidoDeArreglo(pedido.descripcion, repro.comando, pista), agente: pedido.agente, automatico: true, ...(pedido.verificar ? { verificar: pedido.verificar } : {}) },
      commit,
    );
    gastado += arreglo.gastado;
    if (!arreglo.rama || !arreglo.ruta) {
      pista = arreglo.porQue;
      continue;
    }
    const despues = await correrOraculo(repro.comando, arreglo.ruta);
    if (despues.paso) {
      // La rama del arreglo trae el commit de la prueba: la de la reproducción ya no hace falta.
      await repro.cerrar().catch(() => {});
      return { etapa: "arreglado", porQue: `la prueba que lo reproducía ahora pasa (intento ${intento})`, prueba: repro.comando, antes, despues, rama: arreglo.rama, ruta: arreglo.ruta, intentos: intento, gastado };
    }
    await cerrarArreglo(pedido.repo, arreglo);
    pista = despues.salida;
  }
  await repro.conservar().catch(() => {});
  return { etapa: "sin-arreglo", porQue: `${INTENTOS_DE_ARREGLO} intentos y la prueba sigue fallando: el bug está reproducido en ${repro.rama}`, prueba: repro.comando, antes, intentos: INTENTOS_DE_ARREGLO, gastado };
}
