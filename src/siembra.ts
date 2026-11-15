import { abrirEnVivo, reducirEvento } from "./nucleo/en-vivo.js";
import { aprenderDeCosecha, aprenderDeLoDeshecho, leerMemoria, verificadoresDeMemoria, type Recuerdo } from "./nucleo/memoria.js";
import { contextoDeSiembra } from "./nucleo/perfil.js";
import { leerConfig } from "./nucleo/config.js";
import { cajaDisponible, SIN_CAJA, type CajaDeLaRama } from "./nucleo/aislado.js";
import { aislarAgentes } from "./agentes/ejecutar.js";
import { leerPolitica, verificadorDePolitica } from "./nucleo/politica.js";
import { LATIDO_MS, latirAsunto, soltarAsunto, tomarAsunto } from "./nucleo/bandeja.js";
import { agenteConMemoria, aprobarRespuestas } from "./nucleo/cache.js";
import { barrerHuerfanos, TallerDeGit } from "./nucleo/taller.js";
import { verificadoresDelPorton, verificadoresDeNpm } from "./nucleo/verificadores.js";
import { cargarFasesExternas, SIN_FASES_EXTERNAS } from "./nucleo/fases.js";
import { carpetaDeDolphin, guardarCosecha } from "./nucleo/archivo.js";
import { podar } from "./nucleo/podar.js";
import { INSTALAR_CON_EL_ENLACE, enlazaDependencias } from "./nucleo/entorno.js";
import { entregadorDeGit, mensajeDeEntrega, ramaActual } from "./nucleo/entrega.js";
import { gitValor } from "./nucleo/git.js";
import { sembrar, type Evento } from "./nucleo/sembrar.js";
import { agenteClaude } from "./agentes/claude.js";
import { agenteAntigravity, agenteCodex } from "./agentes/otros.js";
import { agenteDeCli, motorDeCli } from "./agentes/motores.js";
import { agenteAcp } from "./agentes/acp-motor.js";
import { agenteDeMentira } from "./agentes/mentira.js";
import { verificadorRevisor } from "./agentes/revisor.js";
import { verificadorDePantallaDeLaApp } from "./tester/escalon-pantalla.js";
import { verificadorDeVision } from "./tester/vision.js";
import { verificadorDeUso } from "./tester/uso.js";
import { compilarFallos, escribirParte } from "./nucleo/parte.js";
import { verificadorDeTestsIntactos } from "./nucleo/tests-intactos.js";
import { verificadorDeSeguridad } from "./nucleo/seguridad.js";
import { leerDiff } from "./nucleo/diff.js";
import { join } from "node:path";
import { otroEscalon, repartir, type Estrategia, type Motor, type Reparto } from "./nucleo/router.js";
import { conRelevo } from "./nucleo/relevo.js";
import { leerDesempeno, registrarDesempeno, rendimientoPorModelo, tipoDeTarea } from "./nucleo/desempeno.js";
import { repartirEnfoques } from "./nucleo/enfoques.js";
import { enfoquesDelRepo } from "./nucleo/mejorarse.js";
import { anotar, contextoDePistas, leerNotas, observacionesDe, pistasPara, registrarPistas } from "./nucleo/notas.js";
import { sonar, type Sueno } from "./nucleo/sueno.js";
import { verificadorDeConfigEjecutable } from "./nucleo/config-ejecutable.js";
import { esClonado } from "./nucleo/proyectos.js";
import type { Agente, Cosecha, Verificador } from "./nucleo/tipos.js";
import { antesDeArrancar } from "./nucleo/cupo.js";
import { leerSpecs, verificadorDeSpecs } from "./nucleo/spec.js";

/**
 * Una siembra, armada en UN solo lugar. La usan el CLI, la cola de tareas
 * y lo que corre solo: si cada uno armara la suya, una se quedaría sin la
 * memoria, otra sin la política, y nadie se enteraría de cuál.
 */

export type { Motor } from "./nucleo/router.js";

