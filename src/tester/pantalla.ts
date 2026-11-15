import { auditarPagina, esperarQuietud, focoSeVe, marcarFoco, resaltarHallazgos, type Hallazgo } from "./auditoria.js";
import { personasPorNombre, type Persona } from "./personas.js";
import type { Universo, Veredicto, Verificador } from "../nucleo/tipos.js";

/**
 * El escalón que toca la pantalla.
 *
 * Playwright entra por import dinámico y usa el Chrome que ya está
 * instalado (`channel: "chrome"`), así que quien no use este escalón no
 * baja 150 MB de navegadores. Si no está, el verificador lo dice y deja
 * pasar: un escalón que no se puede correr no mata candidatos — sería
 * descartar código bueno por un problema de la máquina.
 *
 * Todo lo que mide es determinista y no cuesta un token.
 */

export interface OpcionesPantalla {
  /** Cómo se abre lo que hay que mirar. Recibe la ruta del universo y la
   *  superficie declarada por el agente, si declaró alguna. */
  readonly url: (universo: Universo, superficie?: string) => string;
  readonly personas?: readonly string[];
  /** Cuántos hallazgos tolera antes de matar al candidato. */
  readonly tolerancia?: number;
  readonly tope?: number;
  /** Cuántas superficies declaradas probar como mucho, para que un cambio
   *  que toca veinte pantallas no haga eterno el escalón. */
  readonly topeDeSuperficies?: number;
}

/**
 * Qué pantallas hay que mirar en este universo.
 *
 * Si el agente declaró superficies, se prueban esas: es la diferencia entre
 * buscar el bug donde el cambio ocurrió y tantear la home a ver si suena.
 * Si no declaró nada, queda una sola pasada por la URL base.
 */
export function superficiesAProbar(
  contrato: { superficies: readonly string[] } | undefined,
  tope = 3,
): (string | undefined)[] {
  const declaradas = (contrato?.superficies ?? []).filter((s) => s.trim() !== "");
  if (declaradas.length === 0) return [undefined];
  return declaradas.slice(0, tope);
}

export interface InformeDePantalla {
  /** «pulgar», o «pulgar en /alta» si se miró una superficie. */
  readonly persona: string;
  readonly hallazgos: readonly Hallazgo[];
  /** La superficie que se miró, tal como se declaró. */
  readonly superficie?: string;
  /** Si se grabó: la ruta del video de esta persona en esta superficie. */
  readonly video?: string;
}

export interface OpcionesMirar {
  readonly url: (superficie?: string) => string;
  readonly superficies: readonly (string | undefined)[];
  readonly personas: readonly Persona[];
  readonly tope?: number;
  /** Si viene, cada persona graba su recorrido ahí. Quien llama decide qué videos guardar. */
  readonly carpetaVideo?: string;
}

/**
 * Las personas miran las superficies, todas a la vez, cada una en su propio
 * contexto del mismo navegador. Sin Chrome ni Edge devuelve null: un escalón
 * que no se puede correr no es una falla del código.
 */
export async function mirarPantallas(opciones: OpcionesMirar): Promise<InformeDePantalla[] | null> {
  const chromium = await traerChromium();
  if (!chromium) return null;
  const navegador = await abrirNavegador(chromium);
  if (!navegador) return null;
  try {
    const pares = opciones.personas.flatMap((persona) => opciones.superficies.map((superficie) => ({ persona, superficie })));
    return await Promise.all(
      pares.map(({ persona, superficie }) =>
        mirarCon(navegador, persona, opciones.url(superficie), opciones.tope ?? 20_000, superficie, opciones.carpetaVideo),
      ),
    );
  } finally {
    await navegador.close();
  }
}

/** Chrome, y si no está, Edge: los dos vienen con el motor que Playwright sabe manejar. Lo usan las personas y el explorador. */
export async function abrirNavegador(chromium: any): Promise<any | undefined> {
  for (const canal of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel: canal, headless: true });
    } catch {
      /* el próximo canal */
    }
  }
  return undefined;
}

