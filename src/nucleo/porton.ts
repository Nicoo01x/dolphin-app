import {
  FalloDelAgente,
  ORDEN_DE_COSTO,
  type Candidato,
  type ContextoDeVerificacion,
  type Costo,
  type Pasada,
  type Universo,
  type Verificador,
} from "./tipos.js";

/**
 * El portón.
 *
 * Regla económica, y es toda la idea del producto: los verificadores se
 * corren en ESCALONES por costo, y cada escalón se aplica a TODOS los
 * candidatos que siguen vivos antes de pasar al siguiente. Así el escalón
 * caro solo ve a los sobrevivientes.
 *
 * Si se corriera candidato por candidato de punta a punta, el primer
 * candidato gastaría el modelo caro antes de que el tipado matara al
 * segundo. Esa diferencia es la que hace que ocho intentos no cuesten
 * ocho veces.
 */

export interface Reloj {
  ahora(): number;
}

export const relojDelSistema: Reloj = { ahora: () => Date.now() };

interface EnCurso {
  universo: Universo;
  vivo: boolean;
  murioEn?: string;
  porQue?: string;
  pasadas: Pasada[];
  /** Lo que gastó el agente corrigiendo acá: un muerto que costó correcciones no murió gratis. */
  corrigiendo: number;
  /** Corrigió con un motor que no informa su costo: tampoco se sabe si murió gratis. */
  corrigioSinCosto?: boolean;
}

export interface ResultadoPorton {
  readonly candidatos: readonly Candidato[];
  readonly gastado: number;
  readonly muertosGratis: number;
}

export function ordenarPorCosto(verificadores: readonly Verificador[]): Verificador[] {
  return [...verificadores].sort(
    (a, b) => ORDEN_DE_COSTO.indexOf(a.costo) - ORDEN_DE_COSTO.indexOf(b.costo),
  );
}

/** Lo que el portón cuenta mientras corre: es lo que anima la pantalla. */
export type EventoPorton =
  | { tipo: "verifica"; universo: Universo; verificador: string; costo: Costo }
  | { tipo: "veredicto"; universo: Universo; verificador: string; paso: boolean; detalle: string; ms: number; intento?: number; salteada?: boolean }
  | { tipo: "corrige"; universo: Universo; verificador: string; intento: number };

/**
 * El bucle Code → Test → FIX → Prove: quién corrige un intento rebotado
 * y hasta dónde. Sin esto, el portón corta a la primera, como siempre.
 */
export interface Corrector {
  /** Corrige el universo con el veredicto a la vista. Devuelve lo que gastó, o que el motor no lo informa. */
  corregir(
    universo: Universo,
    falla: { verificador: string; detalle: string; evidencia?: string },
  ): Promise<{ gastado: number; costoDesconocido?: boolean }>;
  /** Cuántas vueltas de corrección por intento y por fase. */
  readonly reintentos: number;
  /**
   * En dólares, para toda la siembra: alcanzado esto, no se corrige más. El
   * bucle nunca es infinito. Cuenta lo que ya costó escribir (`yaGastado`):
   * antes arrancaba en cero, y una tarea con tope de 0,20 cuya escritura
   * costó 0,60 igual recibía correcciones.
   */
  readonly presupuesto?: number;
  /** Lo gastado antes del portón (escribir): suma contra el presupuesto. */
  yaGastado?(): number;
  /**
   * Los puntos de control (ver puntos.ts): una foto del universo antes de
   * cada vuelta, y la vuelta a esa foto si la corrección empeoró las cosas.
   * Sin esto, una corrección que rompe una fase anterior corta la rama ahí.
   */
  guardar?(universo: Universo): Promise<string>;
  volver?(universo: Universo, punto: string): Promise<void>;
}