export interface PedidoDeTarea {
  readonly repo: string;
  readonly tarea: string;
  readonly agente?: Motor;
  /**
   * A quién le pasa la rama si el titular no puede trabajar, en orden (ver nucleo/relevo.ts).
   * Sigue en el MISMO worktree con el traspaso de lo que ya se hizo. Tienen que ser de otra
   * empresa que el titular: el relevo no rota entre cuentas del mismo proveedor.
   */
  readonly relevos?: readonly Motor[];
  readonly modelo?: string;
  /** Calidad, equilibrada o economía: pisa la de dolphin.config.json. */
  readonly estrategia?: Estrategia;
  /** Scripts de npm que forman el portón, en orden. */
  readonly verificar?: readonly string[];
  /** Lo que se le suma al pedido además de la memoria del repo. */
  readonly contexto?: string;
  /** Rutas que ya se conocen antes de escribir: afinan la selección de memoria. */
  readonly rutas?: readonly string[];
  /** Corre solo: el agente sin pedir permisos y la política en el portón. */
  readonly automatico?: boolean;
  /**
   * La tarea vino de afuera (el issue de otro, una idea de la web): lo que
   * deje en la memoria es de afuera y no entra sin el visto bueno del dueño.
   */
  readonly deAfuera?: boolean;
  /** Permisos que una orquestación puede agregar sin limitar Read/Edit/Bash. */
  readonly herramientasAdicionales?: readonly string[];
  /** El dueño puede cancelar una siembra externa mientras corre. */
  readonly senal?: AbortSignal;
}

export interface SiembraPreparada {
  readonly agente: Agente;
  readonly verificadores: readonly Verificador[];
  /** Qué modelo hace cada trabajo: va a la cosecha tal cual. */
  readonly reparto: Reparto;
  /**
   * A esta siembra le toca medir al modelo del que faltan cifras, aunque
   * tenga una sola rama: 1 de cada MEDIR_CADA del mismo tipo de tarea.
   * Medir no abre ramas de más: competir agentes es gastar de más.
   */
  readonly turnoDeMedir?: boolean;
  /** Las notas del corto plazo que viajaron como pistas: al terminar suman una vista (ver notas.ts). */
  readonly pistas?: readonly string[];
  /** La tarea o el repo son de afuera: ni su configuración ni su «preparar» se ejecutan. */
  readonly deAfuera?: boolean;
  /** Qué código ajeno entró al portón: una línea por fase de terceros (ver nucleo/fases.ts). */
  readonly avisos?: readonly string[];
  /**
   * La caja de esta siembra, o `null` si corre afuera (ver nucleo/aislado.ts). Va en la preparada
   * porque es de la siembra: con varias a la vez, la del proceso ya la pisó la que preparó después.
   */
  readonly caja?: CajaDeLaRama | null;
}

/** Cada cuántas siembras de un tipo de tarea, una mide al modelo del que faltan cifras. */
export const MEDIR_CADA = 4;

/** Memoria, perfil, política, motor y fases: todo lo que una siembra necesita antes de empezar. */
/**
 * El modo aislado, si el repo lo pide: la caja en la que va a correr ESTA siembra. Si no hay con qué
 * aislar, falla acá, antes de abrir un solo worktree: no se corre sin caja (ver aislado.ts).
 *
 * Devuelve la caja además de dejarla como la del proceso, y eso no es un detalle: la del proceso la
 * pisa la siembra siguiente, así que es la que se devuelve —la que viaja con la siembra— la que de
 * verdad aísla cuando hay varias a la vez (ver conCaja en agentes/ejecutar.ts). La del proceso queda
 * para lo que no es una siembra: los bots, `dolphin seguir`, un atajo.
 */
async function prepararAislamiento(repo: string): Promise<CajaDeLaRama | null> {
  const pedido = (await leerConfig(repo)).aislado;
  if (!pedido) {
    aislarAgentes(null);
    return null;
  }
  const tipo = await cajaDisponible();
  if (!tipo) throw new Error(SIN_CAJA);
  const caja: CajaDeLaRama = { tipo, config: pedido === true ? {} : pedido };
  aislarAgentes(caja);
  return caja;
}

