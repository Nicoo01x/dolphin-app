import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AsuntoNuevo } from "../nucleo/bandeja.js";
import { carpetaDeDolphin } from "../nucleo/escritura.js";

/**
 * El explorador: recorre la app de punta a punta como lo haría una persona
 * que la usa por primera vez —toca cada cosa, mira qué pasa— y anota lo
 * que no anduvo ANTES de que lo encuentre un usuario.
 *
 * Esta parte no sabe nada de navegadores: decide qué tocar, qué ya se
 * revisó y qué cuenta como error. Lo que maneja el Chrome de verdad vive
 * en `explorador-playwright.ts`, detrás de la interfaz `PaginaExplorable`,
 * y por eso toda esta lógica se prueba con una app de mentira.
 *
 * Dos reglas para que no caiga en bucle:
 * - Un ESTADO de pantalla (ruta + qué elementos tiene, sin los datos) se
 *   revisa una vez. Volver a la home desde cada pantalla no la re-revisa.
 * - La cobertura se guarda entre corridas: una sección ya revisada no se
 *   vuelve a revisar mientras su código no cambie. Lo que cambió se
 *   invalida por superficie (la ruta) o por los archivos del diff.
 */

export type Rol = "enlace" | "boton" | "pestaña";

export interface Elemento {
  readonly rol: Rol;
  /** Lo que una persona lee: el texto o, si no hay, el nombre accesible. */
  readonly texto: string;
  /** Si hay varios iguales, cuál es (0, 1, 2…): es lo que permite volver a encontrarlo. */
  readonly n: number;
  /** Los enlaces: adónde llevan, si es del mismo sitio. */
  readonly destino?: string;
  /** Manda un formulario: no se prueba como un botón suelto sino mandándolo vacío (ver enviarVacio). */
  readonly envia?: boolean;
}

/** Un formulario con campos para completar y el botón que lo manda. */
export interface Formulario {
  /** Cómo se lo nombra: el texto de su botón, o su nombre accesible. */
  readonly nombre: string;
  /** Si hay varios con el mismo nombre, cuál es. */
  readonly n: number;
  /** Cuántos campos de texto tiene. */
  readonly campos: number;
  /** Tiene un campo de email: se prueba también con uno mal escrito. */
  readonly email?: boolean;
}

/** Qué pasó al mandar un formulario sin completar nada. */
export interface ReaccionAlVacio {
  /** Avisó qué falta: un campo marcado (el del navegador también), una alerta, un mensaje que apareció. */
  readonly aviso: boolean;
  /** Lo mandó igual: navegó, o salió un pedido que no es GET. */
  readonly seMando: boolean;
  readonly errores: readonly string[];
  readonly fallasDeRed: readonly string[];
  readonly textoDeError?: string;
  /** No se pudo ni probar: el botón no está o no se puede tocar. */
  readonly noSePudo?: string;
}

export interface Estado {
  /** Dónde está: la ruta y, en una app de una sola página, la vista activa. */
  readonly ruta: string;
  /** La forma de la pantalla: qué se puede tocar y qué títulos hay, sin datos. */
  readonly firma: string;
}

export interface Reaccion {
  readonly navego: boolean;
  /** Cambió algo visible: un texto, un panel que se abrió, un estado aria. */
  readonly cambio: boolean;
  /** Errores de la página o de la consola mientras duró la acción. */
  readonly errores: readonly string[];
  /** Pedidos al servidor que fallaron (4xx/5xx o sin respuesta). */
  readonly fallasDeRed: readonly string[];
  /** Un texto de error que apareció en la pantalla: «algo salió mal», «undefined»… */
  readonly textoDeError?: string;
  /** No se pudo ni tocar: lo tapa otra cosa, está fuera de la pantalla. */
  readonly noSePudo?: string;
  /** Lo único que cambió fue el propio elemento (un «Copiado», un «Guardando…»):
   *  es una respuesta, no una pantalla nueva que haya que explorar. */
  readonly soloElPropio?: boolean;
}

export interface Medicion {
  readonly tipo: string;
  readonly donde: string;
  readonly detalle: string;
}

