import { decirSalteadas, fasesSalteadas } from "./porton.js";
import type { Candidato, Forma } from "./tipos.js";

/**
 * Entre los que cruzaron el portón, gana el MÁS SIMPLE.
 *
 * No el más rápido ni el más largo: el que deja menos deuda. El orden de
 * desempate es deliberado — una dependencia nueva pesa más que cien líneas,
 * porque la dependencia la vas a arrastrar para siempre.
 *
 * Antes que todo eso, la confianza: una rama que se puso verde cambiando
 * pruebas, silenciando errores o aflojando el portón no le gana a una limpia,
 * por simple que sea.
 *
 * El último criterio es el id, para que la elección sea DETERMINISTA: la
 * misma cosecha tiene que elegir siempre lo mismo, o no se puede reproducir
 * ni testear.
 */

export interface Eleccion {
  readonly ganador?: Candidato;
  readonly porQue: string;
}

export function elegir(candidatos: readonly Candidato[]): Eleccion {
  const vivos = candidatos.filter((c) => c.vivo);

  if (vivos.length === 0) {
    const muertos = candidatos.length;
    return {
      porQue:
        muertos === 0
          ? "No se abrió ninguna rama."
          : muertos === 1
            ? `La rama no pasó el portón. ${resumirMuertes(candidatos)}`
            : `Ninguna de las ${muertos} ramas pasó el portón. ${resumirMuertes(candidatos)}`,
    };
  }

  if (vivos.length === 1) {
    const unico = vivos[0]!;
    // Con una sola rama no hubo con quién comparar: se dice cómo le fue.
    // Sin fases no hay prueba: decir «pasó» de algo que nadie probó es la
    // mentira que Dolphin existe para no decir.
    const salteadas = fasesSalteadas(unico);
    const porQue =
      unico.pasadas.length === 0
        ? "No hay fases que la prueben: se entregó sin probar. Mirá el cambio antes de mergear, o sumale un portón con --verificar."
        : candidatos.length === 1
          ? salteadas.length > 0
            ? `Pasó las fases que corrieron; ${decirSalteadas(salteadas)}. Miralo vos antes de mergear.`
            : "Pasó todas las fases."
          : `Pasó una sola de ${candidatos.length}.${salteadas.length > 0 ? ` A esta rama ${decirSalteadas(salteadas)}.` : ""}`;
    return { ganador: unico, porQue };
  }

  const ordenados = [...vivos].sort(comparar);
  const ganador = ordenados[0]!;
  const segundo = ordenados[1]!;
  const salteadas = fasesSalteadas(ganador);

  return {
    ganador,
    porQue: `Pasaron ${vivos.length}. ${porQueGanoContra(ganador, segundo)}${salteadas.length > 0 ? ` A la elegida ${decirSalteadas(salteadas)}.` : ""}`,
  };
}

function comparar(a: Candidato, b: Candidato): number {
  const fa = a.forma ?? FORMA_VACIA;
  const fb = b.forma ?? FORMA_VACIA;

  const ta = tieneTrampas(fa);
  const tb = tieneTrampas(fb);
  if (ta !== tb) return ta ? 1 : -1;

  // La que se probó entera le gana a una con fases salteadas: «pasó» sin
  // revisión no es lo mismo que aceptada por la revisión.
  const sa = fasesSalteadas(a).length;
  const sb = fasesSalteadas(b).length;
  if (sa !== sb) return sa - sb;

  if (fa.dependenciasNuevas !== fb.dependenciasNuevas) {
    return fa.dependenciasNuevas - fb.dependenciasNuevas;
  }
  if (fa.archivos !== fb.archivos) return fa.archivos - fb.archivos;

  const tocadasA = fa.agregadas + fa.quitadas;
  const tocadasB = fb.agregadas + fb.quitadas;
  if (tocadasA !== tocadasB) return tocadasA - tocadasB;

  // numeric, igual que como ordena la lista en la pantalla: sin esto, con
  // diez universos «u10» gana por «orden» mientras se muestra último.
  return a.universo.id.localeCompare(b.universo.id, "en", { numeric: true });
}