export function verificadorDePantalla(opciones: OpcionesPantalla): Verificador {
  return {
    nombre: "pantalla",
    costo: "gratis",
    async correr(universo, contexto) {
      // Las cinco personas miran a la vez, cada una en su propio contexto
      // del mismo navegador. Secuencial tardaba lo que tardan las cinco
      // sumadas y el escalón de pantalla pasaba a ser el más lento de
      // todos los gratis, que es justo el que tiene que ser rápido.
      const informes = await mirarPantallas({
        url: (superficie) => opciones.url(universo, superficie),
        superficies: superficiesAProbar(contexto?.contrato, opciones.topeDeSuperficies ?? 3),
        personas: personasPorNombre(opciones.personas ?? []),
        ...(opciones.tope ? { tope: opciones.tope } : {}),
      });
      if (!informes) {
        return {
          paso: true,
          salteada: true,
          detalle: "pantalla: no hay navegador, se salteó",
          evidencia: "instalá playwright-core y Chrome para correr este escalón",
          gastado: 0,
        };
      }

      return armarVeredicto(informes, opciones.tolerancia ?? 0);
    },
  };
}

export function armarVeredicto(
  informes: readonly InformeDePantalla[],
  tolerancia: number,
): Veredicto & { gastado: number } {
  const total = informes.reduce((n, i) => n + i.hallazgos.length, 0);
  const evidencia = informes
    .filter((i) => i.hallazgos.length > 0)
    .map((i) => `${i.persona}:\n${i.hallazgos.map((h) => `  · ${h.donde}: ${h.detalle}`).join("\n")}`)
    .join("\n\n");

  if (total <= tolerancia) {
    return { paso: true, detalle: `pantalla: ${informes.length} personas, nada roto`, evidencia, gastado: 0 };
  }

  // El detalle es lo que se ve en la fila del universo muerto, así que
  // lleva el hallazgo más grave y no un "fallaron 7 chequeos".
  const peor = peorHallazgo(informes);
  const repetidos = informes
    .flatMap((i) => i.hallazgos)
    .filter((h) => h.tipo === peor.hallazgo.tipo).length;

  // Doce veces el mismo problema es un problema, no doce. Se nombra una vez
  // y se dice cuántas aparece: si no, el informe tapa lo importante.
  const cola = repetidos > 1 ? ` (y ${repetidos - 1} más igual)` : "";

  return {
    paso: false,
    detalle: `pantalla · ${peor.persona}: ${peor.hallazgo.donde} ${peor.hallazgo.detalle}${cola}`,
    evidencia,
    gastado: 0,
  };
}

const GRAVEDAD: Record<string, number> = {
  desborde: 0,
  "target-chico": 1,
  "foco-invisible": 1,
  "nombre-accesible": 2,
  // Texto que no se lee es tan grave como un botón sin nombre: no llega.
  contraste: 2,
  "texto-cortado": 3,
  consola: 0,
};

/**
 * El más grave, y entre dos igual de graves siempre el mismo: desempata por tipo, lugar, detalle y
 * persona. Ordenando solo por gravedad el desempate quedaba en el orden en que la página devolvió
 * los elementos, así que el motivo por el que murió una rama podía cambiar de una corrida a otra
 * sobre el mismo código: el parte decía una cosa y la consola otra. Se compara crudo y no con
 * `localeCompare`, que depende del idioma de la máquina.
 */