export interface PaginaExplorable {
  ir(url: string): Promise<void>;
  estado(): Promise<Estado>;
  elementos(): Promise<Elemento[]>;
  tocar(elemento: Elemento): Promise<Reaccion>;
  /** Lo que la pantalla mide sola: desbordes, consola, red, foco… */
  medir(): Promise<Medicion[]>;
  /** La captura del momento —o de la página entera, de arriba abajo—; devuelve el nombre del archivo o nada. */
  capturar(nombre: string, opciones?: { readonly entera?: boolean }): Promise<string | undefined>;
  /** Dónde quedó después de un clic que navegó, si es del mismo sitio. */
  urlActual?(): Promise<string | undefined>;
  /** Segundos desde que empezó la grabación: el momento de cada error en el video. */
  tiempo?(): number;
  /** Los formularios de la pantalla (los de búsqueda no: vacíos son legítimos). */
  formularios?(): Promise<Formulario[]>;
  /** Manda el formulario sin completar nada, como alguien que toca «Guardar» de entrada. */
  enviarVacio?(formulario: Formulario): Promise<ReaccionAlVacio>;
  /** Lo manda con un email mal escrito («hola»), como alguien apurado. */
  enviarConEmailMalo?(formulario: Formulario): Promise<ReaccionAlVacio>;
}

// ── La cobertura ───────────────────────────────────────────────────────────

export interface EntradaDeCobertura {
  readonly ruta: string;
  readonly firma: string;
  readonly revisado: string;
  /** Cuántas cosas se tocaron y qué se encontró, para el parte. */
  readonly acciones: number;
  readonly hallazgos: number;
  /** Una invalidación la deja vieja: la próxima corrida la vuelve a revisar. */
  readonly vieja?: boolean;
}

export interface Cobertura {
  readonly estados: Record<string, EntradaDeCobertura>;
  /** El commit del repo cuando se revisó: lo que cambió desde ahí se invalida solo. */
  readonly head?: string;
}

const rutaCobertura = (repo: string) => join(repo, ".dolphin", "cobertura.json");

export async function leerCobertura(repo: string): Promise<Cobertura> {
  try {
    const datos = JSON.parse(await readFile(rutaCobertura(repo), "utf8")) as Partial<Cobertura>;
    return { estados: datos.estados ?? {}, ...(datos.head ? { head: datos.head } : {}) };
  } catch {
    return { estados: {} };
  }
}

export async function guardarCobertura(repo: string, cobertura: Cobertura): Promise<void> {
  await carpetaDeDolphin(repo);
  await writeFile(rutaCobertura(repo), `${JSON.stringify(cobertura, null, 2)}\n`);
}

const claveDe = (estado: Estado) => `${estado.ruta}#${estado.firma}`;

export function yaCubierto(cobertura: Cobertura, estado: Estado): boolean {
  const entrada = cobertura.estados[claveDe(estado)];
  return entrada !== undefined && !entrada.vieja;
}

/** Palabras de una ruta que pueden aparecer en el nombre de un archivo. */
function palabrasDe(ruta: string): string[] {
  return ruta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
}

/**
 * Lo que cambió vuelve a revisarse. Por superficie: la ruta que el agente
 * declaró tocar. Por archivos: si el nombre de un archivo del diff tiene
 * una palabra de la ruta (`/facturas` ↔ `src/facturas/lista.tsx`).
 */
export function invalidar(
  cobertura: Cobertura,
  cambios: { readonly superficies?: readonly string[]; readonly archivos?: readonly string[] },
): { cobertura: Cobertura; invalidados: number } {
  const superficies = (cambios.superficies ?? []).map((s) => s.toLowerCase().replace(/\/+$/, ""));
  const archivos = (cambios.archivos ?? []).map((a) => a.toLowerCase().replace(/\\/g, "/"));
  let invalidados = 0;

  const estados: Record<string, EntradaDeCobertura> = {};
  for (const [clave, entrada] of Object.entries(cobertura.estados)) {
    const ruta = entrada.ruta.toLowerCase();
    const porSuperficie = superficies.some((s) => s !== "" && (ruta === s || ruta.startsWith(`${s} `) || ruta.startsWith(`${s}/`) || ruta.includes(s)));
    const palabras = palabrasDe(entrada.ruta);
    const porArchivo = palabras.length > 0 && archivos.some((a) => palabras.some((p) => a.includes(p)));
    if ((porSuperficie || porArchivo) && !entrada.vieja) {
      estados[clave] = { ...entrada, vieja: true };
      invalidados += 1;
    } else {
      estados[clave] = entrada;
    }
  }
  return { cobertura: { estados }, invalidados };
}

