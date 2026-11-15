import { randomUUID } from "node:crypto";
import { conCaja } from "../agentes/ejecutar.js";
import { cruzarPorton, type Reloj, relojDelSistema } from "./porton.js";
import type { CajaDeLaRama } from "./aislado.js";
import { elegir } from "./elegir.js";
import { repartirEnfoques, type Enfoque } from "./enfoques.js";
import { FalloDelAgente } from "./tipos.js";
import type {
  Agente,
  Candidato,
  Contrato,
  Correccion,
  Cosecha,
  Forma,
  Tokens,
  Trabajo,
  Taller,
  Universo,
  Verificador,
} from "./tipos.js";

/**
 * Sembrar: lanzar la misma tarea en N universos a la vez.
 *
 * Ocho intentos tardan lo que tarda el más lento, no ocho veces. Eso solo
 * es verdad si nadie espera a nadie, así que el trabajo de los agentes va
 * en paralelo y los universos que fallan al escribir ya quedan muertos
 * antes de llegar al portón.
 */

export interface Siembra {
  readonly tarea: string;
  readonly cantidad: number;
  readonly rama: string;
  readonly agente: Agente;
  readonly taller: Taller;
  readonly verificadores: readonly Verificador[];
  /** Los ángulos a repartir. Sin esto, los N universos prueban lo mismo. */
  readonly enfoques?: readonly Enfoque[];
  /** Se llama en cada cambio de estado: es lo que alimenta la vista Océano. */
  readonly alPasar?: (evento: Evento) => void;
  /** Vueltas del bucle Code → Test → Fix por intento y fase. 0 = sin bucle. */
  readonly reintentos?: number;
  /** Tope en dólares para las correcciones: alcanzado, no se corrige más. */
  readonly presupuesto?: number;
  /** Una retoma opcional ocurre antes de que empiecen los verificadores. */
  readonly antesDelPorton?: (universo: Universo, agente: Agente) => Promise<Trabajo | undefined>;
  readonly reloj?: Reloj;
  /** Variables extra para el proceso del agente, sin guardar secretos en la cosecha. */
  readonly entorno?: Readonly<Record<string, string>>;
  /** Permite cortar un turno externo, por ejemplo cuando se cierra un issue. */
  readonly senal?: AbortSignal;
  /** Si es false, los worktrees quedan en disco para poder mirarlos. */
  readonly limpiar?: boolean;
  /**
   * La caja de ESTA siembra (ver nucleo/aislado.ts). Es de la siembra y no del proceso: con la cola o
   * el equipo hay varias a la vez, y la caja de una no puede ser la de la otra. `null` es «esta corre
   * afuera»; sin el campo, queda la del proceso.
   */
  readonly caja?: CajaDeLaRama | null;
}

export type Evento =
  | { tipo: "nace"; universo: Universo; enfoque: string }
  | { tipo: "escribio"; universo: Universo; forma: Forma; contrato?: Contrato; modelo?: string }
  | { tipo: "fallo-escribiendo"; universo: Universo; porQue: string }
  | { tipo: "verifica"; universo: Universo; verificador: string; costo: string }
  | { tipo: "veredicto"; universo: Universo; verificador: string; paso: boolean; detalle: string; ms: number; intento?: number; salteada?: boolean }
  | { tipo: "corrige"; universo: Universo; verificador: string; intento: number }
  | { tipo: "cosecha"; cosecha: Cosecha };

/**
 * Todo lo que hace esta siembra —los agentes, sus correcciones, la revisión del portón— corre adentro
 * de SU caja. Sin esto la caja era una sola para el proceso entero y dos siembras a la vez se la
 * pisaban: la segunda en arrancar le cambiaba la caja a la primera, que ya estaba trabajando.
 */
export function sembrar(siembra: Siembra): Promise<Cosecha> {
  return siembra.caja !== undefined ? conCaja(siembra.caja, () => sembrarEnSuCaja(siembra)) : sembrarEnSuCaja(siembra);
}