export async function prepararSiembra(pedido: PedidoDeTarea): Promise<SiembraPreparada> {
  const cupo = await antesDeArrancar({ agente: pedido.agente ?? "mentira", largo: "largo", ahora: new Date() });
  if (!cupo.sigue && cupo.alternativa === "codex" && pedido.agente === "claude") {
    // El traspaso de una siembra no tiene paquete de sesión: cambiar el motor antes de abrir worktrees evita gastar una rama inútil.
    pedido = { ...pedido, agente: "codex" };
  } else if (!cupo.sigue) {
    throw new Error(`no hay cupo para arrancar la siembra hasta ${cupo.hasta.toLocaleString("es-AR")}: ${cupo.motivo}`);
  }
  const caja = await prepararAislamiento(pedido.repo);
  // La carpeta nace ignorada antes que nada: los videos y las capturas del portón llegan antes que la cosecha.
  await carpetaDeDolphin(pedido.repo);
  const memoria = await leerMemoria(pedido.repo);
  // De afuera: la tarea (un issue, una idea de la web) o el repo (entró clonando una URL).
  // Su configuración no se ejecuta, su comando «preparar» no corre (ver config-ejecutable.ts)
  // y, si el que vino de afuera es el repo, su política no puede aflojar la de Dolphin.
  const repoDeAfuera = await esClonado(pedido.repo);
  const deAfuera = pedido.deAfuera === true || repoDeAfuera;
  const politica = pedido.automatico ? await leerPolitica(pedido.repo, { deAfuera: repoDeAfuera }) : undefined;
  const config = await leerConfig(pedido.repo);
  const specs = await leerSpecs(pedido.repo);
  // Las fases que escribió otra persona, cargadas del repo (ver nucleo/fases.ts). De afuera no se
  // cargan: la configuración de un repo clonado no ejecuta código. Una que no carga se saltea.
  const externas = deAfuera ? SIN_FASES_EXTERNAS : await cargarFasesExternas(pedido.repo, config.porton?.fases);
  // Si cada worktree va a tener algún node_modules del repo enlazado: el de la raíz o el de un
  // paquete anidado. Mirar sólo la raíz dejaba sin prohibición a un repo cuya raíz instala y cuyo
  // subpaquete (escritorio/) va enlazado: un `pnpm install` ahí adentro escribe en el de todos.
  const enlaza = await enlazaDependencias(pedido.repo, config.entorno?.dependencias);
  // Quién escribe, quién corrige y quién revisa: el caro escribe, el barato
  // revisa, y las cifras propias del repo en este tipo de tarea corrigen la tabla.
  const configModelos = config.modelos ?? {};
  const tipo = tipoDeTarea(pedido.tarea);
  const delTipo = (await leerDesempeno(pedido.repo)).filter((r) => r.tipo === tipo);
  const reparto = repartir(
    pedido.agente ?? "mentira",
    pedido.estrategia ? { ...configModelos, estrategia: pedido.estrategia } : configModelos,
    pedido.modelo ? { modelo: pedido.modelo } : {},
    { tipo, rendimientos: rendimientoPorModelo(delTipo, tipo) },
  );
  // Se cuentan siembras, no ramas: cada rama deja su fila, y con siembras de dos
  // ramas el turno de medir casi nunca tocaba. Las ramas de una siembra comparten su `cuando`.
  const siembrasDelTipo = new Set(delTipo.map((r) => r.cuando)).size;
  const turnoDeMedir = reparto.explorar !== undefined && siembrasDelTipo % MEDIR_CADA === MEDIR_CADA - 1;
  // Todos los motores reciben el MISMO contexto: la memoria es del proyecto,
  // no del modelo. Y detrás, las pistas del corto plazo que se parecen a la tarea.
  const pistas = pistasPara(await leerNotas(pedido.repo), pedido.tarea);
  const contexto = [
    await contextoDeSiembra(pedido.repo, pedido.tarea, pedido.contexto ?? "", pedido.agente ?? "mentira", pedido.rutas ?? []),
    contextoDePistas(pistas),
  ]
    .filter((parte) => parte !== "")
    .join("\n\n");

  const comun = {
    ...(contexto ? { contexto } : {}),
    ...(politica ? { permisos: "todo" as const } : {}),
  };
  /**
   * El motor `cual`. El titular lleva el modelo que eligió el router; un relevo no, porque ese
   * modelo es de la empresa del titular y el que entra no lo tiene.
   */
  const motor = (cual = pedido.agente, modeloDelRouter = true): Agente => {
    const conModelo = modeloDelRouter && reparto.escribir ? { modelo: reparto.escribir } : {};
    if (cual === "claude") {
      return agenteClaude({
        ...conModelo,
        ...(modeloDelRouter && reparto.corregir ? { modeloCorrector: reparto.corregir } : {}),
        ...(typeof config.silencio === "number" ? { silencio: config.silencio } : {}),
        ...comun,
        // Con node_modules enlazado, instalar escribiría en el del repo (ver entorno.ts).
        ...(politica ? { prohibidos: [...politica.comandosProhibidos, ...(enlaza ? INSTALAR_CON_EL_ENLACE : [])] } : {}),
         ...(pedido.herramientasAdicionales ? { herramientasAdicionales: pedido.herramientasAdicionales } : {}),
        ...(deAfuera ? { soloConfigDelUsuario: true } : {}),
      });
    }
    if (cual === "antigravity") {
      return agenteAntigravity({ ...comun, ...conModelo, ...(deAfuera ? { deAfuera: true } : {}) });
    }
    if (cual === "codex") return agenteCodex({ ...comun, ...conModelo });
    // Cualquier agente que hable ACP. El comando lo dice el repo, así que sumar uno no es código.
    if (cual === "acp") {
      if (!config.acp?.cmd) {
        throw new Error('para usar «--agente acp» hace falta decir con qué comando se lanza: poné «acp» en dolphin.config.json, por ejemplo {"acp":{"cmd":"gemini","args":["--experimental-acp"]}}');
      }
      return agenteAcp({ cmd: config.acp.cmd, ...(config.acp.args ? { args: config.acp.args } : {}), ...(contexto ? { contexto } : {}) });
    }
    // Los demás agentes de terminal: una fila de la tabla de motores.ts.
    const deCli = motorDeCli(cual ?? "");
    if (deCli) return agenteDeCli(deCli, { ...comun, ...conModelo });
    return agenteDeMentira;
  };

  /**
   * El titular, y los relevos detrás si se pidieron. El relevo pasa la rama a otro motor EN EL
   * MISMO worktree cuando el titular no puede trabajar —sin cupo, sin clave, sin sesión—, con el
   * traspaso de lo que ya se hizo. Antes de pagarle el intento a cada uno se mira su cupo, que es
   * lo que el relevo de antes de arrancar ya hace para el titular (ver prepararSiembra).
   */
  const motorConRelevos = (): Agente => {
    const relevos = (pedido.relevos ?? []).filter((r) => r !== pedido.agente);
    if (relevos.length === 0) return motor();
    return conRelevo(
      [{ agente: motor() }, ...relevos.map((r) => ({ agente: motor(r, false) }))],
      {
        disponible: async (nombre) => (await antesDeArrancar({ agente: nombre.split(" ")[0] ?? nombre, largo: "largo", ahora: new Date() })).sigue,
      },
    );
  };

  return {
    // La memoria de respuestas envuelve a cualquier motor: lo ya pagado no se
    // vuelve a pagar. Con el modelo en la clave: si las cifras cambian quién
    // escribe, la respuesta guardada del anterior no se hace pasar por suya.
    // Y con el contexto que recibe: lo que la memoria aprendió después de una siembra que falló tiene que llegarle.
    agente: agenteConMemoria(motorConRelevos(), pedido.repo, reparto.escribir, contexto),
    verificadores: [
      // La configuración que Claude ejecuta sin preguntar no sale en una rama, salvo que se pida: siempre, gratis.
      verificadorDeConfigEjecutable(pedido.tarea),
      ...(politica ? [verificadorDePolitica(politica)] : []),
      ...(specs.length > 0 ? [verificadorDeSpecs()] : []),
      // Ponerse verde cambiando la prueba: con la política estricta, se corta antes de correr nada.
      ...(config.testsExistentes === "cortar" ? [verificadorDeTestsIntactos()] : []),
      // Las tres filtraciones de siempre de una app hecha con agentes: gratis, y siempre, salvo que el repo diga que no.
      ...(config.seguridad === false ? [] : [verificadorDeSeguridad()]),
      ...verificadoresDeMemoria(memoria),
      ...verificadoresDeNpm(pedido.verificar ?? []),
      // Lo que no es npm (pytest, go test…), si el repo lo configuró. De afuera, su configuración no se ejecuta.
      ...(deAfuera ? [] : verificadoresDelPorton(config.porton?.comandos)),
      // Las fases de terceros, con el costo que declaran: el portón las ordena como a cualquier otra.
      ...externas.verificadores,
      // La pantalla, si el repo dice cómo se levanta la app: gratis, después de los tests.
      ...(config.pantalla
        ? [verificadorDePantallaDeLaApp(config.pantalla, { repoBase: pedido.repo, carpetaVideo: join(pedido.repo, ".dolphin", "videos") })]
        : []),
      // Vision: la app recorrida como alguien nuevo y juzgada por otro modelo. A mano: tarda y paga un juez.
      ...(config.pantalla && config.vision
        ? [
            verificadorDeVision(config.pantalla, {
              tarea: pedido.tarea,
              modelo:
                (typeof config.vision === "object" ? config.vision.juez : undefined) ??
                reparto.revisar ??
                otroEscalon(reparto.escribir ?? "sonnet"),
              carpeta: join(pedido.repo, ".dolphin", "vision"),
              ...(typeof config.vision === "object" && config.vision.anchos ? { anchos: config.vision.anchos } : {}),
              ...(config.explorar?.noTocar ? { noTocar: config.explorar.noTocar.map((t) => new RegExp(t, "i")) } : {}),
            }),
          ]
        : []),
      // Uso: un modelo barato maneja la app corriendo (electron o web) y cuenta qué vio. Solo si el repo dice cómo se levanta.
      ...(config.uso
        ? [
            verificadorDeUso(config.uso, {
              tarea: pedido.tarea,
              modelo: config.uso.modelo ?? reparto.revisar ?? otroEscalon(reparto.escribir ?? "sonnet"),
              carpeta: join(pedido.repo, ".dolphin", "uso"),
            }),
          ]
        : []),
      // La revisión independiente: barata, así que el portón la corre después de lo gratis.
      ...(reparto.revisar ? [verificadorRevisor({ tarea: pedido.tarea, modelo: reparto.revisar })] : []),
    ],
    reparto,
    caja,
    ...(turnoDeMedir ? { turnoDeMedir } : {}),
    ...(pistas.length > 0 ? { pistas: pistas.map((n) => n.id) } : {}),
    ...(deAfuera ? { deAfuera } : {}),
    ...(externas.avisos.length > 0 ? { avisos: externas.avisos } : {}),
  };
}