export async function cruzarPorton(
  universos: readonly Universo[],
  verificadores: readonly Verificador[],
  reloj: Reloj = relojDelSistema,
  /** Lo que cada universo declaró haber tocado, por id. */
  contextos: ReadonlyMap<string, ContextoDeVerificacion> = new Map(),
  alPasar?: (evento: EventoPorton) => void,
  corrector?: Corrector,
): Promise<ResultadoPorton> {
  const enCurso: EnCurso[] = universos.map((universo) => ({ universo, vivo: true, pasadas: [], corrigiendo: 0 }));

  let gastado = 0;
  let muertosGratis = 0;

  const orden = ordenarPorCosto(verificadores);
  for (const [indice, verificador] of orden.entries()) {
    const vivos = enCurso.filter((c) => c.vivo);
    if (vivos.length === 0) break;

    // Un escalón corre en paralelo: los candidatos no se esperan entre sí.
    await Promise.all(
      vivos.map(async (candidato) => {
        let intento = 1;
        const desde = reloj.ahora();
        alPasar?.({ tipo: "verifica", universo: candidato.universo, verificador: verificador.nombre, costo: verificador.costo });

        // Un verificador que EXPLOTA no es un candidato que falla: es la
        // herramienta que se rompió. Sin este catch, una excepción de uno
        // solo —Chrome que no está instalado, por ejemplo— rechaza el
        // Promise.all, aborta la siembra entera y deja los N worktrees
        // colgados en disco sin devolver ninguna cosecha.
        let veredicto = await verificador
          .correr(candidato.universo, contextos.get(candidato.universo.id))
          .catch((error: unknown) => roto(verificador.nombre, error));

        gastado += veredicto.gastado ?? 0;

        const anotar = (v: { paso: boolean; detalle: string; gastado?: number; videos?: readonly string[]; salteada?: boolean; esperaMs?: number }, ms: number) => {
          const pasada = {
            verificador: verificador.nombre,
            costo: verificador.costo,
            paso: v.paso,
            detalle: v.detalle,
            gastado: v.gastado ?? 0,
            ms,
            ...(intento > 1 ? { intento } : {}),
            ...(v.videos && v.videos.length > 0 ? { videos: v.videos } : {}),
            ...(v.salteada ? { salteada: true } : {}),
            ...(v.esperaMs ? { esperaMs: v.esperaMs } : {}),
          };
          candidato.pasadas.push(pasada);
          alPasar?.({
            tipo: "veredicto",
            universo: candidato.universo,
            verificador: pasada.verificador,
            paso: pasada.paso,
            detalle: pasada.detalle,
            ms: pasada.ms,
            ...(intento > 1 ? { intento } : {}),
            ...(v.salteada ? { salteada: true } : {}),
          });
        };
        anotar(veredicto, reloj.ahora() - desde);

        // Lo que se le cuenta al agente en la próxima vuelta.
        let falla = aFalla(verificador.nombre, veredicto);
        // Si la última corrección se deshizo, qué fase rompía: va al motivo del corte.
        let deshizoPor: string | undefined;

        // Code → Test → FIX → Prove: el veredicto vuelve al agente, que
        // corrige en el mismo universo, y la MISMA fase se vuelve a correr.
        // Con límites duros de vueltas y de plata el bucle nunca es
        // infinito; si no sale, el corte queda con su diagnóstico a la vista.
        while (
          !veredicto.paso &&
          corrector &&
          intento <= corrector.reintentos &&
          (corrector.presupuesto === undefined || (corrector.yaGastado?.() ?? 0) + gastado < corrector.presupuesto)
        ) {
          intento += 1;
          alPasar?.({ tipo: "corrige", universo: candidato.universo, verificador: verificador.nombre, intento });
          const desdeArreglo = reloj.ahora();
          // La foto antes de corregir: si la corrección empeora, se vuelve acá.
          const punto = corrector.guardar ? await corrector.guardar(candidato.universo).catch(() => undefined) : undefined;
          const antesDeCorregir = veredicto;

          try {
            const arreglo = await corrector.corregir(candidato.universo, falla);
            gastado += arreglo.gastado;
            candidato.corrigiendo += arreglo.gastado;
            if (arreglo.costoDesconocido) candidato.corrigioSinCosto = true;
          } catch (error) {
            // Lo que gastó antes de caerse se paga igual: perderlo informa de
            // menos y hace pasar por «muerto gratis» a uno que costó plata.
            if (error instanceof FalloDelAgente) {
              gastado += error.gastado;
              candidato.corrigiendo += error.gastado;
              if (error.costoDesconocido) candidato.corrigioSinCosto = true;
            }
            // La corrección misma se rompió: ese es el motivo del corte,
            // porque es lo último que pasó y lo que hay que ir a mirar.
            veredicto = {
              paso: false,
              detalle: `${verificador.nombre}: la corrección se cayó (${mensaje(error)})`,
              gastado: 0,
            };
            anotar(veredicto, reloj.ahora() - desdeArreglo);
            deshizoPor = undefined;
            break;
          }

          alPasar?.({ tipo: "verifica", universo: candidato.universo, verificador: verificador.nombre, costo: verificador.costo });
          veredicto = await verificador
            .correr(candidato.universo, contextos.get(candidato.universo.id))
            .catch((error: unknown) => roto(verificador.nombre, error));
          gastado += veredicto.gastado ?? 0;
          // El tiempo de la vuelta incluye la corrección: es lo que costó
          // de verdad volver a tener esta fase en verde.
          anotar(veredicto, reloj.ahora() - desdeArreglo);

          if (!veredicto.paso) {
            falla = aFalla(verificador.nombre, veredicto);
            deshizoPor = undefined;
            continue;
          }

          // Una corrección puede romper lo que ya estaba en verde: arreglar lo
          // que marcó la revisión y, de paso, romper un test. Las fases de
          // antes se vuelven a correr.
          const rota = await repasar(candidato, orden.slice(0, indice), verificador.nombre);
          if (!rota) break;

          // Empeoró. Con foto, se vuelve a ella en vez de corregir encima del
          // lodo: la fase vuelve a fallar como antes, y la próxima vuelta
          // sabe qué no repetir. Sin foto, se corta en la fase rota.
          const volvio = punto !== undefined && corrector.volver !== undefined && (await corrector.volver(candidato.universo, punto).then(() => true, () => false));
          if (!volvio) {
            candidato.vivo = false;
            candidato.murioEn = rota.fase;
            candidato.porQue = rota.detalle;
            if (sinGastar(candidato)) muertosGratis += 1;
            return;
          }
          candidato.pasadas[rota.indice] = { ...candidato.pasadas[rota.indice]!, deshecha: true };
          // Y el verde de esta fase que trajo esa corrección: se deshizo con ella. Sin
          // esto, las notas decían a la vez «cortó una rama» y «rebotó y se corrigió».
          for (let k = rota.indice - 1; k >= 0; k--) {
            const p = candidato.pasadas[k]!;
            if (p.verificador === verificador.nombre && p.paso) {
              candidato.pasadas[k] = { ...p, deshecha: true };
              break;
            }
          }
          veredicto = antesDeCorregir;
          deshizoPor = rota.fase;
          falla = {
            ...aFalla(verificador.nombre, antesDeCorregir),
            detalle:
              `${antesDeCorregir.detalle}\n\n` +
              `Ojo: la corrección anterior arreglaba esto pero rompía «${rota.fase}» (${rota.detalle}), y se deshizo. ` +
              `Arreglalo sin romper eso.`,
          };
        }

        if (!veredicto.paso) {
          candidato.vivo = false;
          candidato.murioEn = verificador.nombre;
          candidato.porQue = deshizoPor
            ? `${veredicto.detalle} (la corrección que lo arreglaba rompía «${deshizoPor}» y se deshizo)`
            : veredicto.detalle;
          if (sinGastar(candidato)) muertosGratis += 1;
          return;
        }
      }),
    );
  }

  /**
   * Las fases de antes, otra vez, sobre lo que dejó una corrección. La
   * primera que se cae queda anotada con quién la rompió; las que pasan no
   * se anotan, como no se anota un test que sigue en verde.
   */
  async function repasar(
    candidato: EnCurso,
    anteriores: readonly Verificador[],
    corregida: string,
  ): Promise<{ fase: string; detalle: string; indice: number } | null> {
    for (const anterior of anteriores) {
      const desdeRepaso = reloj.ahora();
      const repaso = await anterior
        .correr(candidato.universo, contextos.get(candidato.universo.id))
        .catch((error: unknown) => roto(anterior.nombre, error));
      gastado += repaso.gastado ?? 0;
      if (repaso.paso) continue;

      const detalle = `${repaso.detalle} (lo rompió la corrección de «${corregida}»)`;
      const ms = reloj.ahora() - desdeRepaso;
      candidato.pasadas.push({
        verificador: anterior.nombre,
        costo: anterior.costo,
        paso: false,
        detalle,
        gastado: repaso.gastado ?? 0,
        ms,
        rotaPor: corregida,
      });
      alPasar?.({ tipo: "veredicto", universo: candidato.universo, verificador: anterior.nombre, paso: false, detalle, ms });
      return { fase: anterior.nombre, detalle, indice: candidato.pasadas.length - 1 };
    }
    return null;
  }

  return {
    candidatos: enCurso.map(aCandidato),
    gastado: redondear(gastado),
    muertosGratis,
  };
}