async function sembrarEnSuCaja(siembra: Siembra): Promise<Cosecha> {
  const reloj = siembra.reloj ?? relojDelSistema;
  const desde = reloj.ahora();

  // Cada siembra vive en su propio espacio de nombres. Sin esto, dos cosas
  // se rompen: una corrida que se cayó deja las ramas tomadas y la próxima
  // ya no puede arrancar, y dos turnos simultáneos se pisan entre sí.
  //
  // El reloj solo no alcanza: dos siembras lanzadas en el mismo milisegundo
  // —algo normal cuando un turno dispara varias tareas— caerían en la misma
  // rama. Va con un sufijo al azar.
  const rama = `${siembra.rama}/${desde.toString(36)}${randomUUID().slice(0, 6)}`;

  // Cuántos turnos lleva cada agente: escribir es el 1, cada corrección suma uno (ver turnos.ts).
  const turnos = new Map<string, number>();
  const siguienteTurno = (id: string) => {
    const n = (turnos.get(id) ?? 0) + 1;
    turnos.set(id, n);
    return n;
  };
  const formas = new Map<string, Forma>();
  const contratos = new Map<string, Contrato>();
  const angulos = new Map<string, string>();
  const abortados = new Map<string, string>();
  /** Los que ni siquiera se pudieron abrir. */
  const noNacieron = new Map<string, string>();
  const universos: Universo[] = [];
  /** Los que gastaron plata antes de caerse: no son muertes gratis. */
  const gastaronYMurieron = new Set<string>();

  // Un ángulo distinto por universo: es lo que hace que sembrar ocho no sea
  // pagar ocho veces por la misma idea.
  const enfoques = repartirEnfoques(siembra.cantidad, siembra.enfoques);
  // El de cada uno, por id: por posición, si u1 no nacía, u2 corregía con el enfoque de u1.
  const enfoqueDe = new Map<string, (typeof enfoques)[number]>();

  // Lo que gastan los agentes escribiendo. Es la mitad grande de la cuenta:
  // sin esto, Dolphin informaría solo lo que gastan los verificadores y la
  // promesa de "mirá cuánto te costó el turno" sería mentira.
  let gastadoEscribiendo = 0;
  // Y lo mismo rama por rama, escribiendo y corrigiendo: sin esto el costo
  // de cada una informa solo sus fases, y el desempeño por modelo mide mal.
  const gastoAgente = new Map<string, number>();
  const sumarGasto = (id: string, dolares: number) => gastoAgente.set(id, (gastoAgente.get(id) ?? 0) + dolares);
  const msAgentes = new Map<string, number>();
  // Cada vuelta de corrección, rama por rama: cuánto costó y si retomó la sesión.
  const correcciones = new Map<string, Correccion[]>();
  // Lo que el motor informa en tokens, y las ramas cuyo motor no dice cuánto costó:
  // ahí el gasto es un piso, no el total (ver Trabajo.costoDesconocido).
  const tokensDe = new Map<string, Tokens>();
  const sinCosto = new Set<string>();
  const anotarMedida = (id: string, medida: { tokens?: Tokens; costoDesconocido?: boolean }) => {
    if (medida.costoDesconocido) sinCosto.add(id);
    if (!medida.tokens) return;
    const antes = tokensDe.get(id);
    const cache = (antes?.cache ?? 0) + (medida.tokens.cache ?? 0);
    tokensDe.set(id, {
      entrada: (antes?.entrada ?? 0) + medida.tokens.entrada,
      salida: (antes?.salida ?? 0) + medida.tokens.salida,
      ...(cache > 0 ? { cache } : {}),
    });
  };
  const modelos = new Map<string, string>();
  // Las ramas que cambiaron de motor a mitad de camino (ver relevo.ts): sin esto la cosecha
  // mostraría el trabajo firmado por quien lo terminó y el titular caído no existiría.
  const relevos = new Map<string, { salio: readonly string[]; entro: string }>();
  // De la memoria de respuestas, con lo que ahorró; null si el motor no había dicho cuánto costaba.
  const memoriaDeCache = new Map<string, number | null>();

  // 1 · Abrir los universos y poner a trabajar a todos a la vez.
  await Promise.all(
    Array.from({ length: siembra.cantidad }, (_, i) => `u${i + 1}`).map(async (id, i) => {
      const enfoque = enfoques[i];

      // Abrir también puede fallar —disco lleno, permisos, una rama que
      // choca— y si eso rechaza el Promise.all, los universos que SÍ se
      // abrieron quedan colgados en disco para siempre: la limpieza del
      // final nunca llega a correr.
      let universo: Universo;
      try {
        const abierto = await siembra.taller.abrir(id, rama);
        universo = siembra.entorno ? { ...abierto, entorno: { ...abierto.entorno, ...siembra.entorno } } : abierto;
      } catch (error) {
        noNacieron.set(id, error instanceof Error ? error.message : String(error));
        return;
      }

      universos.push(universo);
      if (enfoque) {
        angulos.set(universo.id, enfoque.nombre);
        enfoqueDe.set(universo.id, enfoque);
      }
      siembra.alPasar?.({ tipo: "nace", universo, enfoque: enfoque?.nombre ?? "—" });

      try {
        const arranco = reloj.ahora();
        let trabajo = await siembra.agente.trabajar(universo, siembra.tarea, enfoque, siembra.senal);
        const { forma, gastado, contrato, modelo, deCache, ahorro } = trabajo;
        if (deCache) memoriaDeCache.set(universo.id, ahorro ?? null);
        if (trabajo.relevo) relevos.set(universo.id, trabajo.relevo);
        anotarMedida(universo.id, trabajo);
        // Cuánto tardó escribiendo y con qué modelo: sin esto la corrida
        // reproducible arranca en el portón y el tramo más caro no se ve.
        msAgentes.set(universo.id, reloj.ahora() - arranco);
        if (modelo ?? enfoque?.modelo) modelos.set(universo.id, (modelo ?? enfoque?.modelo)!);
        gastadoEscribiendo += gastado;
        sumarGasto(universo.id, gastado);
        formas.set(universo.id, forma);
        if (contrato) contratos.set(universo.id, contrato);
        await siembra.taller.turno?.(universo, siguienteTurno(universo.id), "escribió");
        siembra.alPasar?.({
          tipo: "escribio",
          universo,
          forma,
          ...(contrato ? { contrato } : {}),
          ...((modelo ?? enfoque?.modelo) ? { modelo: (modelo ?? enfoque?.modelo)! } : {}),
        });
        const retoma = await siembra.antesDelPorton?.(universo, siembra.agente);
        if (retoma) {
          // La retoma deja una nueva foto: el portón debe mirar lo último y el costo suma la vuelta.
          trabajo = retoma;
          gastadoEscribiendo += retoma.gastado;
          sumarGasto(universo.id, retoma.gastado);
          anotarMedida(universo.id, retoma);
          formas.set(universo.id, retoma.forma);
          if (retoma.contrato) contratos.set(universo.id, retoma.contrato);
          siembra.alPasar?.({
            tipo: "escribio",
            universo,
            forma: retoma.forma,
            ...(retoma.contrato ? { contrato: retoma.contrato } : {}),
            ...(retoma.modelo ? { modelo: retoma.modelo } : {}),
          });
        }
      } catch (error) {
        // Lo que gastó antes de romperse se paga igual: descartarlo haría
        // que la cosecha informe de menos y que este candidato figure como
        // «muerto gratis» habiendo quemado el turno entero.
        if (error instanceof FalloDelAgente && error.gastado > 0) {
          gastadoEscribiendo += error.gastado;
          sumarGasto(universo.id, error.gastado);
          gastaronYMurieron.add(universo.id);
        }
        // Y si el motor no dice cuánto gastó, tampoco se puede decir que murió gratis.
        if (error instanceof FalloDelAgente && error.costoDesconocido) {
          sinCosto.add(universo.id);
          gastaronYMurieron.add(universo.id);
        }

        const porQue = error instanceof Error ? error.message : String(error);
        abortados.set(universo.id, porQue);
        siembra.alPasar?.({ tipo: "fallo-escribiendo", universo, porQue });
      }
    }),
  );

  universos.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // 2 · Al portón van solo los que llegaron a escribir algo.
  const llegaron = universos.filter((u) => !abortados.has(u.id));
  // El portón recibe lo que cada universo declaró: así el escalón de
  // pantalla prueba la superficie que cambió en vez de tantear la home.
  // Y quién lo escribió: en una siembra que mezcla modelos, la revisión
  // de cada rama tiene que ser de otro que el que la escribió.
  const contextoDe = (id: string) => ({
    ...(contratos.get(id) ? { contrato: contratos.get(id)! } : {}),
    ...(angulos.get(id) ? { enfoque: angulos.get(id)! } : {}),
    ...(modelos.get(id) ? { modelo: modelos.get(id)! } : {}),
  });
  // Vivo, no una foto: una corrección que cambia lo que la rama toca (o que se
  // deshace) se lo cuenta a Pantalla y a Vision en la vuelta siguiente.
  const contextos = new Map(llegaron.map((u) => [u.id, contextoDe(u.id)]));

  // El bucle de corrección: el veredicto vuelve al agente, que arregla en
  // el mismo universo. La forma y el contrato se re-anotan: después de
  // corregir, lo que se mide es lo que quedó, no lo que había.
  const corregir = siembra.agente.corregir?.bind(siembra.agente);
  // El contrato de antes de cada vuelta: si la corrección se deshace, vuelve.
  const contratoAntes = new Map<string, Contrato | undefined>();
  const { taller } = siembra;
  const corrector =
    (siembra.reintentos ?? 0) > 0 && corregir
      ? {
          reintentos: siembra.reintentos ?? 0,
          ...(siembra.presupuesto !== undefined ? { presupuesto: siembra.presupuesto } : {}),
          // El tope es de la siembra entera: lo que costó escribir ya cuenta.
          yaGastado: () => gastadoEscribiendo,
          corregir: async (universo: Universo, falla: { verificador: string; detalle: string; evidencia?: string }) => {
            const enfoque = enfoqueDe.get(universo.id);
            const arranco = reloj.ahora();
            const anotarVuelta = (vuelta: Omit<Correccion, "fase" | "ms">) =>
              correcciones.set(universo.id, [...(correcciones.get(universo.id) ?? []), { fase: falla.verificador, ms: reloj.ahora() - arranco, ...vuelta }]);
            let trabajo: Awaited<ReturnType<typeof corregir>>;
            try {
              trabajo = await corregir(universo, siembra.tarea, falla, enfoque);
            } catch (error) {
              // Una corrección que se cae después de gastar se paga igual, como la escritura.
              if (error instanceof FalloDelAgente && (error.gastado > 0 || error.costoDesconocido)) {
                sumarGasto(universo.id, error.gastado);
                anotarMedida(universo.id, { costoDesconocido: error.costoDesconocido });
                anotarVuelta({ gastado: error.gastado, cayo: true, ...(error.costoDesconocido ? { costoDesconocido: true } : {}) });
              }
              throw error;
            }
            sumarGasto(universo.id, trabajo.gastado);
            anotarMedida(universo.id, trabajo);
            // Una corrección también puede cambiar de manos: la que vale es la última, que es
            // quien dejó la rama como está.
            if (trabajo.relevo) relevos.set(universo.id, trabajo.relevo);
            anotarVuelta({
              gastado: trabajo.gastado,
              ...(trabajo.reanudada ? { reanudada: true } : {}),
              ...(trabajo.modelo ? { modelo: trabajo.modelo } : {}),
              ...(trabajo.costoDesconocido ? { costoDesconocido: true } : {}),
            });
            formas.set(universo.id, trabajo.forma);
            if (trabajo.contrato) contratos.set(universo.id, trabajo.contrato);
            contextos.set(universo.id, contextoDe(universo.id));
            await taller.turno?.(universo, siguienteTurno(universo.id), `corrigió ${falla.verificador}`);
            return { gastado: trabajo.gastado, ...(trabajo.costoDesconocido ? { costoDesconocido: true } : {}) };
          },
          // La foto antes de cada vuelta y la vuelta a ella, si el taller sabe
          // (el de git sí: ver puntos.ts). Al volver, la forma y el contrato
          // son los de antes: los de la corrección deshecha ya no existen.
          ...(taller.guardar && taller.volver
            ? {
                guardar: async (universo: Universo) => {
                  contratoAntes.set(universo.id, contratos.get(universo.id));
                  return taller.guardar!(universo);
                },
                volver: async (universo: Universo, punto: string) => {
                  formas.set(universo.id, await taller.volver!(universo, punto));
                  const contrato = contratoAntes.get(universo.id);
                  if (contrato) contratos.set(universo.id, contrato);
                  else contratos.delete(universo.id);
                  contextos.set(universo.id, contextoDe(universo.id));
                },
              }
            : {}),
        }
      : undefined;

  const resultado = await cruzarPorton(
    llegaron,
    siembra.verificadores,
    reloj,
    contextos,
    (evento) => siembra.alPasar?.(evento),
    corrector,
  );

  // 3 · Los que se cayeron escribiendo también son candidatos.
  const caidos: Candidato[] = universos
    .filter((u) => abortados.has(u.id))
    .map((universo) => ({
      universo,
      vivo: false,
      murioEn: "el agente",
      porQue: abortados.get(universo.id) ?? "",
      pasadas: [],
    }));

  // Y los que ni se pudieron abrir: sin esto desaparecen sin dejar rastro y
  // la cosecha dice que se sembraron menos universos de los que se pidieron.
  const abortos: Candidato[] = [...noNacieron.entries()].map(([id, porQue]) => ({
    universo: { id, rama, ruta: "", nacido: desde },
    vivo: false,
    murioEn: "el taller",
    porQue,
    pasadas: [],
  }));

  const candidatos = [...resultado.candidatos, ...caidos, ...abortos]
    .map((c) => {
      const forma = formas.get(c.universo.id);
      const contrato = contratos.get(c.universo.id);
      const enfoque = angulos.get(c.universo.id);
      const msAgente = msAgentes.get(c.universo.id);
      const modelo = modelos.get(c.universo.id);
      const ahorro = memoriaDeCache.get(c.universo.id);
      const gastadoAgente = gastoAgente.get(c.universo.id);
      const vueltas = correcciones.get(c.universo.id);
      const tokens = tokensDe.get(c.universo.id);
      return {
        ...c,
        ...(tokens ? { tokens } : {}),
        ...(sinCosto.has(c.universo.id) ? { costoDesconocido: true } : {}),
        ...(vueltas && vueltas.length > 0 ? { correcciones: vueltas.map((v) => ({ ...v, gastado: Math.round(v.gastado * 10000) / 10000 })) } : {}),
        ...(forma ? { forma } : {}),
        ...(contrato ? { contrato } : {}),
        ...(enfoque ? { enfoque } : {}),
        ...(msAgente !== undefined ? { msAgente } : {}),
        ...(gastadoAgente ? { gastadoAgente: Math.round(gastadoAgente * 10000) / 10000 } : {}),
        ...(modelo ? { modelo } : {}),
        ...(relevos.has(c.universo.id) ? { relevo: relevos.get(c.universo.id)! } : {}),
        ...(memoriaDeCache.has(c.universo.id) ? { deCache: true, ...(ahorro !== null && ahorro !== undefined ? { ahorro } : {}) } : {}),
      };
    })
    .sort((a, b) => a.universo.id.localeCompare(b.universo.id, undefined, { numeric: true }));

  const eleccion = elegir(candidatos);

  if (siembra.limpiar !== false) {
    // El ganador se conserva: es el worktree del que sale el diff. Y un
    // cierre que falla no puede frenar el de los demás: quedarían worktrees
    // colgados por culpa de uno solo.
    await Promise.allSettled(
      universos
        .filter((u) => u.id !== eleccion.ganador?.universo.id)
        .map((u) => siembra.taller.cerrar(u)),
    );
  }

  const cosecha: Cosecha = {
    tarea: siembra.tarea,
    candidatos,
    ...(eleccion.ganador ? { ganador: eleccion.ganador } : {}),
    porQueGano: eleccion.porQue,
    gastado: Math.round((resultado.gastado + gastadoEscribiendo) * 10000) / 10000,
    // Con un motor que no informa su costo, el total de arriba es un piso.
    ...(candidatos.some((c) => c.costoDesconocido) ? { costoDesconocido: true } : {}),
    // Un candidato que quemó tokens antes de caerse no es una muerte
    // gratis: contarlo como tal infla hacia arriba justo el número que el
    // producto usa de titular.
    muertosGratis:
      resultado.muertosGratis +
      caidos.filter((c) => !gastaronYMurieron.has(c.universo.id)).length +
      abortos.length,
    ms: reloj.ahora() - desde,
  };

  siembra.alPasar?.({ tipo: "cosecha", cosecha });
  return cosecha;
}