/**
 * ¿Alguna rama de esta siembra sale a medir? Con tres o más, la última;
 * con menos, solo cuando le toca el turno (1 de cada MEDIR_CADA del tipo):
 * medir nunca suma ramas.
 */
export function quienMide(preparada: Pick<SiembraPreparada, "reparto" | "turnoDeMedir">, cantidad: number): string | undefined {
  const { explorar } = preparada.reparto;
  if (!explorar) return undefined;
  return cantidad >= 3 || preparada.turnoDeMedir ? explorar : undefined;
}

export interface OpcionesDeSembrado {
  readonly cantidad?: number;
  readonly rama?: string;
  /** Borrar los worktrees de las ramas que no se eligen. */
  readonly limpiar?: boolean;
  readonly reintentos?: number;
  readonly presupuesto?: number;
  readonly suscripcion?: boolean;
  /** Sobre qué commit se abren los worktrees (por defecto HEAD). */
  readonly base?: string;
  /** El asunto de la bandeja que esta siembra implementa. */
  readonly asunto?: string;
  /** Mandar los eventos al canal en vivo de la consola. */
  readonly transmitir?: boolean;
  readonly alPasar?: (evento: Evento) => void;
  /** Se ejecuta después de escribir y antes del portón, para una retoma del buzón. */
  readonly antesDelPorton?: (universo: import("./nucleo/tipos.js").Universo, agente: import("./nucleo/tipos.js").Agente) => Promise<import("./nucleo/tipos.js").Trabajo | undefined>;
  /** Variables compartidas por los compañeros del equipo. */
  readonly entorno?: Readonly<Record<string, string>>;
  readonly senal?: AbortSignal;
}