// ── La exploración ─────────────────────────────────────────────────────────

export interface OpcionesExploracion {
  readonly inicio: string;
  /** Textos que nunca se tocan: lo que borra, paga, cierra sesión o lanza trabajo caro. */
  readonly noTocar?: readonly RegExp[];
  /** Cuántas cosas toca en total, como mucho. */
  readonly topeDeAcciones?: number;
  /** Cuántos elementos prueba por pantalla. */
  readonly topePorEstado?: number;
  /** Cuántos clics de profundidad sigue dentro de una app de una página. */
  readonly profundidad?: number;
  /** Cuántas pantallas visita, como mucho: los enlaces no cuentan como acciones. */
  readonly topeDeVisitas?: number;
}

/**
 * Lo que no se toca explorando. La app corre con los `.env` de verdad (ver
 * entorno.ts): un botón irreversible tocado «a ver qué hace» mergea, emite
 * una factura o le escribe a un cliente de verdad. En castellano y en inglés.
 */
/** Mandar algo: un botón suelto que manda no se toca; un formulario VACÍO sí se manda (ver NO_MANDAR_VACIO). */
const MANDA = /enviar|mandar|send|submit/i;

export const NO_TOCAR_POR_DEFECTO: readonly RegExp[] = [
  /borrar|eliminar|delete|remove|olvidar|descartar|vaciar|purge|wipe|destroy/i,
  /cerrar sesi[oó]n|log ?out|sign ?out|salir/i,
  /pagar|comprar|suscrib|checkout|cobrar|transferir|reembols|refund|pay|buy|purchase|charge/i,
  // Lo que lanza trabajo de verdad —y gasta tokens— no se toca explorando.
  /sembrar|implementar|arreglar|desplegar|deploy|publicar|publish/i,
  MANDA,
  /apagar|prender|desactivar|activar|disable|enable/i,
  // Lo que no tiene vuelta atrás: llevar a main, firmar, facturar, dar de baja.
  /merge|mergear|abrir (un )?pr|pull request|aprobar|approve|rechazar|reject|anular|void|revocar|revoke/i,
  /emitir|facturar|invoice|firmar|sign\b|cancelar|cancel|dar de baja|baja|unsubscribe|quitar|invitar|invite|restablecer|reset|archivar|archive/i,
  /^\s*(s[ií]|yes|ok|confirmar|confirm|aceptar|accept)\s*[.!]?\s*$/i,
];

/**
 * Lo que no se manda vacío: lo irreversible sí, pero «Mandar consulta» o
 * «Enviar» se prueban mandándolos sin nada, que es justo lo que hace alguien
 * que no sabe qué completar. Validado, no manda nada; sin validar, es el bug.
 */
export const sinMandar = (lista: readonly RegExp[]): RegExp[] => lista.filter((r) => r !== MANDA);

/** Adónde no se va, aunque el enlace diga otra cosa: un «Inicio» que apunta a /logout se visitaba. */
export const NO_IR_A: readonly RegExp[] = [/log-?out|sign-?out|salir|cerrar-?sesion|delete|borrar|eliminar|unsubscribe|baja/i];

export interface InformeDeExploracion {
  readonly revisados: readonly Estado[];
  /** Estados que se salteó porque ya estaban cubiertos y su código no cambió. */
  readonly salteados: number;
  readonly acciones: number;
  readonly asuntos: readonly AsuntoNuevo[];
  /** Lo que se tocó y anduvo: sirve para cerrar errores viejos que ya no pasan. */
  readonly sanas: readonly { readonly donde: string; readonly texto: string }[];
  /** Lo que se probó y anduvo, dicho como lo contaría quien lo probó: es evidencia a favor (ver vision.ts). */
  readonly comprobado: readonly string[];
  readonly cobertura: Cobertura;
}

