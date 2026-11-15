import { cambiarTarjeta, type Columna, type Comentario, type FaseDeLaTarjeta, type Tarjeta } from "../nucleo/tarjetas.js";
import { dejarDeLatir, latirTarjeta, LATIDO_MS } from "../nucleo/tarjetas-trabadas.js";
import type { EventoEquipo } from "./equipo.js";

/**
 * El equipo trabajando una tarjeta del tablero (ver docs/idea.md): la tarjeta es el pedido y el
 * equipo la mueve solo. Con tu «dale» pasa a Haciendo; si la integración pasa el portón, a Para
 * revisar con su rama; si no sale, vuelve a Para hacer con el porqué, así la noche (o vos) la retoma
 * sabiendo dónde se cortó. Si el plan no arrancó —lo dejaste, se pasaba del tope—, no se mueve.
 *
 * Escucha los mismos eventos que la terminal y la consola: no hay un segundo camino del equipo.
 */

/**
 * Lo que recibe el líder: el título, qué hay que hacer, cómo se sabe que está
 * terminada y —si la tarjeta ya volvió una vez— lo que se le marcó.
 *
 * Esto último faltaba, y era un agujero serio: los comentarios se guardaban en
 * la tarjeta pero nadie se los pasaba al agente, así que una tarjeta devuelta
 * se reintentaba con el objetivo original, sin enterarse de qué había estado
 * mal. Devolver con un motivo no servía de nada.
 */
export function objetivoDeTarjeta(
  t: Pick<Tarjeta, "titulo" | "detalle" | "terminado" | "tipo"> & { readonly comentarios?: readonly Comentario[] },
): string {
  const marcado = loQueSeLeMarco(t.comentarios ?? []);
  return [
    t.tipo === "bug" ? `Arreglar un bug: ${t.titulo}` : t.titulo,
    ...(t.detalle ? ["", t.detalle] : []),
    ...(t.terminado ? ["", `Está terminada cuando: ${t.terminado}`] : []),
    // Un bug arranca por la prueba que lo muestra: sin ella, el portón no puede decir que se arregló.
    ...(t.tipo === "bug" ? ["", "Primero una prueba que falle por este bug; después, el arreglo que la hace pasar."] : []),
    ...(marcado.length > 0 ? ["", "Esta tarjeta ya volvió. Lo que se le marcó, y hay que resolver:", ...marcado] : []),
  ].join("\n");
}

/**
 * Lo que una persona marcó, en orden, con el archivo y la línea cuando el
 * comentario apunta a una: «exportar.ts:42 — falta el encabezado» se puede ir a
 * arreglar sin adivinar dónde.
 *
 * Lo que escribió Dolphin mismo (que la movió, que la integró) no es una
 * corrección: no se le repite al agente.
 */
export function loQueSeLeMarco(comentarios: readonly Comentario[]): string[] {
  return comentarios
    .filter((c) => c.quien !== QUIEN && c.texto.trim() !== "")
    .map((c) => (c.donde ? `- ${c.donde.archivo}:${c.donde.linea} — ${c.texto}` : `- ${c.texto}`));
}

export interface SeguimientoDeTarjeta {
  /** Se le pasa cada evento del equipo, junto al resto de quienes lo escuchan. */
  readonly alPasar: (evento: EventoEquipo) => void;
  /** Espera a que la tarjeta quede escrita: lo último que se hace antes de contestar. */
  readonly listo: () => Promise<void>;
}

const QUIEN = "dolphin";

export function seguirConTarjeta(repo: string, id: string, ahora: () => Date = () => new Date()): SeguimientoDeTarjeta {
  // En fila: el «dale» y el final pueden llegar casi juntos y el segundo no puede pisar al primero.
  let cadena: Promise<unknown> = Promise.resolve();
  let error: unknown;
  const cambiar = (cambio: (t: Tarjeta, cuando: string) => Tarjeta) => {
    const cuando = ahora().toISOString();
    cadena = cadena.then(() => cambiarTarjeta(repo, id, (t) => cambio(t, cuando))).catch((e: unknown) => (error ??= e));
  };
  const mover = (t: Tarjeta, columna: Columna, cuando: string): Tarjeta =>
    t.columna === columna ? t : { ...t, columna, movida: cuando, historial: [...t.historial, { columna, cuando }] };
  const comentar = (t: Tarjeta, texto: string, cuando: string): Tarjeta => ({ ...t, comentarios: [...t.comentarios, { quien: QUIEN, texto, cuando }] });

  let tareas = 0;
  let arranco = false;
  // La pasada final del portón, fase por fase: si una se corrigió y volvió a correr, vale la última.
  let porton: FaseDeLaTarjeta[] = [];
  // Mientras trabaja, late: si este proceso se corta, la tarjeta no queda trabada en Haciendo
  // para siempre (ver nucleo/tarjetas-trabadas.ts). Los latidos van en fila: uno a medio escribir
  // volvía a crear el archivo DESPUÉS de borrarlo al terminar, y quedaba un latido de nadie.
  let latido: NodeJS.Timeout | undefined;
  let latiendo: Promise<unknown> = Promise.resolve();
  const latir = () => (latiendo = latiendo.then(() => latirTarjeta(repo, id)).catch(() => {}));

  return {
    alPasar(e) {
      if (e.tipo === "plan") tareas = e.tareas.length;
      if (e.tipo === "fase-final" && e.estado !== "corre") {
        const fase = { fase: e.verificador, estado: e.estado };
        porton = porton.some((f) => f.fase === fase.fase) ? porton.map((f) => (f.fase === fase.fase ? fase : f)) : [...porton, fase];
      }
      if (e.tipo === "etapa" && e.etapa === "spawn" && !arranco) {
        arranco = true;
        latir();
        latido = setInterval(latir, LATIDO_MS);
        latido.unref();
        cambiar((t, cuando) =>
          comentar(
            mover({ ...t, quien: t.quien ?? "agentes" }, "haciendo", cuando),
            tareas > 1 ? `El equipo arrancó con ${tareas} tareas.` : "Arrancó un agente en su rama.",
            cuando,
          ),
        );
      }
      if (e.tipo === "fin") {
        const tardo = `${Math.round(e.ms / 1000)} s${e.gastado > 0 ? ` · US$ ${e.gastado.toFixed(2)}` : ""}`;
        if (e.rama) {
          const rama = e.rama;
          const fases = porton;
          // El portón de una rama anterior no es el de esta: se reemplaza, o se borra si no corrió.
          const conRama = ({ porton: _viejo, ...t }: Tarjeta): Tarjeta => ({ ...t, rama, ...(fases.length > 0 ? { porton: fases } : {}) });
          cambiar((t, cuando) => comentar(mover(conRama(t), "para-revisar", cuando), `Listo en ${tardo}: ${e.porQue}. Rama: ${rama}.`, cuando));
        } else if (arranco) cambiar((t, cuando) => comentar(mover(t, "para-hacer", cuando), `No salió (${tardo}): ${e.porQue}`, cuando));
        else cambiar((t, cuando) => comentar(t, `No arrancó: ${e.porQue}`, cuando));
      }
    },
    async listo() {
      if (latido) clearInterval(latido);
      await latiendo;
      await dejarDeLatir(repo, id).catch(() => {});
      await cadena;
      if (error) throw error;
    },
  };
}