export interface Sembrado {
  readonly cosecha: Cosecha;
  readonly donde: string;
  readonly aprendido: Recuerdo | null;
  /** Lo que enseñaron las correcciones que se deshicieron (ver puntos.ts). */
  readonly deshecho: readonly Recuerdo[];
  /** Lo que soñó la memoria al terminar: qué entró, qué espera visto bueno (ver sueno.ts). */
  readonly sueno?: Sueno;
  /** Dónde quedó el parte, si se pudo armar. */
  readonly parte?: string;
}

/**
 * El taller de una siembra: cada worktree, como el repo —dependencias, .env
 * y el comando del repo (ver entorno.ts)—. Lo usan las ramas y la línea base,
 * que se mide en un worktree igual al que recibe cada una.
 */
export async function tallerDeLaSiembra(pedido: PedidoDeTarea, preparada: Pick<SiembraPreparada, "deAfuera">, base?: string): Promise<TallerDeGit> {
  const config = await leerConfig(pedido.repo);
  return new TallerDeGit(pedido.repo, undefined, base, {
    ...(config.entorno ? { config: config.entorno } : {}),
    // La preparada ya lo trae; el pedido, por si la preparada se armó a mano.
    ...(preparada.deAfuera || pedido.deAfuera ? { deAfuera: true } : {}),
  });
}