interface Pendiente {
  readonly url: string;
  /** Los clics desde la URL para llegar al estado (apps de una sola página). */
  readonly camino: readonly Elemento[];
  readonly pasos: readonly string[];
}

const comoSeDice = (e: Elemento) => (e.rol === "enlace" ? `el enlace «${e.texto}»` : e.rol === "pestaña" ? `la pestaña «${e.texto}»` : `«${e.texto}»`);

export async function explorar(
  pagina: PaginaExplorable,
  cobertura: Cobertura,
  opciones: OpcionesExploracion,
): Promise<InformeDeExploracion> {
  const noTocar = opciones.noTocar ?? NO_TOCAR_POR_DEFECTO;
  const topeDeAcciones = opciones.topeDeAcciones ?? 60;
  const topePorEstado = opciones.topePorEstado ?? 12;
  const profundidad = opciones.profundidad ?? 3;
  const topeDeVisitas = opciones.topeDeVisitas ?? 40;
  // Solo el sitio que se explora: un enlace a otro host no es esta app. Un
  // inicio relativo («/») se resuelve contra un sitio cualquiera: lo que importa es que sea el mismo.
  const base = (() => {
    try {
      return new URL(opciones.inicio, "http://explorar.local");
    } catch {
      return undefined;
    }
  })();
  const sePuedeVisitar = (destino: string) => {
    if (!base) return true;
    try {
      const url = new URL(destino, base);
      return url.origin === base.origin && !NO_IR_A.some((r) => r.test(url.pathname + url.search));
    } catch {
      return false;
    }
  };

  const estados: Record<string, EntradaDeCobertura> = { ...cobertura.estados };
  const vistosEnEstaCorrida = new Set<string>();
  const encolados = new Set<string>();
  const revisados: Estado[] = [];
  const asuntos: AsuntoNuevo[] = [];
  const sanas: { donde: string; texto: string }[] = [];
  const comprobado: string[] = [];
  const firmasDeAsuntos = new Set<string>();
  let acciones = 0;
  let salteados = 0;

  const anotar = (asunto: AsuntoNuevo) => {
    // Dentro de una corrida, el mismo problema en el mismo lugar es uno.
    const clave = `${asunto.donde}|${asunto.titulo}`;
    if (firmasDeAsuntos.has(clave)) return;
    firmasDeAsuntos.add(clave);
    asuntos.push(asunto);
  };

  /** Volver a un estado: abrir la URL y repetir los clics del camino. */
  const llegar = async (p: Pendiente): Promise<boolean> => {
    await pagina.ir(p.url);
    for (const paso of p.camino) {
      const reaccion = await pagina.tocar(paso);
      if (reaccion.noSePudo) return false;
    }
    return true;
  };

  const cola: Pendiente[] = [{ url: opciones.inicio, camino: [], pasos: [`Abrí ${opciones.inicio}`] }];
  encolados.add(`${opciones.inicio}|`);

  /** Una pantalla de la cola: llegar, medir, tocar lo que hay y mandar sus formularios. */
  const revisarPendiente = async (actual: Pendiente): Promise<void> => {
    if (!(await llegar(actual))) return;

    const estado = await pagina.estado();
    const clave = claveDe(estado);

    // Una vez por corrida, y una vez entre corridas mientras el código no cambie.
    if (vistosEnEstaCorrida.has(clave)) return;
    vistosEnEstaCorrida.add(clave);
    if (yaCubierto({ estados }, estado)) {
      salteados += 1;
      // Cubierta no es «no pasar»: sus botones no se vuelven a probar, pero
      // se siguen sus enlaces y pestañas, o una pantalla hija que sí cambió
      // quedaría sin revisar para siempre.
      for (const e of await pagina.elementos()) {
        if (noTocar.some((r) => r.test(e.texto))) continue;
        if (e.rol === "enlace" && e.destino && !encolados.has(`${e.destino}|`) && sePuedeVisitar(e.destino)) {
          encolados.add(`${e.destino}|`);
          cola.push({ url: e.destino, camino: [], pasos: [...actual.pasos, `Tocá ${comoSeDice(e)}`] });
        } else if (e.rol === "pestaña" && actual.camino.length < profundidad) {
          const llave = `${actual.url}|${[...actual.camino, e].map((x) => `${x.rol}:${x.texto}:${x.n}`).join(">")}`;
          if (!encolados.has(llave)) {
            encolados.add(llave);
            cola.push({ url: actual.url, camino: [...actual.camino, e], pasos: [...actual.pasos, `Tocá ${comoSeDice(e)}`] });
          }
        }
      }
      return;
    }

    revisados.push(estado);
    let hallazgosAca = 0;
    let accionesAca = 0;

    // Lo que la pantalla muestra sola, apenas se llega. Si un elemento se
    // sale de la pantalla, «la página scrollea de costado» es el mismo
    // problema: se cuenta por su causa, una vez.
    const medidas = await pagina.medir();
    const hayCausa = medidas.some((m) => m.tipo === "desborde" && m.donde !== "la página");
    for (const m of medidas.filter((x) => !(hayCausa && x.tipo === "desborde" && x.donde === "la página"))) {
      hallazgosAca += 1;
      const momento = pagina.tiempo?.();
      anotar({ ...asuntoDeMedicion(m, estado, actual.pasos), ...(momento !== undefined ? { momento } : {}) });
    }

    const tocables = (await pagina.elementos()).filter((e) => !noTocar.some((r) => r.test(e.texto)));

    for (const elemento of tocables.slice(0, topePorEstado)) {
      if (acciones >= topeDeAcciones) break;
      // El botón que manda un formulario se prueba abajo, mandándolo vacío: como
      // botón suelto, el aviso del navegador («completá este campo») no se ve en
      // la página y pasaba por «no hace nada».
      if (elemento.envia && pagina.enviarVacio) continue;

      // Un enlace a otra página no se clickea: se encola, y se visita una vez.
      if (elemento.rol === "enlace" && elemento.destino) {
        const llave = `${elemento.destino}|`;
        if (!encolados.has(llave) && sePuedeVisitar(elemento.destino)) {
          encolados.add(llave);
          cola.push({ url: elemento.destino, camino: [], pasos: [...actual.pasos, `Tocá ${comoSeDice(elemento)}`] });
        }
        continue;
      }

      // Cada botón se prueba desde la pantalla limpia, como lo haría
      // alguien que recién llega: lo que tocó el anterior no lo contamina.
      if (!(await llegar(actual))) break;
      acciones += 1;
      accionesAca += 1;
      const reaccion = await pagina.tocar(elemento);
      const pasos = [...actual.pasos, `Tocá ${comoSeDice(elemento)}`];

      const problema = problemaDeReaccion(reaccion, elemento);
      if (problema) {
        hallazgosAca += 1;
        const captura = await pagina.capturar(`${estado.ruta}-${elemento.texto}`);
        const momento = pagina.tiempo?.();
        anotar({
          tipo: "error",
          titulo: problema.titulo,
          detalle: problema.detalle,
          donde: estado.ruta,
          pasos,
          ...(problema.evidencia ? { evidencia: problema.evidencia } : {}),
          ...(captura ? { captura } : {}),
          ...(momento !== undefined ? { momento } : {}),
          origen: "explorador",
        });
        continue;
      }
      sanas.push({ donde: estado.ruta, texto: elemento.texto });

      // Un botón que llevó a otra URL: esa página se visita una vez, como un enlace.
      if (reaccion.navego && pagina.urlActual) {
        const destino = await pagina.urlActual();
        if (destino && !encolados.has(`${destino}|`) && sePuedeVisitar(destino)) {
          encolados.add(`${destino}|`);
          cola.push({ url: destino, camino: [], pasos });
        }
        continue;
      }

      // Lo que cambió la pantalla sin navegar —un panel, una pestaña— puede
      // ser un estado nuevo de la misma URL. Se mira ahora, que ya se está
      // ahí: si es una pantalla conocida, no se encola ni se repite el clic.
      if (reaccion.cambio && !reaccion.soloElPropio && actual.camino.length < profundidad) {
        const despues = await pagina.estado();
        const llave = `${actual.url}|${[...actual.camino, elemento].map((e) => `${e.rol}:${e.texto}:${e.n}`).join(">")}`;
        if (!vistosEnEstaCorrida.has(claveDe(despues)) && claveDe(despues) !== clave && !encolados.has(llave)) {
          encolados.add(llave);
          cola.push({ url: actual.url, camino: [...actual.camino, elemento], pasos });
        }
      }
    }

    // Los formularios, mandados vacíos: lo primero que hace alguien que no sabe qué
    // completar es tocar «Guardar» a ver qué pasa. Tiene que avisar qué falta.
    if (pagina.formularios && pagina.enviarVacio && acciones < topeDeAcciones) {
      const noMandar = sinMandar(noTocar);
      const formularios = (await pagina.formularios()).filter((f) => !noMandar.some((r) => r.test(f.nombre)));
      // Vacío siempre; con un email mal escrito, si tiene dónde escribirlo.
      const pruebas = formularios.slice(0, topePorEstado).flatMap((formulario) => [
        { formulario, modo: "vacio" as const },
        ...(formulario.email && pagina.enviarConEmailMalo ? [{ formulario, modo: "email" as const }] : []),
      ]);
      for (const { formulario, modo } of pruebas) {
        if (acciones >= topeDeAcciones) break;
        if (!(await llegar(actual))) break;
        acciones += 1;
        accionesAca += 1;
        const reaccion = modo === "vacio" ? await pagina.enviarVacio(formulario) : await pagina.enviarConEmailMalo!(formulario);
        const problema = modo === "vacio" ? problemaDeFormularioVacio(reaccion, formulario) : problemaDeEmailMalo(reaccion, formulario);
        if (!problema) {
          if (!reaccion.noSePudo) {
            sanas.push({ donde: estado.ruta, texto: formulario.nombre });
            comprobado.push(
              modo === "vacio"
                ? `Mandé «${formulario.nombre}» sin completar nada y avisó qué faltaba (${estado.ruta})`
                : `Mandé «${formulario.nombre}» con un email mal escrito («hola») y avisó que estaba mal (${estado.ruta})`,
            );
          }
          continue;
        }
        hallazgosAca += 1;
        const captura = await pagina.capturar(`${estado.ruta}-${formulario.nombre}-${modo}`);
        const momento = pagina.tiempo?.();
        anotar({
          tipo: "error",
          titulo: problema.titulo,
          detalle: problema.detalle,
          donde: estado.ruta,
          pasos: [
            ...actual.pasos,
            modo === "vacio"
              ? `Sin completar ningún campo, tocá «${formulario.nombre}»`
              : `Escribí «hola» en el email y tocá «${formulario.nombre}»`,
          ],
          ...(problema.evidencia ? { evidencia: problema.evidencia } : {}),
          ...(captura ? { captura } : {}),
          ...(momento !== undefined ? { momento } : {}),
          origen: "explorador",
        });
      }
    }

    estados[clave] = {
      ruta: estado.ruta,
      firma: estado.firma,
      revisado: new Date().toISOString(),
      acciones: accionesAca,
      hallazgos: hallazgosAca,
    };
  };

  let visitas = 0;
  while (cola.length > 0 && acciones < topeDeAcciones && visitas < topeDeVisitas) {
    const actual = cola.shift()!;
    // Las visitas también cuentan: con solo el tope de acciones, un calendario con
    // «Mes siguiente» llegó a 301 páginas sin parar.
    visitas += 1;
    try {
      await revisarPendiente(actual);
    } catch (error) {
      // Una pantalla que no abre (un aviso de «cambios sin guardar», un servidor que la
      // rama tumbó) es un hallazgo de ESA pantalla, no el fin de la exploración entera.
      const mensaje = error instanceof Error ? error.message : String(error);
      const trabada = /se trabó/.test(mensaje);
      anotar({
        tipo: "error",
        titulo: trabada ? "La página se trabó: dejó de contestar" : "Una pantalla no se pudo abrir",
        detalle: mensaje.split("\n")[0]!.slice(0, 300),
        donde: actual.url,
        pasos: [...actual.pasos],
        origen: "explorador",
      });
      // Trabada, la página ya no contesta nada: no hay más que recorrer.
      if (trabada) break;
    }
  }

  return { revisados, salteados, acciones, asuntos, sanas, comprobado, cobertura: { estados } };
}