/**
 * El veredicto sin el nombre de su fase adelante («test: ✖ …» → «✖ …»), para
 * mostrarlo donde la fase ya está dicha. Se corta el nombre exacto y no hasta
 * los primeros dos puntos: un script de npm se llama «test:oculto», y un
 * motivo como «la corrección de «test:oculto» lo rompió» quedaba partido.
 */
export function sinFase(detalle: string, fase: string): string {
  if (detalle.startsWith(`${fase}:`)) return detalle.slice(fase.length + 1).trimStart();
  if (detalle.startsWith(`${fase} · `)) return detalle.slice(fase.length + 3);
  return detalle;
}

/**
 * Un verificador que EXPLOTA no es un candidato que falla: es la herramienta
 * que se rompió. Deja pasar, pero queda dicho que esa fase no corrió.
 */
function roto(nombre: string, error: unknown): { paso: true; salteada: true; detalle: string; gastado: number } {
  return { paso: true, salteada: true, detalle: `${nombre}: se rompió el verificador, se salteó (${mensaje(error)})`, gastado: 0 };
}

/**
 * Las fases que no corrieron en esta rama: su última vuelta se salteó. La
 * dejaron pasar, pero no son fases pasadas, y decir «pasó todas las fases»
 * de una rama así es justo lo que Dolphin existe para no decir.
 */