export async function sembrarTarea(
  pedido: PedidoDeTarea,
  preparada: SiembraPreparada,
  opciones: OpcionesDeSembrado = {},
): Promise<Sembrado> {
  const cantidad = opciones.cantidad ?? 1;
  // Lo que dejó una siembra que cortaron (sus worktrees, trabados con un pid que ya no está), afuera antes de empezar.
  await barrerHuerfanos(pedido.repo).catch(() => 0);
  // El asunto que implementa lo toma ESTE proceso y late mientras trabaja: si se corta, deja de
  // latir y la bandeja lo devuelve (ver liberarCortados). El CLI ya lo tomó al arrancar; tomarlo
  // de nuevo no cambia nada y cubre a quien siembre sin pasar por el CLI.
  const asunto = opciones.asunto;
  if (asunto) await tomarAsunto(pedido.repo, asunto, process.pid).catch(() => null);
  const latido = asunto ? setInterval(() => void latirAsunto(pedido.repo, asunto, process.pid).catch(() => {}), LATIDO_MS) : undefined;
  latido?.unref();
  const taller = await tallerDeLaSiembra(pedido, preparada, opciones.base);
  const transmitir = opciones.transmitir ? await abrirEnVivo(pedido.repo) : undefined;
  transmitir?.({
    tipo: "siembra",
    tarea: pedido.tarea,
    universos: cantidad,
    fases: preparada.verificadores.map((v) => v.nombre),
    agente: preparada.agente.nombre,
  });

  // Desde dónde y en qué rama se siembra: es adonde se mergea después.
  const entregador = entregadorDeGit(pedido.repo);
  const base = await revParse(pedido.repo, opciones.base ?? "HEAD");
  const ramaBase = await ramaActual(pedido.repo);
  const config = await leerConfig(pedido.repo);

  // Los ángulos con que se encara: los de siempre y los que Dolphin aprendió y vos adoptaste (ver
  // nucleo/mejorarse.ts). Sin esto, adoptar una estrategia no cambiaba nada: se guardaba y ninguna
  // siembra la usaba nunca.
  const repartidos = repartirEnfoques(cantidad, await enfoquesDelRepo(pedido.repo));
  // La rama que sale a medir escribe con el modelo del que faltan cifras:
  // la última de tres o más, o la única cuando le toca el turno (ver quienMide).
  const explorar = quienMide(preparada, cantidad);
  const enfoques = explorar ? repartidos.map((e, i) => (i === cantidad - 1 ? { ...e, modelo: explorar } : e)) : repartidos;

  const cosecha = await sembrar({
    tarea: pedido.tarea,
    cantidad,
    // Si la persona tiene una rama que se llama así («dolphin»), git no deja crear
    // «dolphin/…» al lado y no nacía ningún universo: las ramas van con otro nombre.
    rama: (await revParse(pedido.repo, `refs/heads/${opciones.rama ?? "dolphin"}`)) ? `${opciones.rama ?? "dolphin"}-ramas` : (opciones.rama ?? "dolphin"),
    taller,
    agente: preparada.agente,
    // La caja viaja con la siembra: dos a la vez (la cola, el equipo) tienen cada una la suya.
    ...(preparada.caja !== undefined ? { caja: preparada.caja } : {}),
    ...(opciones.entorno ? { entorno: opciones.entorno } : {}),
    ...(opciones.senal ? { senal: opciones.senal } : {}),
    verificadores: [...preparada.verificadores],
    ...(enfoques ? { enfoques } : {}),
    limpiar: opciones.limpiar ?? true,
    reintentos: opciones.reintentos ?? 1,
    ...(opciones.presupuesto !== undefined ? { presupuesto: opciones.presupuesto } : {}),
    alPasar(evento) {
      if (transmitir) {
        const reducido = reducirEvento(evento);
        if (reducido) transmitir(reducido);
      }
      opciones.alPasar?.(evento);
    },
    ...(opciones.antesDelPorton ? { antesDelPorton: opciones.antesDelPorton } : {}),
  });

  // El trabajo terminó: los worktrees que quedan (la elegida, y todas con
  // «guardar el código») no necesitan más el enlace a node_modules, y sin él
  // nadie que los borre a mano —`git worktree remove --force`— se lleva el
  // del repo. Va antes del commit: en POSIX el enlace es un symlink que git
  // no ignora con `node_modules/`.
  for (const c of cosecha.candidatos) await taller.soltar(c.universo);
  // Lo que se reusa la próxima vez es lo que cruzó el portón: lo de las que murieron, no.
  await aprobarRespuestas(cosecha.candidatos.filter((c) => c.vivo).map((c) => c.universo.ruta)).catch(() => {});

  // La rama elegida se ENTREGA: un commit con la identidad del dueño del
  // repo, sin co-autores. Sin esto no hay nada que mergear, ni estado de
  // rama que preguntarle a git. Si git no puede (sin identidad, por
  // ejemplo), la cosecha sale igual: el trabajo sigue en el worktree, y se dice.
  let entregada: Cosecha["entregada"];
  let sinEntregar: string | undefined;
  if (cosecha.ganador && base) {
    const commit = await entregador.commitear(cosecha.ganador.universo.ruta, mensajeDeEntrega(pedido.tarea)).catch((error: unknown) => {
      sinEntregar = lineaDeError(error);
      return undefined;
    });
    if (commit && commit !== base) {
      entregada = { rama: cosecha.ganador.universo.rama, commit, base, ...(ramaBase ? { ramaBase } : {}) };
    }
  }

  // Con suscripción la plata se mide igual, pero no se cuenta como gasto.
  const conSuscripcion = opciones.suscripcion || config.suscripcion === true;
  // Si nadie salió a medir (pocas ramas), la cosecha no lo dice: diría algo que no pasó.
  const { explorar: _sinUsar, ...reparto } = preparada.reparto;
  const final: Cosecha = {
    ...cosecha,
    modelos: explorar ? { ...reparto, explorar } : reparto,
    ...(conSuscripcion ? { suscripcion: true } : {}),
    ...(entregada ? { entregada } : {}),
    ...(sinEntregar ? { sinEntregar } : {}),
  };

  // El parte: lo que pasó, en una página que se abre sola. Si armarlo
  // falla, la siembra sale igual: el parte es para mirar, no para decidir.
  const cuando = new Date().toISOString();
  const parte = await armarParte(pedido.repo, final, cuando).catch(() => undefined);
  const donde = await guardarCosecha({ ...final, ...(parte ? { parte } : {}) }, pedido.repo);
  transmitir?.({
    tipo: "cosecha",
    ...(final.ganador ? { elegida: final.ganador.universo.rama } : {}),
    ...(final.porQueGano ? { porQue: final.porQueGano } : {}),
    ms: final.ms,
    gastado: final.gastado,
    ...(final.suscripcion ? { suscripcion: true } : {}),
  });

  // Cada rama escrita deja su fila en las cifras del repo: es lo que la
  // próxima siembra le pregunta al router. Si no se puede escribir, la
  // siembra ya salió igual: las cifras se ponen al día la próxima vez.
  await registrarDesempeno(pedido.repo, final, cuando).catch(() => 0);

  // El asunto de la bandeja queda hecho si una rama pasó, y vuelve a abierto si no: nunca colgado.
  if (asunto) {
    clearInterval(latido);
    await soltarAsunto(pedido.repo, asunto, process.pid, final.ganador ? "hecho" : "abierto").catch(() => null);
  }

  // La cosecha enseña sola: un fracaso unánime queda recordado para la
  // próxima, y también cada corrección que hubo que deshacer.
  const aprendido = await aprenderDeCosecha(pedido.repo, final);
  const deshecho = await aprenderDeLoDeshecho(pedido.repo, final).catch(() => []);

  // Y todo lo demás va al corto plazo de la memoria, y se sueña: lo que se
  // repite en tareas distintas pasa a la memoria de verdad (ver sueno.ts).
  // Si algo de esto falla, la siembra ya salió: la memoria se pone al día la próxima.
  const vista = { cuando, tarea: pedido.tarea };

  // Los videos y las capturas de Vision no se acumulan para siempre (ver podar.ts).
  await podar(join(pedido.repo, ".dolphin", "videos"), { cuantas: 200, dias: 30 }).catch(() => 0);
  await podar(join(pedido.repo, ".dolphin", "vision"), { cuantas: 60, dias: 30, salvo: ["rubricas"] }).catch(() => 0);
  await podar(join(pedido.repo, ".dolphin", "uso"), { cuantas: 60, dias: 30 }).catch(() => 0);
  const sueno = await (async () => {
    // De afuera también si lo es el REPO (entró clonando): lo que anota no es palabra del dueño.
    await anotar(pedido.repo, observacionesDe(final, { deAfuera: preparada.deAfuera === true || pedido.deAfuera === true }), vista);
    await registrarPistas(pedido.repo, preparada.pistas ?? [], { ...vista, relevancia: final.ganador ? 0.9 : 0.4 });
    return sonar(pedido.repo, new Date(cuando));
  })().catch(() => undefined);

  return {
    cosecha: { ...final, ...(parte ? { parte } : {}) },
    donde,
    aprendido,
    deshecho,
    ...(sueno ? { sueno } : {}),
    ...(parte ? { parte: join(pedido.repo, ".dolphin", "partes", parte) } : {}),
  };
}