/** Lo único que cambia entre mandar un formulario vacío y mandarlo con un email mal escrito: cómo se cuenta. */
const COMO_SE_CUENTA = {
  vacio: {
    rompe: (q: string) => [`Mandar ${q} sin completar nada rompe la página`, `Toqué ${q} sin completar ningún campo y la página se rompió por dentro, en vez de avisar qué faltaba.`],
    falla: (q: string) => [`Mandar ${q} vacío hace fallar un pedido al servidor`, `Toqué ${q} sin completar nada: lo mandó igual y el servidor contestó con error. Lo tenía que frenar antes, avisando qué falta.`],
    texto: (q: string, error: string) => [`Mandar ${q} vacío muestra «${error}»`, `Toqué ${q} sin completar nada y la pantalla mostró «${error}»: un texto que nadie debería leer.`],
    seMando: (q: string) => [`${q} se manda vacío`, `Toqué ${q} sin completar ningún campo y lo mandó igual, sin avisar qué faltaba. Quien lo usa por primera vez termina guardando algo vacío.`],
    callado: (q: string) => [`Mandar ${q} vacío no avisa qué falta`, `Toqué ${q} sin completar nada y no pasó nada: ni un aviso ni un campo marcado. Quien lo usa no sabe qué le falta.`],
  },
  email: {
    rompe: (q: string) => [`Mandar ${q} con un email mal escrito rompe la página`, `Escribí «hola» en el email, toqué ${q} y la página se rompió por dentro, en vez de avisar que el email estaba mal.`],
    falla: (q: string) => [`Mandar ${q} con un email mal escrito hace fallar un pedido al servidor`, `Escribí «hola» en el email y toqué ${q}: lo mandó y el servidor contestó con error. Lo tenía que frenar antes, avisando que el email está mal.`],
    texto: (q: string, error: string) => [`Mandar ${q} con un email mal escrito muestra «${error}»`, `Escribí «hola» en el email, toqué ${q} y la pantalla mostró «${error}»: un texto que nadie debería leer.`],
    seMando: (q: string) => [`${q} acepta un email mal escrito`, `Escribí «hola» en el email y toqué ${q}: lo mandó igual. Quien se equivoca al tipear nunca recibe nada y no sabe por qué.`],
    callado: (q: string) => [`${q} no avisa que el email está mal escrito`, `Escribí «hola» en el email y toqué ${q}: no pasó nada, ni un aviso. Quien lo usa no sabe qué hizo mal.`],
  },
} as const;