export function fasesSalteadas(c: Pick<Candidato, "pasadas">): string[] {
  const ultima = new Map<string, Pasada>();
  for (const p of c.pasadas) if (!p.deshecha) ultima.set(p.verificador, p);
  return [...ultima.values()].filter((p) => p.salteada).map((p) => p.verificador);
}

/** «se salteó revisión» · «se saltearon pantalla y vision». */
export function decirSalteadas(fases: readonly string[]): string {
  const lista = fases.length === 1 ? fases[0]! : `${fases.slice(0, -1).join(", ")} y ${fases.at(-1)}`;
  return `${fases.length === 1 ? "se salteó" : "se saltearon"} ${lista}`;
}

/** Lo que una fase dijo, como se le cuenta al agente que corrige. */
function aFalla(verificador: string, v: { detalle: string; evidencia?: string }): { verificador: string; detalle: string; evidencia?: string } {
  return { verificador, detalle: v.detalle, ...(v.evidencia ? { evidencia: v.evidencia } : {}) };
}

/** Murió sin que nadie pagara un token por él: ni las fases ni las correcciones (ni una sin precio). */
function sinGastar(candidato: EnCurso): boolean {
  return candidato.corrigiendo === 0 && !candidato.corrigioSinCosto && candidato.pasadas.every((p) => p.gastado === 0);
}

function aCandidato(c: EnCurso): Candidato {
  const base = { universo: c.universo, vivo: c.vivo, pasadas: c.pasadas };
  if (c.vivo) return base;
  return { ...base, murioEn: c.murioEn ?? "desconocido", porQue: c.porQue ?? "" };
}

function redondear(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function mensaje(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.replace(/\s+/g, " ").slice(0, 120);
}

/** Cuánto costó cada escalón. Es lo que dibuja la vista Portón. */
export function gastoPorCosto(candidatos: readonly Candidato[]): Record<Costo, number> {
  const total: Record<Costo, number> = { gratis: 0, barato: 0, caro: 0 };
  for (const candidato of candidatos) {
    for (const pasada of candidato.pasadas) total[pasada.costo] += pasada.gastado;
  }
  return total;
}
