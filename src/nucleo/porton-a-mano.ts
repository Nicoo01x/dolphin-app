import type { ContextoDeVerificacion, Universo, Veredicto, Verificador } from "./tipos.js";
import { fasesDelPaquete, verificadoresDeNpm } from "./verificadores.js";
import { leerSpecs, verificadorDeSpecs } from "./spec.js";
import { guardarEstado } from "./volver.js";

/**
 * El portón a mano: las fases que cruza una rama, corridas sobre la carpeta
 * donde se está trabajando ahora —la de la sesión de Claude que se mira en el
 * estudio de la app de escritorio—. Las mismas que arma una siembra (las del
 * package.json, de la más barata a la más cara) y con el mismo corte: la
 * primera que falla frena a las que siguen. Sin las que construyen (peso,
 * build): es para mirar mientras se trabaja, no para entregar.
 *
 * Con `revision`, al final entra la revisión cruzada: otro modelo, en solo
 * lectura, lee el diff contra lo que se le pidió al agente y dice si lo
 * acepta. Va última porque es la única fase que paga, y solo si las gratis
 * pasaron: revisar un cambio que no compila es tirar la plata.
 */

export type EstadoDeFase = "esperando" | "corriendo" | "paso" | "fallo" | "salteada";

export interface FaseAMano {
  readonly nombre: string;
  readonly estado: EstadoDeFase;
  /** En voz humana, como en el portón de una rama: «test: ✖ suma con negativos». */
  readonly detalle?: string;
  readonly ms?: number;
}

export interface PasadaAMano {
  readonly desde: string;
  /** Sin «hasta», todavía corre. Las que quedan «esperando» al terminar no llegaron a correr. */
  readonly hasta?: string;
  readonly fases: readonly FaseAMano[];
}

export interface OpcionesDelPortonAMano {
  /** Las fases; por defecto, las del package.json de la carpeta. Se inyectan en los tests. */
  readonly verificadores?: readonly Verificador[];
  /** Cada vez que una fase arranca o termina: la consola lo muestra mientras pasa. */
  readonly alCambiar?: (pasada: PasadaAMano) => void;
  readonly ahora?: () => number;
  /** La revisión cruzada: el verificador ya armado y quién escribió, para que revise otro. */
  readonly revision?: {
    readonly verificador: Verificador;
    /** El modelo que escribió el cambio: el revisor se cambia de escalón si coincide. */
    readonly escribio?: string;
    /** Contra qué se mide el cambio; sin esto, contra HEAD (lo que todavía no se commiteó). */
    readonly base?: string;
  };
}

export async function pasarPorElPorton(ruta: string, opciones: OpcionesDelPortonAMano = {}): Promise<PasadaAMano> {
  const ahora = opciones.ahora ?? Date.now;
  const specs = await leerSpecs(ruta);
  const fasesDelRepo = opciones.verificadores ?? [
    ...(specs.length > 0 ? [verificadorDeSpecs()] : []),
    ...verificadoresDeNpm(await fasesDelPaquete(ruta, { sinConstruir: true })),
  ];
  const lista = opciones.revision ? [...fasesDelRepo, opciones.revision.verificador] : fasesDelRepo;
  const contexto: ContextoDeVerificacion | undefined = opciones.revision?.escribio ? { modelo: opciones.revision.escribio } : undefined;
  const desde = new Date(ahora()).toISOString();
  const fases: FaseAMano[] = lista.map((v) => ({ nombre: v.nombre, estado: "esperando" }));
  const foto = (hasta?: string): PasadaAMano => ({ desde, fases: [...fases], ...(hasta ? { hasta } : {}) });
  opciones.alCambiar?.(foto());

  const base = opciones.revision?.base;
  const universo: Universo = { id: "a-mano", rama: "", ruta, nacido: ahora(), ...(base ? { base } : {}) };
  for (const [i, verificador] of lista.entries()) {
    fases[i] = { nombre: verificador.nombre, estado: "corriendo" };
    opciones.alCambiar?.(foto());
    const inicio = ahora();
    // Un verificador que explota no tira la pasada: es una fase que falló, con su porqué.
    const veredicto: Veredicto = await verificador.correr(universo, contexto).catch((error: unknown) => ({
      paso: false,
      detalle: `${verificador.nombre}: se rompió (${error instanceof Error ? error.message : String(error)})`,
    }));
    const estado: EstadoDeFase = veredicto.salteada ? "salteada" : veredicto.paso ? "paso" : "fallo";
    // Con Math.max: el reloj de pared se puede corregir para atrás en medio de una fase.
    fases[i] = { nombre: verificador.nombre, estado, detalle: veredicto.detalle, ms: Math.max(0, ahora() - inicio) };
    if (estado === "fallo") break;
  }

  const pasada = foto(new Date(ahora()).toISOString());
  // Todo en verde es un momento al que se va a querer volver cuando algo se rompa (ver volver.ts).
  // Se guarda acá y no en cualquier otro lado porque este es el único lugar donde consta que el
  // proyecto entero andaba. Si guardar falla, la pasada igual pasó.
  const enVerde = fases.filter((f) => f.estado === "paso");
  if (enVerde.length > 0 && !fases.some((f) => f.estado === "fallo")) {
    await guardarEstado(ruta, { porQue: "pasó el portón", fases: enVerde.map((f) => f.nombre), ahora: new Date(ahora()) }).catch(() => undefined);
  }
  opciones.alCambiar?.(pasada);
  return pasada;
}