/**
 * Qué cuenta como error al mandar un formulario (vacío, o con un email mal
 * escrito). Lo bueno es que avise; lo malo, que lo mande igual, que rompa o
 * que no diga nada. Si no se pudo ni probar, no es un hallazgo: el botón
 * suelto ya se cuenta aparte.
 */
function problemaDelEnvio(
  modo: keyof typeof COMO_SE_CUENTA,
  reaccion: ReaccionAlVacio,
  formulario: Formulario,
): { titulo: string; detalle: string; evidencia?: string } | null {
  if (reaccion.noSePudo) return null;
  const que = `«${formulario.nombre}»`;
  const contar = ([titulo, detalle]: readonly string[], evidencia?: string) => ({ titulo: titulo!, detalle: detalle!, ...(evidencia ? { evidencia } : {}) });
  const como = COMO_SE_CUENTA[modo];
  // Un pedido que falla deja también su «Failed to load resource»: se cuenta una vez, como pedido.
  const errores =
    reaccion.fallasDeRed.length > 0 ? reaccion.errores.filter((e) => !/failed to load resource/i.test(e)) : reaccion.errores;
  if (errores.length > 0) return contar(como.rompe(que), errores.slice(0, 5).join("\n"));
  if (reaccion.fallasDeRed.length > 0) return contar(como.falla(que), reaccion.fallasDeRed.slice(0, 5).join("\n"));
  if (reaccion.textoDeError) return contar(como.texto(que, reaccion.textoDeError));
  if (reaccion.aviso) return null;
  return contar(reaccion.seMando ? como.seMando(que) : como.callado(que));
}

