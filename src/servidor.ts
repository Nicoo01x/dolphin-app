import { homedir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, open, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { carpetaDeDolphin, leerUltimaCosecha, listarCosechas, leerCosecha } from "./nucleo/archivo.js";
import { rutaEnVivo } from "./nucleo/en-vivo.js";
import {
  aprobarCandidato,
  descartarCandidato,
  editarDicho,
  leerMemoria,
  leerUsos,
  olvidarRecuerdo,
  prenderRecuerdo,
  recordar,
  recordarCandidato,
  sinUsoEn30Dias,
} from "./nucleo/memoria.js";
import { guardarPerfil, leerPerfil } from "./nucleo/perfil.js";
import { cambiarEstado, carpetaDeBandeja, leerBandeja, liberarCortados, marcarParaLaNoche, promptDeImplementacion } from "./nucleo/bandeja.js";
import { anotarDescubrimiento, seAnoto } from "./nucleo/descubrimientos-al-tablero.js";
import { leerGuardian } from "./nucleo/guardian.js";
import { leerCola } from "./nucleo/cola.js";
import { descartarRama, estadoDeRama, mergearRama } from "./nucleo/entrega.js";
import { abrirPr, correrDeVerdad } from "./nucleo/pr.js";
import { correrPorSsh, maquinaDelTurno } from "./nucleo/ssh.js";
import { leerConfig } from "./nucleo/config.js";
import { actualizarTurno, agendar, crearProgramador, leerCalendario, salioElTurno, type Turno } from "./nucleo/calendario.js";
import { claveDeRuta as claveDeRepo } from "./nucleo/escritura.js";
import { matarArbol } from "./agentes/ejecutar.js";
import { anotarCosecha } from "./nucleo/archivo.js";
import { leerDiff } from "./nucleo/diff.js";
import { armarActividad, TOPE_DE_ACTIVIDAD } from "./nucleo/actividad.js";
import { destilar, entrenar, leerEntrenamiento, olvidarAprendido, type Destilador } from "./nucleo/entrenar.js";
import { leerConClaude } from "./agentes/leer-con-claude.js";
import { valorarIdeas, type Valorador } from "./nucleo/valorar.js";
import { pasarPorElPorton, type PasadaAMano } from "./nucleo/porton-a-mano.js";
import { verificadorRevisor, type CorrerRevisor } from "./agentes/revisor.js";
import type { Verificador } from "./nucleo/tipos.js";

/** Valorar por defecto: el CLI de Claude sin herramientas. Todo va en el pedido, y con Read podía
 * gastar las vueltas leyendo y quedarse sin contestar (error_max_turns). */
const valoradorConClaude: Valorador = (prompt, repo) =>
  leerConClaude(prompt, { modelo: "sonnet", vueltas: 2, herramientas: [], cwd: repo, tope: 180_000 });
import { motivoDeAprobacion } from "./nucleo/tests-intactos.js";
import { armarInforme, leerTipo } from "./nucleo/rendimiento.js";
import { clonarProyecto, idDe, leerProyectos, quitarProyecto, sumarProyecto } from "./nucleo/proyectos.js";
import { leerNotas } from "./nucleo/notas.js";
import { alcanza, aprobarNota, descartarNota, puntuar, sonar, UMBRALES } from "./nucleo/sueno.js";
import { listarPlanes, type Planificador } from "./nucleo/plan.js";
import { MOTORES, motorDe, repartir, type Motor } from "./nucleo/router.js";
import { aprobarPlanPedido, planPedido, type CorredorDePlan } from "./servidor-plan.js";
import { correrBandeja } from "./autopiloto.js";
import { cuerpoDeLaConsola, json, texto } from "./servidor-comun.js";
import { comoEntra, cookieDelPase, PAGINA_SIN_PASE, sinElPase } from "./nucleo/puerta.js";
import { cerrarLosOlvidados, cerrarPreview, cerrarTodosLosPreviews, previewsAbiertos, servirPreview, servirUpgradeDePreview } from "./nucleo/preview.js";
import { abrirPreviewDeRama } from "./nucleo/preview-de-rama.js";
import { fasesDelPaquete } from "./nucleo/verificadores.js";
import { gitDice } from "./nucleo/git.js";
import { entornoDeDolphin } from "./nucleo/electron.js";
import { rutaDeBots } from "./servidor-bots.js";
import { rutaDeGit } from "./servidor-git.js";
import { rutaDelTablero } from "./servidor-tablero.js";
import { rutaDelEquipoDeTarjeta, type CorredorDeTarjeta } from "./servidor-tarjeta-equipo.js";
import { rutaDelMasterPrompt } from "./servidor-master-prompt.js";
import { rutaDeLaRamaDeTarjeta } from "./servidor-tarjeta-rama.js";
import type { Mejorador } from "./nucleo/master-prompt.js";
import type { PreguntarAGh } from "./nucleo/vista-git.js";

/**
 * El servidor de la pantalla.
 *
 * Node pelado, sin dependencias: la UI son tres archivos estáticos y un
 * par de endpoints que leen lo que el núcleo dejó en `.dolphin/`. Meter un
 * framework acá sería agregarle 40 paquetes a una herramienta que se vende
 * por no gastar de más.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** La consola construida (ui/dist) y, sin build, sus estáticos sueltos. */
const CONSOLA = join(RAIZ, "ui", "dist");
const PUBLICO = join(RAIZ, "ui", "public");

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  // Las fuentes se sirven de acá: la pantalla no pide nada a internet, así
  // que se ve igual en un VPS sin salida que en la máquina de uno.
  ".woff2": "font/woff2",
};

export interface OpcionesServidor {
  readonly repo: string;
  readonly puerto?: number;
  /** Quién lanza una siembra pedida desde la consola. Se inyecta en los tests. */
  readonly sembrar?: (pedido: PedidoDeSiembra) => unknown;
  /** Quién lanza una cola de tareas. Se inyecta en los tests. */
  readonly encolar?: (pedido: PedidoDeCola) => void;
  /** El reloj del calendario: prendido por defecto. */
  readonly calendario?: boolean;
  /** Cada cuánto mira el calendario. */
  readonly relojCalendarioMs?: number;
  /**
   * Los proyectos de la persona (ver proyectos.ts): con esto la consola lista
   * los repos, cambia de uno a otro con `?p=` y suma o clona. Sin esto, un
   * solo repo, como siempre (y los tests no tocan ~/.dolphin).
   */
  readonly proyectos?: { readonly hogar: string };
  /** Quién piensa los planes de Thinking. Se inyecta en los tests; por defecto, el CLI de Claude. */
  readonly planificar?: Planificador;
  /** Quién corre un plan aprobado. Se inyecta en los tests; por defecto, la cola en un proceso aparte. */
  readonly correrPlan?: CorredorDePlan;
  /** Quién corre el equipo de una tarjeta con su «dale». Se inyecta en los tests; por defecto, un proceso aparte. */
  readonly correrTarjeta?: CorredorDeTarjeta;
  /** Quién mejora el Master Prompt. Se inyecta en los tests; por defecto, el CLI de Claude en solo lectura. */
  readonly mejorarPrompt?: Mejorador;
  /** La casa donde buscar las memorias de otros modelos (~/.claude, ~/.codex, ~/.gemini). Se inyecta en los tests. */
  readonly casa?: string;
  /** Quién destila lo encontrado. Se inyecta en los tests; por defecto, el CLI de Claude en solo lectura. */
  readonly destilador?: Destilador;
  /** Quién valora las ideas de la bandeja. Se inyecta en los tests; por defecto, el CLI de Claude en solo lectura. */
  readonly valorador?: Valorador;
  /** Las fases del portón a mano. Se inyectan en los tests; por defecto, las del package.json del repo. */
  readonly verificadoresAMano?: readonly Verificador[];
  /** Quién le pregunta al revisor del portón a mano. Por defecto, el CLI de Claude; los tests lo inyectan. */
  readonly correrRevisor?: CorrerRevisor;
  /** En la demo, los bots nuevos usan el motor local que no gasta cuota. */
  readonly demo?: boolean;
  /** Cómo se le pregunta a `gh` por issues y PR. Los tests lo inyectan. */
  readonly preguntarAGh?: PreguntarAGh;
  /** El pase de la consola. Si no se da, se genera uno nuevo con cada arranque. */
  readonly token?: string;
  /**
   * El host que publica el túnel («algo.trycloudflare.com»), cuando la consola se abrió al
   * teléfono con `--tunel`. Sin esto no entra NADA que no sea de esta máquina; con esto, lo que
   * venga de ese host tiene que traer el pase en cada pedido (ver nucleo/puerta.ts).
   *
   * Es una función y no un texto porque el túnel se abre DESPUÉS de escuchar —necesita el puerto,
   * que lo elige el sistema—, así que cuando el servidor se arma todavía no tiene nombre.
   */
  readonly hostDeAfuera?: () => string | undefined;
}