/**
 * Cómo se nombra una rama en lo que lee una persona: «la rama 2», no «u2».
 * El id es interno (el nombre del worktree); el número es el mismo que ve en la lista.
 */
export function nombreDeRama(c: Pick<Candidato, "universo">, alPrincipio = false): string {
  const numero = c.universo.id.replace(/^u(?=\d+$)/, "");
  return `${alPrincipio ? "La" : "la"} rama ${numero}`;
}

function porQueGanoContra(ganador: Candidato, otro: Candidato): string {
  const g = ganador.forma ?? FORMA_VACIA;
  const o = otro.forma ?? FORMA_VACIA;

  if (!tieneTrampas(g) && tieneTrampas(o)) {
    if (!cambioTests(g) && cambioTests(o)) return `${nombreDeRama(ganador, true)} dejó intactas las pruebas que ya existían y ${nombreDeRama(otro)} las cambió.`;
    return `${nombreDeRama(ganador, true)} no tiene hallazgos de trampas y ${nombreDeRama(otro)} sí.`;
  }
  const sg = fasesSalteadas(ganador).length;
  const so = fasesSalteadas(otro).length;
  if (sg < so) {
    return `${nombreDeRama(ganador, true)} pasó por ${sg === 0 ? "todas sus fases" : "más fases"}; en ${nombreDeRama(otro)} ${decirSalteadas(fasesSalteadas(otro))}.`;
  }
  if (g.dependenciasNuevas < o.dependenciasNuevas) {
    // «No agrega» solo si no agrega ninguna: agregar menos no es no agregar.
    return g.dependenciasNuevas === 0
      ? `${nombreDeRama(ganador, true)} no agrega dependencias y ${nombreDeRama(otro)} agrega ${o.dependenciasNuevas}.`
      : `${nombreDeRama(ganador, true)} agrega ${g.dependenciasNuevas} ${g.dependenciasNuevas === 1 ? "dependencia" : "dependencias"} y ${nombreDeRama(otro)}, ${o.dependenciasNuevas}.`;
  }
  if (g.archivos < o.archivos) {
    return `${nombreDeRama(ganador, true)} toca ${g.archivos} archivo(s) contra ${o.archivos}.`;
  }
  const tg = g.agregadas + g.quitadas;
  const to = o.agregadas + o.quitadas;
  if (tg < to) return `${nombreDeRama(ganador, true)} mueve ${tg} líneas contra ${to}.`;

  return `Quedaron iguales de simples; queda ${nombreDeRama(ganador)} por orden, para que la elección sea reproducible.`;
}

function resumirMuertes(candidatos: readonly Candidato[]): string {
  const porVerificador = new Map<string, number>();
  for (const c of candidatos) {
    if (c.vivo) continue;
    const clave = c.murioEn ?? "desconocido";
    porVerificador.set(clave, (porVerificador.get(clave) ?? 0) + 1);
  }
  const cortes = [...porVerificador.entries()].sort((a, b) => b[1] - a[1]);
  if (cortes.length === 0) return "";
  const total = cortes.reduce((n, [, cuantos]) => n + cuantos, 0);
  if (total === 1) return `Se cortó en ${cortes[0]![0]}.`;
  return `Dónde se cortaron: ${cortes.map(([nombre, cuantos]) => `${nombre} (${cuantos})`).join(", ")}.`;
}

const FORMA_VACIA: Forma = { archivos: 0, agregadas: 0, quitadas: 0, dependenciasNuevas: 0 };

/** Las cosechas viejas no lo medían: sin dato, no se la acusa de nada. */
const cambioTests = (forma: Forma): boolean => (forma.testsCambiados?.length ?? 0) > 0;
const tieneTrampas = (forma: Forma): boolean => cambioTests(forma) || (forma.trampas?.length ?? 0) > 0;