function peorHallazgo(informes: readonly InformeDePantalla[]): { persona: string; hallazgo: Hallazgo } {
  const todos = informes.flatMap((i) => i.hallazgos.map((h) => ({ persona: i.persona, hallazgo: h })));
  const clave = (x: { persona: string; hallazgo: Hallazgo }) =>
    `${x.hallazgo.tipo}\u0000${x.hallazgo.donde}\u0000${x.hallazgo.detalle}\u0000${x.persona}`;
  todos.sort((a, b) => {
    const porGravedad = (GRAVEDAD[a.hallazgo.tipo] ?? 9) - (GRAVEDAD[b.hallazgo.tipo] ?? 9);
    if (porGravedad !== 0) return porGravedad;
    const ca = clave(a);
    const cb = clave(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  return todos[0]!;
}

/**
 * La página donde mira una persona, con video si se puede. Sin el ffmpeg de Playwright el contexto
 * con `recordVideo` se crea igual y lo que falla es `newPage` («Executable doesn't exist at
 * …/ffmpeg-linux»): por eso el reintento sin video cubre los dos pasos. Antes cubría solo el
 * primero, y en una máquina sin ffmpeg —el runner de GitHub— la fase entera se salteaba.
 */
async function abrirPagina(
  navegador: any,
  opcionesDeContexto: Record<string, unknown>,
  recordVideo: { dir: string; size: { width: number; height: number } } | undefined,
): Promise<{ contexto: any; pagina: any }> {
  if (recordVideo) {
    const conVideo = await navegador.newContext({ ...opcionesDeContexto, recordVideo }).catch(() => undefined);
    if (conVideo) {
      try {
        return { contexto: conVideo, pagina: await conVideo.newPage() };
      } catch {
        await conVideo.close().catch(() => {});
      }
    }
  }
  const contexto = await navegador.newContext(opcionesDeContexto);
  return { contexto, pagina: await contexto.newPage() };
}

async function mirarCon(
  navegador: any,
  persona: Persona,
  url: string,
  tope: number,
  superficie?: string,
  carpetaVideo?: string,
): Promise<InformeDePantalla> {
  const opcionesDeContexto = {
    viewport: { width: persona.ancho, height: persona.alto },
    hasTouch: persona.tactil,
    isMobile: persona.tactil,
    deviceScaleFactor: persona.tactil ? 3 : 1,
  };
  // Grabar necesita el ffmpeg de Playwright: si no está, se mira igual sin
  // video. Un video que falta no es motivo para no probar.
  const { contexto, pagina } = await abrirPagina(
    navegador,
    opcionesDeContexto,
    carpetaVideo ? { dir: carpetaVideo, size: { width: persona.ancho, height: persona.alto } } : undefined,
  );
  const hallazgos: Hallazgo[] = [];

  // esbuild (tsx, tsup, vite) le agrega el helper __name a las funciones con
  // keepNames. Playwright serializa la función y la manda al browser, donde ese
  // helper no existe, así que todo evaluate() explota con "__name is not
  // defined". Se define como identidad antes de cargar nada: sirva quien sirva
  // de bundler del otro lado.
  await pagina.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

  if (persona.mira.includes("consola")) {
    pagina.on("console", (msg: any) => {
      if (msg.type() !== "error") return;
      hallazgos.push({ tipo: "consola", donde: "la consola", detalle: msg.text().slice(0, 160) });
    });
    pagina.on("pageerror", (error: Error) => {
      hallazgos.push({ tipo: "consola", donde: "la página", detalle: error.message.slice(0, 160) });
    });
  }

  if (persona.mira.includes("red")) {
    pagina.on("requestfailed", (req: any) => {
      hallazgos.push({ tipo: "red", donde: req.url().slice(-70), detalle: "no cargó" });
    });
  }

  if (persona.latencia > 0) {
    // La demora va en lo que decide si la pantalla se queda colgada —el
    // documento, los scripts, los datos— y no en cada fuente y cada ícono.
    // Cobrarle a los 20 assets de una página multiplicaba el tiempo del
    // escalón sin cambiar lo que esta persona mide.
    const pesados = new Set(["document", "script", "xhr", "fetch"]);
    await pagina.route("**/*", async (ruta: any) => {
      if (pesados.has(ruta.request().resourceType())) {
        await new Promise((r) => setTimeout(r, persona.latencia));
      }
      await ruta.continue();
    });
  }

  let video: string | undefined;
  try {
    await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: tope });

    // `load` y no `networkidle`: con file:// —y con cualquier página que
    // deje un socket abierto— networkidle no se resuelve nunca y la espera
    // se come el timeout entero. Medido: pasó de 6,4 s a 10,2 s.
    await pagina.waitForLoadState("load", { timeout: Math.min(tope, 4000) }).catch(() => {});
    await pagina.waitForTimeout(persona.latencia > 0 ? 900 : 350);

    if (persona.textoLargo) await pegarTextoLargo(pagina, persona.textoLargo);
    if (persona.entrada === "teclado") hallazgos.push(...(await tabular(pagina)));

    // Lo que se mide es la pantalla quieta, no un cuadro a mitad de entrar.
    await pagina.evaluate(esperarQuietud).catch(() => {});
    const medidos: Hallazgo[] = await pagina.evaluate(auditarPagina, {
      tactil: persona.tactil,
      chequeos: [...persona.mira],
      marcar: Boolean(carpetaVideo),
    });
    hallazgos.push(...medidos);

    // Con video y algo encontrado: se marca en cámara dónde está, se sostiene
    // un momento y se saca la portada. Sin esto el video duraba un segundo y
    // no mostraba qué mirar.
    if (carpetaVideo && hallazgos.length > 0) {
      await pagina.evaluate(resaltarHallazgos).catch(() => 0);
      await pagina.waitForTimeout(1500);
      const ruta: string | undefined = await pagina.video()?.path().catch(() => undefined);
      if (ruta) await pagina.screenshot({ path: ruta.replace(/\.webm$/, ".png") }).catch(() => {});
    }

    // Los listeners de consola y de red empujan desde afuera del flujo. Si
    // el conjunto no se cierra acá, un evento que llega mientras el
    // contexto se cierra entra o no según el timing — y con tolerancia 0 un
    // solo hallazgo decide vida o muerte. El mismo candidato pasaría en una
    // corrida y moriría en la siguiente.
    // Solo los míos, por nombre: `removeAllListeners()` pelado se lleva
    // también los internos de Playwright y rompe el protocolo.
    for (const evento of ["console", "pageerror", "requestfailed"]) {
      pagina.removeAllListeners(evento);
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    // Que la app se caiga o no conteste es de la app; que la página se recargue a mitad de
    // la mirada (el servidor de desarrollo lo hace solo) es de la herramienta, y no corta a nadie.
    const deLaHerramienta = /execution context was destroyed|target (page, context or browser )?(has been )?closed|frame was detached|because of a navigation/i.test(mensaje);
    hallazgos.push({ tipo: deLaHerramienta ? "herramienta" : "consola", donde: "al abrir la página", detalle: mensaje.slice(0, 160) });
  } finally {
    // La ruta del video se pide antes de cerrar; el archivo queda completo después.
    video = carpetaVideo ? await pagina.video()?.path().catch(() => undefined) : undefined;
    await contexto.close();
  }

  return {
    persona: superficie ? `${persona.nombre} en ${superficie}` : persona.nombre,
    hallazgos,
    ...(superficie !== undefined ? { superficie } : {}),
    ...(video ? { video } : {}),
  };
}

/** Lo que rompe las cajas: un nombre de 90 caracteres y un importe de nueve cifras. */
async function pegarTextoLargo(pagina: any, texto: string): Promise<void> {
  const campos = await pagina.$$('input[type="text"], input:not([type]), textarea');
  for (const campo of campos.slice(0, 6)) {
    await campo.fill(texto).catch(() => {});
  }
  await pagina.waitForTimeout(150);
}

/**
 * Tab por la página entera y mirar si cada parada se ve. Hasta dar la
 * vuelta (volver a un elemento ya visitado) o el tope: antes cortaba a las
 * 12 paradas y lo de más abajo no se miraba nunca.
 */
async function tabular(pagina: any, tope = 80): Promise<Hallazgo[]> {
  const hallazgos: Hallazgo[] = [];
  for (let i = 0; i < tope; i++) {
    await pagina.keyboard.press("Tab");
    const dioLaVuelta: boolean = await pagina.evaluate(marcarFoco);
    if (dioLaVuelta) break;
    const foco: { visible: boolean; donde: string } = await pagina.evaluate(focoSeVe);
    if (foco.donde === "nada tiene el foco") break;
    if (!foco.visible) {
      hallazgos.push({
        tipo: "foco-invisible",
        donde: foco.donde,
        detalle: "recibe el foco y no se nota: con el teclado no se sabe dónde está parado",
      });
    }
  }
  return hallazgos;
}

async function traerChromium(): Promise<any | undefined> {
  try {
    const mod = await import("playwright-core");
    return mod.chromium;
  } catch {
    return undefined;
  }
}