export function crearServidor(opciones: OpcionesServidor) {
  // El pase de la consola: viaja adentro de la página que ESTE servidor
  // sirve, y el POST que siembra lo exige. Nace de nuevo con cada arranque.
  const token = opciones.token ?? randomBytes(16).toString("hex");
  // El host del túnel se pregunta en cada pedido: el túnel puede abrirse después de escuchar.
  const deAfuera = () => opciones.hostDeAfuera?.()?.toLowerCase();
  const sembradorDe = (repo: string) => opciones.sembrar ?? sembradorPorDefecto(repo);
  const encoladorDe = (repo: string) => opciones.encolar ?? ((pedido: PedidoDeCola) => void lanzarCola(repo, pedido));

  // El servidor es el proceso que queda prendido: también es el reloj del
  // calendario, que lanza los turnos a su hora sin que nadie toque nada.
  // Uno por proyecto: cada repo tiene su agenda.
  // La misma carpeta escrita de dos maneras («D:/x» y «D:\x») es un solo
  // programador: con dos, el mismo turno se lanzaba dos veces.
  const programadores = new Map<string, ReturnType<typeof crearProgramador>>();
  const asegurarProgramador = (repo: string) => {
    const clave = claveDeRepo(repo);
    if (opciones.calendario === false || programadores.has(clave)) return;
    programadores.set(clave, crearProgramador(repo, (turno, senal) => correrTurno(repo, turno, senal, opciones.sembrar, opciones.casa), opciones.relojCalendarioMs ?? 30_000));
  };
  const cortarTurno = (repo: string, id: string) => programadores.get(claveDeRepo(repo))?.cortar(id) ?? false;
  asegurarProgramador(opciones.repo);
  // La última pasada del portón a mano de cada repo, y si sigue corriendo.
  const portones = new Map<string, { corriendo: boolean; pasada?: PasadaAMano }>();

  // Los proyectos de la persona (ver proyectos.ts), solo si la consola los
  // pidió: un servidor de un solo repo —los tests— no toca ~/.dolphin.
  const hogar = opciones.proyectos?.hogar;
  if (hogar !== undefined) {
    // La agenda de cada proyecto corre aunque nadie abra la consola.
    void leerProyectos(hogar).then((lista) => lista.forEach((p) => asegurarProgramador(p.ruta)));
  }
  // El repo del arranque entra a la lista la primera vez que hace falta, y
  // se espera ahí: nada de git corriendo de fondo cuando se cierra el servidor.
  let alta: Promise<unknown> | undefined;
  const registrarElDelArranque = () => (alta ??= hogar === undefined ? Promise.resolve() : sumarProyecto(opciones.repo, hogar).catch(() => {}));

  /** El repo de un pedido: el proyecto que dice `?p=`, o el del arranque. `null` si no está en la lista. */
  const repoDelPedido = async (p: string | null): Promise<string | null> => {
    if (!p || hogar === undefined) return opciones.repo;
    await registrarElDelArranque();
    const proyecto = (await leerProyectos(hogar)).find((x) => x.id === p);
    if (!proyecto) return null;
    asegurarProgramador(proyecto.ruta);
    return proyecto.ruta;
  };

  const servidor = createServer(async (pedido, respuesta) => {
    const url = new URL(pedido.url ?? "/", "http://local");
    const ruta = url.pathname;

    // Cualquier pedido, no solo los que escriben: con un dominio ajeno que
    // resuelve a 127.0.0.1, un GET le leía a esa página el pase y el código.
    // Con `--tunel` hay una segunda puerta —el teléfono— y esa SÍ pide el pase en cada pedido:
    // la dirección del túnel la puede abrir cualquiera (ver nucleo/puerta.ts).
    const entrada = comoEntra(pedido, url, { pase: token, ...(deAfuera() ? { hostDeAfuera: deAfuera()! } : {}) });
    if (entrada.como === "ajeno") return texto(respuesta, 403, "solo desde esta máquina");
    if (entrada.como === "sin-pase") {
      respuesta.writeHead(401, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return respuesta.end(PAGINA_SIN_PASE);
    }
    // Entró con el pase en la dirección: se cambia por una cookie y se saca de la URL, que es lo
    // que queda en el historial, en los `Referer` y en la pantalla de quien esté al lado.
    if (entrada.como === "de-afuera" && url.searchParams.has("pase")) {
      respuesta.writeHead(302, { location: sinElPase(url), "set-cookie": cookieDelPase(token), "cache-control": "no-store" });
      return respuesta.end();
    }

    try {
      // El preview va primero y sin pase: es el iframe de la consola pidiendo la app de una rama
      // por nuestro origen, que es lo único que permite inspeccionarla (ver nucleo/preview.ts).
      // Abrirlo sí pide pase; esto ya pasó por hostLocal, como todo lo demás.
      if (servirPreview(ruta, pedido, respuesta)) return;
      if (await rutaDeBots(ruta, pedido, respuesta, token, opciones.demo ?? false)) return;
      // Los proyectos mismos: la lista, su logo, sumar, clonar y sacar.
      if (ruta.startsWith("/api/proyectos")) {
        if (hogar === undefined) {
          // Leer la lista no es un error aunque no haya lista: un 404 acá ensucia la consola del navegador.
          if (ruta === "/api/proyectos" && pedido.method === "GET") return json(respuesta, 200, { solo: true, delArranque: null, proyectos: [] });
          return json(respuesta, 404, { ok: false, porQue: "este servidor trabaja con un solo repo" });
        }
        await registrarElDelArranque();
        return await proyectosPedidos(ruta, url, pedido, respuesta, token, hogar, opciones.repo, asegurarProgramador);
      }

      // El proyecto se valida en lo que lee o escribe datos; la página se
      // sirve igual, y es la pantalla la que cuenta qué pasó.
      const deDatos = ruta.startsWith("/api/") || ruta === "/en-vivo" || /^\/(videos|partes|bandeja)\//.test(ruta);
      const repo = deDatos ? await repoDelPedido(url.searchParams.get("p")) : opciones.repo;
      if (repo === null) return json(respuesta, 404, { ok: false, porQue: "Ese proyecto no está en tu lista: sumalo desde la barra." });
      // Ramas, commits e issues del repo, para la vista «Git» de la consola (ver servidor-git.ts).
      if (await rutaDeGit(ruta, url, repo, respuesta, opciones.preguntarAGh)) return;
      // Master Prompt: las capturas y el prompt mejorado (ver servidor-master-prompt.ts).
      if (await rutaDelMasterPrompt(ruta, url, pedido, respuesta, repo, token, { ...(opciones.mejorarPrompt ? { mejorador: opciones.mejorarPrompt } : {}), demo: opciones.demo ?? false })) return;
      // El tablero: las tarjetas del proyecto (ver servidor-tablero.ts).
      // El «dale» de una tarjeta: el plan del líder y el equipo que la hace (ver servidor-tarjeta-equipo.ts).
      if (
        await rutaDelEquipoDeTarjeta(ruta, pedido, respuesta, repo, token, {
          ...(opciones.planificar ? { planificador: opciones.planificar } : {}),
          demo: opciones.demo ?? false,
          correr: opciones.correrTarjeta ?? ((r, p) => void lanzarDolphin(r, "equipo-cli.ts", `equipo · tarjeta ${p.tarjeta}`, ["--repo", r, "--tarjeta", p.tarjeta, "--plan", p.plan, "--agente", p.agente, "--sin-tablero"])),
        })
      ) return;
      // Revisar la rama de una tarjeta sin salir de la tarjeta (ver servidor-tarjeta-rama.ts).
      if (await rutaDeLaRamaDeTarjeta(ruta, pedido, respuesta, repo, token)) return;
      if (await rutaDelTablero(ruta, pedido, respuesta, repo, token)) return;
      const sembrar = sembradorDe(repo);
      const encolarTareas = encoladorDe(repo);

      if (ruta === "/api/cosecha") {
        const cosecha = await buscarCosecha(repo, url.searchParams.get("id"));
        // Con la política «aprobar», la pantalla dice por qué ANTES del
        // clic, no después de un rechazo.
        const aprobacion = cosecha?.entregada
          ? motivoDeAprobacion((await leerConfig(repo)).testsExistentes, cosecha.ganador)
          : null;
        // Sin cosecha no es un error: es el estado vacío, y la pantalla
        // tiene que poder distinguirlo de "se rompió algo".
        return json(respuesta, 200, {
          repo: repo,
          cosecha: cosecha ?? null,
          // Cuáles se pueden abrir todavía. La siembra limpia a los
          // perdedores, así que sin esto la pantalla ofrece «ver el diff»
          // de cinco universos y cuatro contestan que ya no están.
          conWorktree: cosecha ? await worktreesVivos(cosecha) : [],
          // El estado de la rama se le pregunta a git en cada pedido: si la
          // mergeaste a mano en la terminal, la consola también se entera.
          ...(cosecha?.entregada ? { estadoRama: await estadoConPr(repo, cosecha) } : {}),
          // Se puede abrir un PR si hay adonde subir la rama.
          ...(cosecha?.entregada ? { puedePr: await tieneOrigin(repo) } : {}),
          ...(aprobacion ? { pideAprobacion: aprobacion } : {}),
        });
      }

      if (ruta === "/api/historial") {
        const rutas = await listarCosechas(repo, 20);
        const cosechas = await Promise.all(
          rutas.map(async (r) => {
            const c = await leerCosecha(r).catch(() => null);
            return c ? { ...resumir(c), id: basename(r) } : null;
          }),
        );
        return json(respuesta, 200, { cosechas: cosechas.filter((c) => c !== null) });
      }

      if (ruta === "/api/actividad") {
        // Se arma cada vez de lo que ya está en disco: no hay un registro
        // aparte que pueda quedar distinto de las cosechas o de la bandeja.
        const rutas = await listarCosechas(repo, 30);
        const leidas = await Promise.all(
          rutas.map(async (r) => {
            const cosecha = await leerCosecha(r).catch(() => null);
            return cosecha ? { id: basename(r), cosecha } : null;
          }),
        );
        const [bandeja, calendario, memoria] = await Promise.all([
          leerBandeja(repo),
          leerCalendario(repo),
          leerMemoria(repo),
        ]);
        const actividad = armarActividad({
          cosechas: leidas.filter((x) => x !== null),
          asuntos: bandeja.asuntos,
          turnos: calendario.turnos,
          recuerdos: memoria.recuerdos,
        });
        // Recortada: hubo más de lo que entra, y la consola lo dice («las últimas 60»).
        return json(respuesta, 200, { actividad, recortada: actividad.length >= TOPE_DE_ACTIVIDAD });
      }

      if (ruta === "/api/guardian") {
        // Solo se lee: Guardian corre con su comando (npm run guardian), no desde la consola.
        return json(respuesta, 200, await leerGuardian(repo));
      }

      if (ruta === "/api/rendimiento") {
        // Lo mismo que consulta el router, a la vista: por modelo, por fase y la decisión.
        return json(respuesta, 200, await armarInforme(repo, leerTipo(url.searchParams.get("tipo"))));
      }

      if (ruta === "/api/diff") {
        const cosecha = await buscarCosecha(repo, url.searchParams.get("id"));
        const pedido = url.searchParams.get("u") ?? "";

        // La ruta del worktree NUNCA viene del navegador: se busca el
        // candidato por id dentro de la cosecha y se usa la ruta que el
        // núcleo guardó. Si el cliente mandara la ruta, `/api/diff` sería
        // «corré git en cualquier carpeta de esta máquina».
        const candidato = cosecha?.candidatos.find((c) => c.universo.id === pedido);
        if (!candidato) return json(respuesta, 404, { hay: false, porQue: "Ese universo no está en la última cosecha." });

        // La elegida se lee de sus commits si su worktree ya no está (mergearla lo limpia).
        const entregada = cosecha?.entregada && cosecha.ganador?.universo.id === candidato.universo.id ? cosecha.entregada : undefined;
        const base = entregada?.base ?? candidato.universo.base;
        return json(
          respuesta,
          200,
          await leerDiff(candidato.universo.ruta, {
            ...(base ? { base } : {}),
            ...(entregada ? { commits: { repo, base: entregada.base, commit: entregada.commit } } : {}),
          }),
        );
      }

      if (ruta === "/en-vivo") {
        return enVivo(repo, pedido, respuesta);
      }

      if (ruta === "/api/sembrar" && pedido.method === "POST") {
        return await sembrarPedido(pedido, respuesta, token, sembrar);
      }

      if (ruta === "/api/live" && pedido.method === "POST") {
        return await pedidoEnVivo(pedido, respuesta, token, sembrar);
      }

      // La app de una rama, adentro de la consola (ver nucleo/preview.ts). Abrirla levanta un
      // proceso, así que pide el pase; mirarla es el proxy de más arriba, que ya pasó por hostLocal.
      if (ruta === "/api/previews" && pedido.method === "GET") {
        return json(respuesta, 200, { previews: previewsAbiertos() });
      }
      if (ruta === "/api/preview" && pedido.method === "POST") {
        const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
        if (!datos) return;
        const rama = typeof datos.rama === "string" ? datos.rama.trim() : "";
        if (rama === "") return json(respuesta, 400, { ok: false, porQue: "falta la rama" });
        try {
          return json(respuesta, 200, { ok: true, preview: await abrirPreviewDeRama(repo, rama) });
        } catch (error) {
          return json(respuesta, 400, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
        }
      }
      if (ruta === "/api/preview/cerrar" && pedido.method === "POST") {
        const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
        if (!datos) return;
        const id = typeof datos.id === "string" ? datos.id : "";
        return json(respuesta, 200, { ok: await cerrarPreview(id) });
      }

      if (ruta === "/api/memoria" && pedido.method === "GET") {
        const [memoria, usos, perfil, cortoPlazo, suenos] = await Promise.all([
          leerMemoria(repo),
          leerUsos(repo),
          leerPerfil(repo),
          enObservacion(repo),
          ultimosSuenos(repo),
        ]);
        const ahora = new Date();
        const recuerdos = memoria.recuerdos.map((r) => ({
          ...r,
          usos: usos[r.id]?.usos ?? 0,
          ...(usos[r.id]?.ultimoUso ? { ultimoUso: usos[r.id]!.ultimoUso } : {}),
          sinUso: r.activo && !r.candidato && sinUsoEn30Dias(usos[r.id], ahora, r.creado),
        }));
        return json(respuesta, 200, { ...memoria, recuerdos, usos, perfil, ...cortoPlazo, suenos });
      }

      if (ruta === "/api/memoria" && pedido.method === "POST") {
        return await memoriaPedida(repo, pedido, respuesta, token);
      }

      // Entrenar al delfín: qué memorias de otros modelos trajo (null: nunca se entrenó este repo).
      if (ruta === "/api/entrenamiento" && pedido.method === "GET") {
        return json(respuesta, 200, { entrenamiento: await leerEntrenamiento(repo) });
      }

      if (ruta === "/api/entrenamiento" && pedido.method === "POST") {
        return await entrenamientoPedido(repo, pedido, respuesta, token, opciones);
      }

      if (ruta === "/api/calendario" && pedido.method === "GET") {
        // Con el calendario van los hosts configurados: es lo que ofrece «Dónde», con adónde va cada uno.
        const configurados = (await leerConfig(repo)).hosts ?? {};
        const destinos = Object.fromEntries(Object.entries(configurados).map(([nombre, h]) => [nombre, h.destino]));
        return json(respuesta, 200, { ...(await leerCalendario(repo)), hosts: Object.keys(configurados), destinos });
      }

      if (ruta === "/api/calendario" && pedido.method === "POST") {
        return await calendarioPedido(repo, pedido, respuesta, token, (id) => cortarTurno(repo, id));
      }

      if (ruta === "/api/rama" && pedido.method === "POST") {
        return await ramaPedida(repo, pedido, respuesta, token);
      }

      if (ruta === "/api/cola" && pedido.method === "GET") {
        return json(respuesta, 200, await leerCola(repo));
      }

      if (ruta === "/api/cola" && pedido.method === "POST") {
        return await colaPedida(pedido, respuesta, token, encolarTareas);
      }

      if (ruta === "/api/planes" && pedido.method === "GET") {
        return json(respuesta, 200, { planes: await listarPlanes(repo) });
      }

      if (ruta === "/api/plan" && pedido.method === "POST") {
        return await planPedido(repo, pedido, respuesta, token, opciones.planificar);
      }

      if (ruta === "/api/plan/aprobar" && pedido.method === "POST") {
        return await aprobarPlanPedido(repo, pedido, respuesta, token, opciones.correrPlan ?? ((r, p) => void lanzarPlan(r, p)));
      }

      // El portón a mano: las fases del repo sobre la carpeta de esta consola, cuando se las pide
      // el estudio de la app. Una pasada por repo a la vez; la consola la pregunta mientras corre.
      if (ruta === "/api/porton" && pedido.method === "GET") {
        const estado = portones.get(claveDeRepo(repo));
        return json(respuesta, 200, { corriendo: estado?.corriendo ?? false, pasada: estado?.pasada ?? null });
      }
      if (ruta === "/api/porton" && pedido.method === "POST") {
        const cuerpo = await cuerpoDeLaConsola(pedido, respuesta, token, 64_000);
        if (!cuerpo) return;
        const clave = claveDeRepo(repo);
        const actual = portones.get(clave);
        if (actual?.corriendo) return json(respuesta, 409, { ok: false, porQue: "ya está pasando por el portón", pasada: actual.pasada ?? null });
        const estado: { corriendo: boolean; pasada?: PasadaAMano } = { corriendo: true };
        portones.set(clave, estado);
        const revision = await revisionAMano(repo, cuerpo, opciones.correrRevisor);
        void pasarPorElPorton(repo, {
          ...(opciones.verificadoresAMano ? { verificadores: opciones.verificadoresAMano } : {}),
          ...(revision ? { revision } : {}),
          alCambiar: (pasada) => (estado.pasada = pasada),
        })
          .catch((error: unknown) => {
            estado.pasada = { desde: new Date().toISOString(), hasta: new Date().toISOString(), fases: [{ nombre: "portón", estado: "fallo", detalle: error instanceof Error ? error.message : String(error) }] };
          })
          .finally(() => (estado.corriendo = false));
        return json(respuesta, 202, { ok: true, pasada: estado.pasada ?? null });
      }

      if (ruta === "/api/bandeja" && pedido.method === "GET") {
        // Lo que quedó «implementando» de una siembra que ya no corre vuelve a abierto antes de mostrarse.
        await liberarCortados(repo).catch(() => []);
        return json(respuesta, 200, await leerBandeja(repo));
      }

      if (ruta === "/api/bandeja" && pedido.method === "POST") {
        return await bandejaPedida(repo, pedido, respuesta, token, sembrar, opciones.valorador);
      }

      if (ruta.startsWith("/videos/") && pedido.method === "GET") {
        // Los videos del explorador. Solo el nombre del archivo, y con Range:
        // sin eso el navegador no puede saltar al segundo de un error.
        const nombre = basename(decodeURIComponent(ruta));
        // La portada de un video: la captura con el problema resaltado.
        if (/^[\w@.-]+\.png$/.test(nombre)) {
          try {
            const contenido = await readFile(join(repo, ".dolphin", "videos", nombre));
            respuesta.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
            return respuesta.end(contenido);
          } catch {
            return texto(respuesta, 404, "esa portada no está");
          }
        }
        if (!/^[\w@.-]+\.webm$/.test(nombre)) return texto(respuesta, 404, "no");
        return await servirVideo(join(repo, ".dolphin", "videos", nombre), pedido, respuesta);
      }

      if (ruta.startsWith("/partes/") && pedido.method === "GET") {
        // El parte de una siembra: un HTML hecho por dolphin. Solo el nombre,
        // nadie sale de la carpeta con un «../». Sus videos piden ../videos/.
        const nombre = basename(decodeURIComponent(ruta));
        if (!/^[\w.-]+\.html$/.test(nombre)) return texto(respuesta, 404, "no");
        try {
          const contenido = await readFile(join(repo, ".dolphin", "partes", nombre));
          // Abierto desde otro proyecto, sus videos tienen que pedirse a ESE proyecto.
          const p = url.searchParams.get("p");
          const html = p
            ? contenido.toString("utf8").replace(/(\.\.\/videos\/[\w@.%-]+)(?=["'#])/g, `$1?p=${encodeURIComponent(p)}`)
            : contenido;
          respuesta.writeHead(200, { "content-type": TIPOS[".html"]!, "cache-control": "no-store" });
          return respuesta.end(html);
        } catch {
          return texto(respuesta, 404, "ese parte no está");
        }
      }

      if (ruta.startsWith("/bandeja/") && pedido.method === "GET") {
        // Las capturas de los errores. Solo el nombre del archivo: nadie
        // sale de la carpeta de la bandeja con un «../».
        const nombre = basename(ruta);
        if (!/^[\w.-]+\.png$/.test(nombre)) return texto(respuesta, 404, "no");
        try {
          const contenido = await readFile(join(carpetaDeBandeja(repo), nombre));
          respuesta.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
          return respuesta.end(contenido);
        } catch {
          return texto(respuesta, 404, "esa captura no está");
        }
      }

      if (ruta === "/favicon.ico") {
        // Sin esto el navegador deja un 404 en la consola de cada visita, y
        // una consola sucia es lo primero que mira alguien que desconfía.
        respuesta.writeHead(204);
        return respuesta.end();
      }

      const archivo = ruta === "/" ? "index.html" : ruta.replace(/^\//, "");
      // La consola construida manda; sin build, los estáticos de ui/public
      // (fuentes, logos) se sirven igual para que los tests no dependan de Vite.
      for (const base of [CONSOLA, PUBLICO]) {
        // Nadie sale de la carpeta de la UI: sin esto, /../../.env se sirve solo.
        const destino = join(base, archivo);
        if (!destino.startsWith(base)) return texto(respuesta, 403, "no");
        try {
          const contenido = await readFile(destino);
          // El pase viaja en la página: es la única manera de que lo tenga
          // la consola y no cualquier otro sitio abierto en el navegador.
          if (archivo === "index.html") {
            const html = contenido
              .toString("utf8")
              .replace("</head>", `<meta name="dolphin-token" content="${token}"></head>`);
            // Sin caché: lleva el pase de ESTA corrida del servidor. Una copia vieja
            // mandaría el pase anterior y, después de reiniciar, ninguna acción andaría.
            respuesta.writeHead(200, { "content-type": TIPOS[".html"]!, "cache-control": "no-store" });
            return respuesta.end(html);
          }
          respuesta.writeHead(200, {
            "content-type": TIPOS[extname(destino)] ?? "application/octet-stream",
            // Lo que Vite construye lleva el hash en el nombre: no cambia nunca.
            ...(archivo.startsWith("assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {}),
          });
          return respuesta.end(contenido);
        } catch {
          // no está en esta base: se prueba la siguiente
        }
      }

      if (ruta === "/") {
        return texto(respuesta, 503, "La consola no está construida todavía: corré `npm run ui:build` y refrescá.");
      }
      texto(respuesta, 404, "no está");
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
      texto(respuesta, codigo, codigo === 404 ? "no está" : "se rompió algo acá adentro");
    }
  });
  // El recambio en caliente del preview: sin esto el cliente de Vite no conecta y la app de la
  // rama se recarga en loop adentro del iframe.
  servidor.on("upgrade", (pedido, socket, cabeza) => {
    // Por el túnel también pide el pase: el websocket del preview sirve la app de una rama, y
    // esa es la misma información que la pantalla.
    const entrada = comoEntra(pedido, new URL(pedido.url ?? "/", "http://local"), {
      pase: token,
      ...(deAfuera() ? { hostDeAfuera: deAfuera()! } : {}),
    });
    if (entrada.como !== "local" && entrada.como !== "de-afuera") return socket.destroy();
    if (!servirUpgradeDePreview(pedido, socket, cabeza)) socket.destroy();
  });
  // Los previews que nadie mira: un `npm run dev` por rama consume CPU para nadie.
  const relojDePreviews = setInterval(() => void cerrarLosOlvidados(), 60_000);
  relojDePreviews.unref();
  servidor.on("close", () => {
    clearInterval(relojDePreviews);
    for (const programador of programadores.values()) programador.detener();
    // Y se apagan: el servidor que se cierra no deja dev servers prendidos.
    void cerrarTodosLosPreviews();
  });
  return servidor;
}

/**
 * La lista de proyectos y sus acciones. Leer es libre (la pantalla la
 * muestra); sumar, clonar y sacar llevan el pase, porque tocan el disco o
 * corren git.
 */
async function proyectosPedidos(
  ruta: string,
  url: URL,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  hogar: string,
  delArranque: string,
  asegurarProgramador: (repo: string) => void,
) {
  if (ruta === "/api/proyectos" && pedido.method === "GET") {
    const lista = await leerProyectos(hogar);
    return json(respuesta, 200, {
      // El del arranque es el que la consola abre sin `?p=`.
      delArranque: idDe(delArranque),
      proyectos: await Promise.all(
        lista.map(async (p) => ({
          id: p.id,
          nombre: p.nombre,
          ruta: p.ruta,
          ...(p.logo ? { logo: `/api/proyectos/logo?p=${p.id}` } : {}),
          ...(p.origen ? { origen: p.origen } : {}),
          // La última siembra: es lo que ordena la lista y dice si está vivo.
          ...(await ultimaActividad(p.ruta)),
        })),
      ),
    });
  }

  if (ruta === "/api/proyectos/logo" && pedido.method === "GET") {
    // Solo el logo que encontró logoDe, adentro del repo: nunca una ruta que mande el navegador.
    const proyecto = (await leerProyectos(hogar)).find((x) => x.id === url.searchParams.get("p"));
    if (!proyecto?.logo) return texto(respuesta, 404, "ese proyecto no tiene logo");
    const destino = join(proyecto.ruta, proyecto.logo);
    if (!destino.startsWith(proyecto.ruta)) return texto(respuesta, 403, "no");
    const contenido = await readFile(destino);
    const tipo = TIPOS[extname(destino)] ?? (extname(destino) === ".ico" ? "image/x-icon" : "application/octet-stream");
    respuesta.writeHead(200, { "content-type": tipo, "cache-control": "no-store" });
    return respuesta.end(contenido);
  }

  if (ruta === "/api/proyectos" && pedido.method === "POST") {
    const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
    if (!datos) return;
    try {
      if (datos.accion === "sumar" && typeof datos.ruta === "string") {
        const proyecto = await sumarProyecto(datos.ruta, hogar);
        asegurarProgramador(proyecto.ruta);
        return json(respuesta, 201, { ok: true, proyecto });
      }
      if (datos.accion === "clonar" && typeof datos.url === "string") {
        // Si no dice dónde, al lado del proyecto del arranque: donde ya viven los repos de esta persona.
        const donde = typeof datos.donde === "string" && datos.donde.trim() !== "" ? datos.donde : join(delArranque, "..");
        const proyecto = await clonarProyecto(datos.url, donde, hogar);
        asegurarProgramador(proyecto.ruta);
        return json(respuesta, 201, { ok: true, proyecto });
      }
      if (datos.accion === "quitar" && typeof datos.id === "string") {
        if (datos.id === idDe(delArranque)) return json(respuesta, 409, { ok: false, porQue: "es el proyecto con el que arrancó esta consola" });
        return json(respuesta, 200, { ok: await quitarProyecto(datos.id, hogar) });
      }
    } catch (error) {
      return json(respuesta, 422, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
    return json(respuesta, 400, { ok: false, porQue: "no entiendo esa acción" });
  }

  return texto(respuesta, 404, "no está");
}

/** Cuándo fue la última siembra de un repo, y de qué. Sin siembras, nada. */
async function ultimaActividad(repo: string): Promise<{ ultima?: { cuando: string; tarea: string } }> {
  const [ultima] = await listarCosechas(repo, 1).catch(() => []);
  if (!ultima) return {};
  const cosecha = await leerCosecha(ultima).catch(() => null);
  return cosecha?.cuando ? { ultima: { cuando: cosecha.cuando, tarea: cosecha.tarea } } : {};
}

/**
 * El canal en vivo, por SSE: cada línea nueva de `.dolphin/en-vivo.jsonl`
 * sale como un evento. Se lee por polling y no por fs.watch porque en
 * Windows el watch con appends avisa cuando quiere; 700 ms de latencia es
 * invisible para un ojo y gratis para el disco.
 */
function enVivo(repo: string, pedido: IncomingMessage, respuesta: ServerResponse) {
  respuesta.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  // Las cabeceras salen con el primer byte: sin esto, un canal sin nada que
  // contar se abría recién con el primer latido, 15 s después, y la consola
  // tardaba eso en darse cuenta de que el servidor había vuelto.
  respuesta.write(": conectado\n\n");

  const archivo = rutaEnVivo(repo);
  let pos = 0;
  let leyendo = false;

  const mandar = async () => {
    if (leyendo) return;
    leyendo = true;
    try {
      const fh = await open(archivo, "r");
      try {
        const { size } = await fh.stat();
        // El archivo se achicó: una siembra nueva lo truncó. De cero.
        if (size < pos) pos = 0;
        if (size > pos) {
          const { buffer, bytesRead } = await fh.read(Buffer.alloc(size - pos), 0, size - pos, pos);
          // Solo hasta el último salto de línea: una línea a medio escribir
          // salía partida en dos eventos rotos y se perdía. Lo que queda se
          // relee entero en la vuelta siguiente.
          const leido = buffer.subarray(0, bytesRead);
          const fin = leido.lastIndexOf(0x0a);
          if (fin >= 0) {
            pos += fin + 1;
            for (const linea of leido.subarray(0, fin).toString("utf8").split("\n")) {
              if (linea.trim() !== "") respuesta.write(`data: ${linea}\n\n`);
            }
          }
        }
      } finally {
        await fh.close();
      }
    } catch {
      // Todavía no se sembró nada: no hay archivo y no pasa nada.
    }
    leyendo = false;
  };

  void mandar();
  const reloj = setInterval(() => void mandar(), 700);
  // El latido mantiene viva la conexión a través de cualquier proxy.
  const latido = setInterval(() => respuesta.write(": latido\n\n"), 15_000);
  pedido.on("close", () => {
    clearInterval(reloj);
    clearInterval(latido);
  });
}

/**
 * Una siembra pedida desde la consola.
 *
 * El POST exige el token que el servidor inyectó en SU página: sin eso,
 * cualquier sitio abierto en el navegador podría ejecutar agentes en esta
 * máquina con un fetch a 127.0.0.1. El Host se revisa por lo mismo (DNS
 * rebinding: un dominio ajeno resolviendo a localhost).
 */
export interface PedidoDeSiembra {
  readonly tarea: string;
  readonly n: number;
  readonly agente: Motor;
  readonly modelo?: string;
  /** Corre solo: el agente sin pedir permisos y la política en el portón. */
  readonly automatico?: boolean;
  /** El asunto de la bandeja que esta siembra implementa. */
  readonly asunto?: string;
  /** No borrar los worktrees de las ramas que no se eligen (`--sucio`). */
  readonly guardarTodas?: boolean;
  /** La tarea vino de afuera: lo que deje en la memoria espera el visto bueno del dueño. */
  readonly deAfuera?: boolean;
}

/** Lo que el navegador del escritorio vio del elemento que tocaste (ver modo live). */
export interface ElementoTocado {
  readonly url?: string;
  readonly selector?: string;
  readonly texto?: string;
  readonly html?: string;
  /** Archivo y línea, si el navegador los sabe (React en desarrollo, por ejemplo). */
  readonly fuente?: string;
  /** Los estilos que importan para un cambio de diseño: color, fondo, tamaño, radio. */
  readonly estilos?: Readonly<Record<string, string>>;
}

/**
 * La tarea de un toque del modo live: lo que pediste, sobre el elemento tal
 * como estaba en la pantalla. Con el selector, el HTML y —si se sabe— el
 * archivo, el agente va directo al lugar en vez de explorar el repo.
 *
 * Lo pedido va primero y con tus palabras: la primera línea es el título de
 * la cosecha, del parte y del commit. Con una frase fija adelante, todos los
 * pedidos en vivo se veían iguales en la lista.
 */
export function tareaEnVivo(que: string, elemento: ElementoTocado): string {
  const recortar = (texto: string | undefined, largo: number) => (texto ?? "").replace(/\s+$/g, "").slice(0, largo);
  let donde: string | undefined;
  try {
    donde = elemento.url ? new URL(elemento.url).pathname + new URL(elemento.url).hash : undefined;
  } catch {
    donde = undefined;
  }
  const estilos = Object.entries(elemento.estilos ?? {})
    .slice(0, 20)
    .map(([k, v]) => `${k.slice(0, 40)}: ${String(v).slice(0, 120)}`);
  return [
    recortar(que, 1000),
    "",
    "Es sobre un elemento de la app que se tocó en la pantalla. Así estaba:",
    ...(donde ? [`- dónde: ${donde}`] : []),
    ...(elemento.texto ? [`- dice: «${recortar(elemento.texto, 200)}»`] : []),
    ...(elemento.selector ? [`- selector: ${recortar(elemento.selector, 300)}`] : []),
    ...(elemento.fuente ? [`- archivo: ${recortar(elemento.fuente, 300)}`] : []),
    ...(estilos.length > 0 ? ["- estilos que tiene ahora:", ...estilos.map((e) => `  ${e}`)] : []),
    ...(elemento.html ? ["- su HTML:", "```html", recortar(elemento.html, 3000), "```"] : []),
    "",
    "Cambiá ese elemento y nada más: buscá dónde está en el código (empezá por el archivo, si está) y hacé el cambio más chico que logre lo pedido.",
  ].join("\n");
}

/**
 * El modo live: tocaste un elemento de la app que corre, en el navegador del
 * escritorio, y dijiste qué cambiarle. Se siembra una rama con ese pedido,
 * como cualquier otra: pasa el portón y queda para mergear, y al mergearla
 * el dev server la muestra. El pase es el mismo de la consola.
 */
async function pedidoEnVivo(
  pedido: import("node:http").IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  sembrar: (pedido: PedidoDeSiembra) => unknown,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 64_000);
  if (!datos) return;
  const que = typeof datos.pedido === "string" ? datos.pedido.trim() : "";
  if (que === "") return json(respuesta, 400, { ok: false, porQue: "contá qué querés cambiarle" });
  const crudo = (typeof datos.elemento === "object" && datos.elemento !== null ? datos.elemento : {}) as Record<string, unknown>;
  const cadena = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
  const estilos =
    typeof crudo.estilos === "object" && crudo.estilos !== null
      ? Object.fromEntries(Object.entries(crudo.estilos as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][])
      : undefined;
  const elemento: ElementoTocado = {
    ...(cadena(crudo.url) ? { url: cadena(crudo.url)! } : {}),
    ...(cadena(crudo.selector) ? { selector: cadena(crudo.selector)! } : {}),
    ...(cadena(crudo.texto) ? { texto: cadena(crudo.texto)! } : {}),
    ...(cadena(crudo.html) ? { html: cadena(crudo.html)! } : {}),
    ...(cadena(crudo.fuente) ? { fuente: cadena(crudo.fuente)! } : {}),
    ...(estilos && Object.keys(estilos).length > 0 ? { estilos } : {}),
  };
  if (!elemento.selector && !elemento.html && !elemento.texto) {
    return json(respuesta, 400, { ok: false, porQue: "falta el elemento: tocá algo de la app primero" });
  }

  const tarea = tareaEnVivo(que, elemento);
  sembrar({ tarea, n: 1, agente: "claude" });
  json(respuesta, 202, { ok: true, tarea });
}

async function sembrarPedido(
  pedido: import("node:http").IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  sembrar: (pedido: PedidoDeSiembra) => unknown,
  valorador: Valorador = valoradorConClaude,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
  if (!datos) return;

  const tarea = typeof datos.tarea === "string" ? datos.tarea.trim() : "";
  if (tarea === "") return json(respuesta, 400, { ok: false, porQue: "contá qué hay que hacer" });
  if (tarea.length > 2000) return json(respuesta, 400, { ok: false, porQue: "la tarea no entra en 2000 caracteres" });

  const n = Number.parseInt(String(datos.n ?? "1"), 10);
  if (!Number.isInteger(n) || n < 1 || n > 12)
    return json(respuesta, 400, { ok: false, porQue: "los intentos van de 1 a 12" });

  const agente = motorDe(datos.agente);
  const modelo = typeof datos.modelo === "string" && datos.modelo !== "" ? datos.modelo : undefined;

  sembrar({ tarea, n, agente, ...(modelo ? { modelo } : {}), ...(datos.guardarTodas === true ? { guardarTodas: true } : {}) });
  json(respuesta, 202, { ok: true });
}

/** Lanza la siembra como proceso aparte: la consola la mira por el canal en vivo. */
function sembradorPorDefecto(repo: string): (pedido: PedidoDeSiembra) => Promise<void> {
  return (pedido) => lanzarSiembra(repo, pedido);
}

async function lanzarSiembra(
  repo: string,
  { tarea, n, agente, modelo, automatico, asunto, guardarTodas, deAfuera }: PedidoDeSiembra,
  esperar = false,
  senal?: AbortSignal,
): Promise<void> {
  const fases = await fasesDelPaquete(repo);
  await lanzarDolphin(repo, "cli.ts", tarea, [
    "--repo",
    repo,
    "--tarea",
    tarea,
    "--n",
    String(n),
    "--agente",
    agente,
    ...(modelo ? ["--modelo", modelo] : []),
    ...(fases.length > 0 ? ["--verificar", fases.join(",")] : []),
    "--reintentos",
    "1",
    "--igual",
    ...(automatico ? ["--automatico"] : []),
    ...(asunto ? ["--asunto", asunto] : []),
    ...(guardarTodas ? ["--sucio"] : []),
    ...(deAfuera ? ["--de-afuera"] : []),
  ], esperar, senal);
}

export interface PedidoDeCola {
  readonly tareas: readonly string[];
  readonly agente: Motor;
  readonly modelo?: string;
}

/** La cola, como proceso aparte: la consola la mira en `.dolphin/cola.json`. */
async function lanzarCola(repo: string, { tareas, agente, modelo }: PedidoDeCola): Promise<void> {
  const fases = await fasesDelPaquete(repo);
  await lanzarDolphin(repo, "cola-cli.ts", `${tareas.length} tareas en cola`, [
    "--repo",
    repo,
    ...tareas.flatMap((t) => ["--tarea", t]),
    "--agente",
    agente,
    ...(modelo ? ["--modelo", modelo] : []),
    ...(fases.length > 0 ? ["--verificar", fases.join(",")] : []),
  ]);
}

/**
 * Un plan aprobado: la cola corre SUS tareas, cada una con su modelo y su
 * tope. Corren solas —nadie aprueba nada en el medio—, así que van con la
 * política encima, como un turno del calendario.
 */
async function lanzarPlan(repo: string, { agente, ids }: { readonly agente: Motor; readonly ids: readonly string[] }): Promise<void> {
  const fases = await fasesDelPaquete(repo);
  await lanzarDolphin(repo, "cola-cli.ts", "plan aprobado", [
    "--repo",
    repo,
    "--pendientes",
    "--ids",
    ids.join(","),
    "--agente",
    agente,
    ...(fases.length > 0 ? ["--verificar", fases.join(",")] : []),
    "--automatico",
  ]);
}

/** Lanza un comando de Dolphin como proceso aparte; sin `esperar`, vuelve apenas lo lanzó. */
async function lanzarDolphin(
  repo: string,
  script: string,
  rotulo: string,
  args: readonly string[],
  esperar = false,
  senal?: AbortSignal,
): Promise<void> {
  await lanzarYEsperar(repo, script, `pedido · ${rotulo.split("\n")[0]}`, args, esperar, senal);
}


/** Como DOLPHIN: con un PR abierto y sin mergear, la rama está en revisión. */
async function estadoConPr(repo: string, cosecha: { entregada?: Parameters<typeof estadoDeRama>[1]; pr?: { url: string } }) {
  const estado = await estadoDeRama(repo, cosecha.entregada!);
  return estado === "probada" && cosecha.pr ? "en-revision" : estado;
}

async function tieneOrigin(repo: string): Promise<boolean> {
  return gitDice(["remote", "get-url", "origin"], repo);
}

/**
 * Mergear o descartar la rama elegida desde la consola. Toca el repo de
 * verdad, así que va con el pase y con las guardas de mergearRama: nada
 * con cambios sin commitear, nada en otra rama, y si choca, no se toca.
 */
async function ramaPedida(repo: string, pedido: IncomingMessage, respuesta: ServerResponse, token: string) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
  if (!datos) return;

  const cosecha = await buscarCosecha(repo, typeof datos.id === "string" ? datos.id : null);
  if (!cosecha?.entregada) return json(respuesta, 404, { ok: false, porQue: "esta cosecha no tiene una rama entregada" });

  // La política «aprobar»: lo que la lleva a main —mergear o abrir el PR—
  // necesita un sí explícito. Descartar no: tirarla nunca necesitó permiso.
  if ((datos.accion === "mergear" || datos.accion === "pr") && datos.aprobado !== true) {
    const motivo = motivoDeAprobacion((await leerConfig(repo)).testsExistentes, cosecha.ganador);
    if (motivo) return json(respuesta, 409, { ok: false, porQue: `necesita tu aprobación: ${motivo}`, pideAprobacion: motivo });
  }

  // Cada acción queda anotada con su hora en la cosecha: es lo que lee la
  // línea de tiempo de la actividad.
  const ahora = () => new Date().toISOString();
  if (datos.accion === "mergear") {
    const r = await mergearRama(repo, cosecha.entregada, cosecha.tarea, cosecha.ganador?.universo.ruta);
    if (!r.ok) return json(respuesta, 409, { ok: false, porQue: r.porQue });
    if (cosecha.cuando) await anotarCosecha(repo, cosecha.cuando, { mergeadaEn: ahora() });
    return json(respuesta, 200, { ok: true, estadoRama: await estadoDeRama(repo, cosecha.entregada) });
  }
  if (datos.accion === "pr") {
    const r = await abrirPr(repo, cosecha);
    if (!r.ok) return json(respuesta, 409, { ok: false, porQue: r.porQue });
    if (cosecha.cuando) await anotarCosecha(repo, cosecha.cuando, { pr: { url: r.url, en: ahora() } });
    return json(respuesta, 200, { ok: true, estadoRama: "en-revision", pr: r.url });
  }
  if (datos.accion === "descartar") {
    await descartarRama(repo, cosecha.entregada, cosecha.ganador?.universo.ruta);
    if (cosecha.cuando) await anotarCosecha(repo, cosecha.cuando, { descartadaEn: ahora() });
    return json(respuesta, 200, { ok: true, estadoRama: await estadoDeRama(repo, cosecha.entregada) });
  }
  return json(respuesta, 400, { ok: false, porQue: "no entiendo esa acción" });
}

/**
 * Un turno del calendario, corrido de punta a punta: una tarea va a la
 * siembra y varias a la cola, siempre corriendo solo (--automatico, con la
 * política encima). Si salió o no lo dice la cosecha, no el código de
 * salida: una siembra sin ninguna rama probada termina bien y no salió.
 */
async function correrTurno(
  repo: string,
  turno: Turno,
  senal?: AbortSignal,
  // Why esperando: la consola lanza y vuelve, pero de noche cada idea tiene que terminar (y dejar
  // su cosecha) antes de la siguiente; sin esperar salían todas juntas y se leía otra cosecha.
  sembrar: (pedido: PedidoDeSiembra) => unknown = (pedido) => lanzarSiembra(repo, pedido, true, senal),
  casa?: string,
): Promise<{ salio: boolean; porQue?: string; parte?: string }> {
  // Un turno con host corre en esa máquina por SSH, y la cosecha vuelve acá.
  if (turno.host) {
    const adonde = maquinaDelTurno(turno, (await leerConfig(repo)).hosts ?? {});
    if (!adonde.ok) return { salio: false, porQue: adonde.porQue };
    const r = await correrPorSsh(repo, turno, adonde.maquina, correrDeVerdad, senal);
    return { salio: r.salio, ...(r.porQue ? { porQue: r.porQue } : {}) };
  }
  if (turno.deLaBandeja)
    return await correrBandeja(repo, turno, senal, {
      sembrar,
      ...(casa ? { casa } : {}),
      alCambiarPausa: (pausa) => actualizarTurno(repo, turno.id, (actual) => (actual.estado === "corriendo" ? { pausaCupo: pausa } : null)).then(() => undefined),
    });
  const inicio = new Date().toISOString();
  const fases = await fasesDelPaquete(repo);
  const comun = [
    "--repo",
    repo,
    "--agente",
    turno.agente,
    ...(turno.modelo ? ["--modelo", turno.modelo] : []),
    ...(fases.length > 0 ? ["--verificar", fases.join(",")] : []),
    "--automatico",
  ];
  const varias = turno.tareas.length > 1;
  const codigo = varias
    ? await lanzarYEsperar(repo, "cola-cli.ts", `turno ${turno.id}`, [...comun, ...turno.tareas.flatMap((t) => ["--tarea", t])], true, senal)
    : await lanzarYEsperar(repo, "cli.ts", `turno ${turno.id}`, [...comun, "--tarea", turno.tareas[0]!, "--igual"], true, senal);
  if (senal?.aborted) return { salio: false, porQue: "se canceló mientras corría" };

  const r = salioElTurno(varias, varias ? { tareas: (await leerCola(repo)).tareas } : { cosecha: await leerUltimaCosecha(repo) }, inicio);
  return !varias && r.porQue === "la siembra no dejó cosecha" ? { ...r, porQue: `la siembra no dejó cosecha (salió con ${codigo})` } : r;
}

/**
 * Lanza un comando de Dolphin, con la salida a `.dolphin/siembras.log`, y si
 * `esperar` espera a que termine (el calendario corre de a un turno) y
 * devuelve su código de salida. Sin esperar, vuelve apenas lanzó: la consola
 * lo mira por el canal en vivo.
 *
 * Con `node --import tsx` directo y NO con npx: npx en Windows pasa por
 * cmd.exe, que corta la línea de comandos en el primer salto de línea, y el
 * pedido armado de la bandeja llegaba al agente con el título solo.
 */
function lanzarYEsperar(
  repo: string,
  script: string,
  rotulo: string,
  args: readonly string[],
  esperar = true,
  senal?: AbortSignal,
): Promise<number> {
  return new Promise((resolver) => {
    // Con su `.gitignore`: si el log llegaba antes que la primera cosecha, `siembras.log` salía en el `git status`.
    void carpetaDeDolphin(repo).then(
      () => {
        const log = createWriteStream(join(repo, ".dolphin", "siembras.log"), { flags: "a" });
        // Un log que no se puede escribir no tira el servidor: la siembra corre igual.
        log.on("error", () => {});
        log.write(`\n── ${rotulo} ${new Date().toISOString()}\n`);
        const proceso = spawn(process.execPath, ["--import", "tsx", join(RAIZ, "src", script), ...args], {
          cwd: RAIZ,
          windowsHide: true,
          // Con canal: es por donde le llega «cortá» (ver soltarEnlacesAlCortar).
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          // Es Dolphin lanzándose a sí mismo: adentro de la app, con el Electron haciendo de Node.
          env: entornoDeDolphin(),
        });
        proceso.stdout?.pipe(log);
        proceso.stderr?.pipe(log);
        // Sin el proceso no hay siembra, y callarse sería dejar un botón que no
        // hace nada: queda escrito dónde se mira.
        proceso.on("error", (error) => {
          log.end(`no se pudo lanzar: ${error.message}\n`);
          resolver(1);
        });
        proceso.on("close", (codigo) => resolver(codigo ?? 1));
        // Cancelar primero le pide que corte —suelta sus enlaces y mata a sus
        // agentes—, y si en diez segundos no terminó, se corta el árbol entero.
        if (senal) {
          const cortar = () => {
            if (proceso.connected) proceso.send({ cortar: true }, () => {});
            const reloj = setTimeout(() => void matarArbol(proceso.pid).then(() => proceso.kill("SIGKILL")), 10_000);
            proceso.once("close", () => clearTimeout(reloj));
          };
          if (senal.aborted) cortar();
          else senal.addEventListener("abort", cortar, { once: true });
        }
        if (!esperar) resolver(0);
      },
      () => resolver(1),
    );
  });
}

/** Agendar o cancelar un turno desde la consola, con el pase. */
async function calendarioPedido(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  cortar: (id: string) => boolean,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 40_000);
  if (!datos) return;

  if (datos.accion === "cancelar") {
    const id = typeof datos.id === "string" ? datos.id : "";
    // Uno que ya terminó no se cancela: «hecho» o «falló» es lo que pasó.
    const turno = await actualizarTurno(repo, id, (actual) =>
      actual.estado === "agendado" || actual.estado === "corriendo" ? { estado: "cancelado" } : null,
    );
    if (!turno) {
      const existe = (await leerCalendario(repo)).turnos.some((t) => t.id === id);
      return json(respuesta, existe ? 409 : 404, { ok: false, porQue: existe ? "ese turno ya terminó" : "ese turno no está" });
    }
    // Si estaba corriendo, se corta de verdad: cancelar no era solo cambiarle el cartel.
    cortar(id);
    return json(respuesta, 200, { ok: true, turno });
  }

  if (datos.accion === "agendar") {
    const tareas = Array.isArray(datos.tareas) ? datos.tareas.filter((t): t is string => typeof t === "string") : [];
    const crudoBandeja = typeof datos.deLaBandeja === "object" && datos.deLaBandeja !== null ? datos.deLaBandeja as { tope?: unknown } : undefined;
    const tope = crudoBandeja?.tope;
    const hora = typeof datos.hora === "string" ? datos.hora : undefined;
    if (!crudoBandeja && tareas.length > 12) return json(respuesta, 400, { ok: false, porQue: "van de a 12 tareas como mucho" });
    if (crudoBandeja && (!Number.isInteger(tope) || (tope as number) < 1 || (tope as number) > 5))
      return json(respuesta, 400, { ok: false, porQue: "el tope de la bandeja va de 1 a 5" });
    if (crudoBandeja && datos.repetir !== "diario")
      return json(respuesta, 400, { ok: false, porQue: "el autopiloto de la bandeja tiene que repetirse a diario" });
    if (crudoBandeja && (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)))
      return json(respuesta, 400, { ok: false, porQue: "la hora debe ser HH:MM válida" });
    let cuando = typeof datos.cuando === "string" ? datos.cuando : "";
    if (crudoBandeja && hora) {
      const proxima = new Date();
      const [h, m] = hora.split(":").map(Number);
      proxima.setHours(h!, m!, 0, 0);
      if (proxima.getTime() <= Date.now()) proxima.setDate(proxima.getDate() + 1);
      cuando = proxima.toISOString();
    }
    const host = typeof datos.host === "string" && datos.host !== "" ? datos.host : undefined;
    if (!MOTORES.includes(datos.agente as Motor)) return json(respuesta, 400, { ok: false, porQue: "ese agente no está disponible" });
    // La máquina se copia ahora y viaja firmada con el turno.
    const maquina = host ? (await leerConfig(repo)).hosts?.[host] : undefined;
    try {
      const turno = await agendar(repo, {
        tareas,
        cuando,
        agente: motorDe(datos.agente),
        ...(datos.repetir === "diario" ? { repetir: "diario" as const } : {}),
        ...(typeof datos.modelo === "string" && datos.modelo !== "" ? { modelo: datos.modelo } : {}),
        ...(crudoBandeja ? { deLaBandeja: { tope: tope as number }, ...(hora ? { hora } : {}) } : {}),
        ...(host ? { host } : {}),
        ...(maquina ? { maquina } : {}),
      });
      return json(respuesta, 201, { ok: true, turno });
    } catch (error) {
      return json(respuesta, 400, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
  }

  return json(respuesta, 400, { ok: false, porQue: "no entiendo esa acción" });
}

/** Un video con soporte de Range (206): es lo que deja saltar a un momento sin bajarlo entero. */
async function servirVideo(ruta: string, pedido: IncomingMessage, respuesta: ServerResponse) {
  let tamano: number;
  try {
    const info = await stat(ruta);
    if (!info.isFile()) return texto(respuesta, 404, "ese video no está");
    tamano = info.size;
  } catch {
    return texto(respuesta, 404, "ese video no está");
  }
  // Un error del stream es asincrónico: el try del handler no lo ve, y sin
  // esto mataba el proceso entero (un directorio con nombre de video alcanzaba).
  const mandar = (opciones?: { start: number; end: number }) => {
    const lectura = createReadStream(ruta, opciones);
    lectura.on("error", () => {
      if (!respuesta.headersSent) texto(respuesta, 404, "ese video no se pudo leer");
      else respuesta.destroy();
    });
    lectura.pipe(respuesta);
  };
  const rango = /bytes=(\d*)-(\d*)/.exec(String(pedido.headers.range ?? ""));
  if (!rango) {
    respuesta.writeHead(200, { "content-type": "video/webm", "content-length": tamano, "accept-ranges": "bytes" });
    return mandar();
  }
  const desde = rango[1] ? Number(rango[1]) : 0;
  const hasta = rango[2] ? Math.min(Number(rango[2]), tamano - 1) : tamano - 1;
  if (desde > hasta || desde >= tamano) {
    respuesta.writeHead(416, { "content-range": `bytes */${tamano}` });
    return respuesta.end();
  }
  respuesta.writeHead(206, {
    "content-type": "video/webm",
    "content-length": hasta - desde + 1,
    "content-range": `bytes ${desde}-${hasta}/${tamano}`,
    "accept-ranges": "bytes",
  });
  mandar({ start: desde, end: hasta });
}

/** Varias tareas a la vez desde la consola, con el pase: una por línea en Nueva. */
async function colaPedida(
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  encolar: (pedido: PedidoDeCola) => void,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 40_000);
  if (!datos) return;

  const tareas = Array.isArray(datos.tareas)
    ? datos.tareas.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => t !== "")
    : [];
  if (tareas.length < 2) return json(respuesta, 400, { ok: false, porQue: "una cola son dos tareas o más: una por línea" });
  if (tareas.length > 12) return json(respuesta, 400, { ok: false, porQue: "van de a 12 tareas como mucho" });
  if (tareas.some((t) => t.length > 2000)) return json(respuesta, 400, { ok: false, porQue: "cada tarea entra en 2000 caracteres" });

  const agente = motorDe(datos.agente);
  const modelo = typeof datos.modelo === "string" && datos.modelo !== "" ? datos.modelo : undefined;

  encolar({ tareas, agente, ...(modelo ? { modelo } : {}) });
  json(respuesta, 202, { ok: true });
}

/**
 * Decidir un asunto de la bandeja desde la consola: rechazarlo (y que no
 * vuelva), reabrirlo, o implementarlo — que siembra una rama con el pedido
 * armado entero, corriendo solo y con la política encima.
 */
async function bandejaPedida(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  sembrar: (pedido: PedidoDeSiembra) => unknown,
  valorador: Valorador = valoradorConClaude,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
  if (!datos) return;

  // Valorar compara todas las ideas abiertas: no es sobre un asunto solo.
  if (datos.accion === "valorar") {
    try {
      const hecho = await valorarIdeas(repo, valorador);
      return json(respuesta, 200, { ok: true, ...hecho });
    } catch (error) {
      return json(respuesta, 502, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
  }

  const id = typeof datos.id === "string" ? datos.id : "";
  // Un asunto colgado de una siembra que se cortó no puede contestar «ya está implementando».
  await liberarCortados(repo).catch(() => []);
  const asunto = (await leerBandeja(repo)).asuntos.find((a) => a.id === id);
  if (!asunto) return json(respuesta, 404, { ok: false, porQue: "ese asunto no está en la bandeja" });

  if (datos.accion === "rechazar" || datos.accion === "reabrir") {
    const quedo = await cambiarEstado(repo, id, datos.accion === "rechazar" ? "rechazado" : "abierto");
    return json(respuesta, 200, { ok: true, asunto: quedo });
  }

  // Ni tirarlo ni hacerlo ahora: anotarlo en el tablero y decidir ahí, que es lo que uno quiere
  // hacer con casi todo lo que encuentra un robot.
  if (datos.accion === "anotar") {
    const hecho = await anotarDescubrimiento(repo, id);
    if (seAnoto(hecho)) {
      return json(respuesta, 200, { ok: true, tarjeta: hecho.tarjeta, asunto: hecho.asunto, parecidas: hecho.parecidas });
    }
    if (hecho.porQue === "ya-estaba") {
      return json(respuesta, 200, { ok: true, yaEstaba: hecho.tarjeta, porQue: "ya había una tarjeta que dice lo mismo" });
    }
    return json(respuesta, 409, { ok: false, porQue: `ese asunto está ${asunto.estado}` });
  }

  if (datos.accion === "noche" || datos.accion === "sacar-de-la-noche") {
    if (asunto.estado !== "abierto") return json(respuesta, 409, { ok: false, porQue: `ese asunto está ${asunto.estado}` });
    const quedo = await marcarParaLaNoche(repo, id, datos.accion === "noche" ? new Date().toISOString().slice(0, 10) : undefined);
    return json(respuesta, 200, { ok: true, asunto: quedo });
  }

  if (datos.accion === "implementar") {
    // Dos clics no siembran dos ramas para lo mismo.
    if (asunto.estado !== "abierto") {
      return json(respuesta, 409, { ok: false, porQue: `ese asunto está ${asunto.estado}` });
    }
    // Una idea la trajo el scout de la web: lo que deje en la memoria es de afuera.
    // Un error lo encontró nuestro propio explorador: es de casa.
    sembrar({
      tarea: promptDeImplementacion(asunto),
      n: 1,
      agente: "claude",
      automatico: true,
      asunto: asunto.id,
      ...(asunto.tipo === "idea" ? { deAfuera: true } : {}),
    });
    const quedo = await cambiarEstado(repo, id, "implementando");
    return json(respuesta, 202, { ok: true, asunto: quedo });
  }

  return json(respuesta, 400, { ok: false, porQue: "no entiendo esa acción" });
}

/** Enseñarle, apagarle o borrarle un recuerdo a la memoria, desde la consola. */
/**
 * El corto plazo, como lo muestra la consola: lo que está en observación con
 * su puntaje y cuánto le falta, y lo de afuera que ya alcanzaría y espera
 * el visto bueno. Lo más cerca de entrar, primero.
 */
async function enObservacion(repo: string) {
  const ahora = new Date();
  const notas = (await leerNotas(repo)).filter((n) => !n.promovida && !n.descartada);
  const conPuntaje = notas
    .map((n) => {
      const p = puntuar(n, ahora);
      return {
        id: n.id,
        texto: n.texto,
        origen: n.origen,
        puntaje: p.total,
        vistas: p.senales,
        tareas: p.tareas,
        // Lo que le falta para que el sueño la considere: tareas distintas.
        faltan: Math.max(0, UMBRALES.minTareas - p.tareas),
        alcanza: alcanza(p),
        ultima: n.vistas[n.vistas.length - 1]?.cuando,
      };
    })
    .sort((a, b) => b.puntaje - a.puntaje);
  return {
    esperando: conPuntaje.filter((n) => n.origen === "untrusted" && n.alcanza),
    enObservacion: conPuntaje.filter((n) => !(n.origen === "untrusted" && n.alcanza)).slice(0, 30),
    umbrales: { minTareas: UMBRALES.minTareas, minPuntaje: UMBRALES.minPuntaje },
  };
}

/** Las últimas entradas de DREAMS.md, de la más nueva a la más vieja. */
async function ultimosSuenos(repo: string): Promise<string[]> {
  const texto = await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8").catch(() => "");
  return texto
    .split(/\n---\n/)
    .slice(1)
    .map((b) => b.trim())
    .filter(Boolean)
    .reverse()
    .slice(0, 5);
}

async function memoriaPedida(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
) {
  // El perfil es un documento entero: más aire que el de una acción suelta.
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 40_000);
  if (!datos) return;

  try {
    if (datos.accion === "perfil") {
      // El perfil se guarda entero: es un documento, no una lista de filas.
      await guardarPerfil(repo, typeof datos.perfil === "string" ? datos.perfil : "");
      return json(respuesta, 200, { ok: true, perfil: await leerPerfil(repo) });
    }

    if (datos.accion === "crear") {
      const dicho = typeof datos.dicho === "string" ? datos.dicho : "";
      const patron = typeof datos.patron === "string" && datos.patron !== "" ? datos.patron : undefined;
      // Lo que dice el dueño es regla de entrada: no pasa por el sueño.
      const recuerdo = await recordar(repo, dicho, patron, undefined, { origen: "owner" });
      return json(respuesta, 201, { ok: true, recuerdo });
    }

    if (datos.accion === "candidato" || datos.accion === "crear-candidata") {
      const dicho = typeof datos.dicho === "string" ? datos.dicho : "";
      const porQue = typeof datos.porQue === "string" ? datos.porQue : "";
      const patron = typeof datos.patron === "string" && datos.patron !== "" ? datos.patron : undefined;
      const recuerdo = await recordarCandidato(repo, dicho, porQue, patron);
      return json(respuesta, recuerdo ? 201 : 409, { ok: recuerdo !== null, ...(recuerdo ? { recuerdo } : { porQue: "esa corrección fue descartada" }) });
    }

    const id = typeof datos.id === "string" ? datos.id : "";
    if (datos.accion === "prender" || datos.accion === "apagar") {
      const quedo = await prenderRecuerdo(repo, id, datos.accion === "prender");
      return json(respuesta, quedo ? 200 : 404, { ok: quedo });
    }
    if (datos.accion === "aprobar-candidato" || datos.accion === "aprobar-candidata") {
      const dicho = typeof datos.dicho === "string" ? datos.dicho : undefined;
      const recuerdo = await aprobarCandidato(repo, id, dicho);
      return json(respuesta, recuerdo ? 200 : 404, { ok: recuerdo !== null, ...(recuerdo ? { recuerdo } : {}) });
    }
    if (datos.accion === "descartar-candidato" || datos.accion === "descartar-candidata") {
      const quedo = await descartarCandidato(repo, id);
      return json(respuesta, quedo ? 200 : 404, { ok: quedo });
    }
    if (datos.accion === "editar" || datos.accion === "editar-dicho") {
      const recuerdo = await editarDicho(repo, id, typeof datos.dicho === "string" ? datos.dicho : "");
      return json(respuesta, recuerdo ? 200 : 404, { ok: recuerdo !== null, ...(recuerdo ? { recuerdo } : {}) });
    }
    if (datos.accion === "olvidar") {
      const quedo = await olvidarRecuerdo(repo, id);
      return json(respuesta, quedo ? 200 : 404, { ok: quedo });
    }
    // El corto plazo: el dueño aprueba o descarta una nota, o hace soñar ahora.
    if (datos.accion === "aprobar-nota") {
      const quedo = await aprobarNota(repo, id);
      return json(respuesta, quedo ? 200 : 404, { ok: quedo });
    }
    if (datos.accion === "descartar-nota") {
      const quedo = await descartarNota(repo, id);
      return json(respuesta, quedo ? 200 : 404, { ok: quedo });
    }
    if (datos.accion === "sonar") {
      const sueno = await sonar(repo);
      return json(respuesta, 200, { ok: true, promovidas: sueno.promovidas.length, esperando: sueno.esperando.length, olvidadas: sueno.olvidadas });
    }

    return json(respuesta, 400, { ok: false, porQue: "no entiendo esa acción" });
  } catch (error) {
    return json(respuesta, 400, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * La cosecha que pide la pantalla: la última, o una del historial.
 *
 * El `id` llega del navegador, así que NUNCA se concatena a una ruta: se
 * lista el historial y se acepta sólo si coincide con un archivo que ya
 * está ahí. Sin eso, `?id=../../.ssh/id_rsa` sería una lectura de archivos
 * arbitraria servida por HTTP.
 */
async function buscarCosecha(repo: string, id: string | null) {
  if (!id) return await leerUltimaCosecha(repo);

  const rutas = await listarCosechas(repo, 50);
  const elegida = rutas.find((r) => basename(r) === id);
  if (!elegida) return undefined;

  return await leerCosecha(elegida).catch(() => undefined);
}

async function worktreesVivos(
  cosecha: NonNullable<Awaited<ReturnType<typeof leerCosecha>>>,
): Promise<string[]> {
  const estan = await Promise.all(
    cosecha.candidatos.map(async (c) => {
      try {
        await access(c.universo.ruta);
        return c.universo.id;
      } catch {
        return null;
      }
    }),
  );
  return estan.filter((id) => id !== null);
}

function resumir(c: NonNullable<Awaited<ReturnType<typeof leerCosecha>>>) {
  return {
    cuando: c.cuando,
    tarea: c.tarea,
    gastado: c.gastado,
    ms: c.ms,
    universos: c.candidatos.length,
    vivos: c.candidatos.filter((x) => x.vivo).length,
    ganador: c.ganador?.universo.id ?? null,
    ...(c.suscripcion ? { suscripcion: true } : {}),
    // El gasto de arriba es un piso: algún motor no informó lo suyo.
    ...(c.costoDesconocido ? { costoDesconocido: true } : {}),
    // Lo justo para que el tablero cuente modelos y cortes sin bajar
    // cada cosecha entera: nada de diffs ni detalles acá.
    intentos: c.candidatos.map((x) => ({
      id: x.universo.id,
      vivo: x.vivo,
      ...(x.modelo ? { modelo: x.modelo } : {}),
      ...(x.murioEn ? { murioEn: x.murioEn } : {}),
      // Escribir y corregir también se pagan: sin el agente, el tablero
      // diría que una rama de Opus costó lo que costó su revisión.
      gastado: (x.gastadoAgente ?? 0) + x.pasadas.reduce((n, p) => n + (p.gastado ?? 0), 0),
      // Y aparte, lo de las fases: «se cortó gratis» es que el portón no
      // gastó nada en ella, aunque escribirla sí haya costado.
      gastadoFases: x.pasadas.reduce((n, p) => n + (p.gastado ?? 0), 0),
      ...(x.costoDesconocido ? { costoDesconocido: true } : {}),
      // Cuántas fases corrió: sin ninguna, «pasó» no quiere decir nada.
      fases: x.pasadas.length,
    })),
  };
}


/**
 * Destilar por defecto: el CLI de Claude en solo lectura, sin herramientas que
 * escriban. Todo el material va en el pedido; no necesita recorrer el repo.
 */
const destiladorConClaude: Destilador = (prompt, repo, senal) =>
  leerConClaude(prompt, { modelo: "sonnet", vueltas: 2, herramientas: ["Read"], cwd: repo, tope: 300_000, ...(senal ? { senal } : {}) });

/**
 * POST /api/entrenamiento {accion}: «buscar» encuentra las memorias (rápido,
 * sin gastar), «destilar» le pide al modelo las verdades del proyecto, y
 * «olvidar» tacha una que no va.
 */
async function entrenamientoPedido(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  opciones: OpcionesServidor,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 4_000);
  if (!datos) return;
  const casa = opciones.casa ?? homedir();
  try {
    if (datos.accion === "destilar") {
      // La consola corta el pedido con «Seguir sin destilar» o al irse: ahí se mata el proceso del
      // modelo. Antes la pantalla dejaba de esperar y el servidor seguía gastando el cupo igual.
      const corte = new AbortController();
      respuesta.on("close", () => {
        if (!respuesta.writableFinished) corte.abort();
      });
      return json(respuesta, 200, {
        entrenamiento: await destilar(repo, opciones.destilador ?? destiladorConClaude, casa, new Date(), corte.signal),
      });
    }
    if (datos.accion === "olvidar") {
      if (typeof datos.texto !== "string") return json(respuesta, 400, { ok: false, porQue: "falta qué olvidar" });
      return json(respuesta, 200, { entrenamiento: await olvidarAprendido(repo, datos.texto) });
    }
    return json(respuesta, 200, { entrenamiento: await entrenar(repo, casa) });
  } catch (error) {
    return json(respuesta, 502, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * La revisión cruzada del portón a mano: con la tarea que se le dio al agente, otro modelo lee el
 * diff en solo lectura. Sin tarea no hay contra qué revisar, y con `modelos.revisar: false` (o la
 * estrategia «economía») quien configuró dijo que no quiere pagarla.
 */
async function revisionAMano(
  repo: string,
  cuerpo: Record<string, unknown>,
  correr?: CorrerRevisor,
): Promise<{ verificador: Verificador; escribio?: string; base?: string } | undefined> {
  const tarea = typeof cuerpo.tarea === "string" ? cuerpo.tarea.trim().slice(0, 4000) : "";
  if (!tarea) return undefined;
  const escribio = typeof cuerpo.escribio === "string" && cuerpo.escribio.trim() ? cuerpo.escribio.trim() : undefined;
  const reparto = repartir("claude", (await leerConfig(repo)).modelos ?? {}, escribio ? { modelo: escribio } : {});
  if (!reparto.revisar) return undefined;
  // Una base que no parezca un nombre de git no llega a la línea de comandos.
  const base = typeof cuerpo.base === "string" && /^[\w./~^-]{1,200}$/.test(cuerpo.base) && !cuerpo.base.startsWith("-") ? cuerpo.base : undefined;
  return {
    verificador: verificadorRevisor({ tarea, modelo: reparto.revisar, ...(correr ? { correr } : {}) }),
    ...(escribio ? { escribio } : {}),
    ...(base ? { base } : {}),
  };
}