/** Un formulario mandado vacío: tiene que avisar qué falta. */
export const problemaDeFormularioVacio = (reaccion: ReaccionAlVacio, formulario: Formulario) => problemaDelEnvio("vacio", reaccion, formulario);

/** Un email mal escrito que el formulario acepta sin decir nada. Lo de siempre (errores, pedidos que fallan) se cuenta igual. */
export const problemaDeEmailMalo = (reaccion: ReaccionAlVacio, formulario: Formulario) => problemaDelEnvio("email", reaccion, formulario);

/**
 * Qué cuenta como error al tocar algo, en voz de quien lo tocó: qué
 * intentaba, qué esperaba, qué pasó. Un botón que no hace nada es un
 * error aunque la consola esté limpia: una persona lo nota enseguida.
 */
export function problemaDeReaccion(
  reaccion: Reaccion,
  elemento: Elemento,
): { titulo: string; detalle: string; evidencia?: string } | null {
  const que = comoSeDice(elemento);

  if (reaccion.noSePudo) {
    return {
      titulo: `No se puede tocar ${que}`,
      detalle: `Quise tocar ${que} y no pude: ${reaccion.noSePudo}. Una persona ve el botón y no puede usarlo.`,
    };
  }
  // Un pedido que falla deja también un «Failed to load resource» en la
  // consola: es el mismo problema, y se cuenta una vez, como pedido.
  const errores =
    reaccion.fallasDeRed.length > 0 ? reaccion.errores.filter((e) => !/failed to load resource/i.test(e)) : reaccion.errores;
  if (errores.length > 0) {
    return {
      titulo: `Al tocar ${que} la página tira un error`,
      detalle: `Toqué ${que} y la página se rompió por dentro. Quien la usa puede no ver nada, pero lo que tenía que pasar no pasó entero.`,
      evidencia: errores.slice(0, 5).join("\n"),
    };
  }
  if (reaccion.fallasDeRed.length > 0) {
    return {
      titulo: `Al tocar ${que} falla un pedido al servidor`,
      detalle: `Toqué ${que} y un pedido al servidor volvió con error. Lo que dependía de esa respuesta queda a medias.`,
      evidencia: reaccion.fallasDeRed.slice(0, 5).join("\n"),
    };
  }
  if (reaccion.textoDeError) {
    return {
      titulo: `Al tocar ${que} aparece «${reaccion.textoDeError}»`,
      detalle: `Toqué ${que} y la pantalla mostró «${reaccion.textoDeError}»: un texto que nadie debería leer.`,
    };
  }
  if (!reaccion.navego && !reaccion.cambio) {
    return {
      titulo: `Tocar ${que} no hace nada`,
      detalle: `Toqué ${que} esperando que pasara algo —ir a otra pantalla, un mensaje, un cambio— y no pasó nada. Para quien lo usa, es un botón roto.`,
    };
  }
  return null;
}

const TITULO_DE_MEDICION: Record<string, string> = {
  desborde: "Algo se sale de la pantalla",
  "texto-cortado": "Un texto queda cortado",
  "target-chico": "Un botón es demasiado chico para el dedo",
  "foco-invisible": "Con el teclado no se ve dónde está el foco",
  "nombre-accesible": "Un control no dice qué hace",
  consola: "La página tira un error al abrirse",
  red: "Algo de la página no carga",
};

function asuntoDeMedicion(m: Medicion, estado: Estado, pasos: readonly string[]): AsuntoNuevo {
  return {
    tipo: "error",
    titulo: `${TITULO_DE_MEDICION[m.tipo] ?? "Algo no se ve bien"}: ${m.donde}`,
    detalle: m.detalle,
    donde: estado.ruta,
    pasos: [...pasos],
    origen: "explorador",
  };
}