/** El diff de la elegida (si su worktree sigue), el compilado de los fallos (si hay ffmpeg) y el HTML. */
async function armarParte(repo: string, cosecha: Cosecha, cuando: string): Promise<string> {
  const elegida = cosecha.ganador?.universo;
  const diff = elegida ? await leerDiff(elegida.ruta, elegida.base ? { base: elegida.base } : {}).catch(() => undefined) : undefined;
  const videos = cosecha.candidatos.flatMap((c) => c.pasadas.flatMap((p) => p.videos ?? []));
  const compilado =
    videos.length > 0 ? await compilarFallos(join(repo, ".dolphin", "videos"), videos, `fallos-${cuando.replace(/[:.]/g, "-")}.webm`) : undefined;
  return escribirParte({ cosecha, cuando, repo, ...(diff?.hay ? { diff: diff.texto } : {}), ...(compilado ? { compilado } : {}) });
}

/** La línea que explica un error de git (`fatal:`, `error:`), no el comando entero que lo tiró. */
function lineaDeError(error: unknown): string {
  const crudo = String((error as { stderr?: string }).stderr || (error as Error).message || error);
  const lineas = crudo.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lineas.find((l) => /^(fatal|error):/i.test(l)) ?? lineas[0] ?? "git no contestó").slice(0, 300);
}

async function revParse(repo: string, ref: string): Promise<string | undefined> {
  try {
    return await gitValor(["rev-parse", ref], repo);
  } catch {
    return undefined;
  }
}
