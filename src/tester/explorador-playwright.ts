import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { auditarPagina } from "./auditoria.js";
import { abrirNavegador } from "./pantalla.js";
import type { Elemento, Estado, Formulario, Medicion, PaginaExplorable, Reaccion, ReaccionAlVacio, Rol } from "./explorador.js";

/**
 * El explorador con un Chrome de verdad. Es el ÚNICO archivo que sabe de
 * Playwright: la lógica de qué tocar y qué cuenta como error vive en
 * `explorador.ts` y se prueba sin navegador.
 *
 * Usa el Chrome instalado (`channel: "chrome"`), igual que el escalón de
 * pantalla: quien no explora no baja 150 MB de navegadores.
 */

export interface OpcionesNavegador {
  readonly ancho?: number;
  readonly alto?: number;
  /** Dónde se guardan las capturas de los errores. */
  readonly carpetaCapturas: string;
  /** Si viene, se graba el recorrido entero en video ahí. */
  readonly carpetaVideo?: string;
}

export interface NavegadorExplorable {
  readonly pagina: PaginaExplorable;
  /** Si se pidió video y no se pudo grabar, por qué. */
  readonly avisoVideo?: string;
  /** Cierra todo; si se grabó, devuelve la ruta del video. */
  cerrar(): Promise<string | undefined>;
}

interface Crudo {
  readonly rol: Rol;
  readonly texto: string;
  readonly n: number;
  readonly destino?: string;
  readonly envia?: boolean;
}

/**
 * Lo que se puede tocar en la pantalla, en orden. Corre ADENTRO del
 * navegador, así que no referencia nada de afuera. Con `marcar`, además
 * le pone una marca al elemento pedido para clickearlo: así un botón se
 * vuelve a encontrar después de recargar, por lo que dice y no por dónde
 * estaba.
 */
function recolectar(marcar: { rol: string; texto: string; n: number } | null): Crudo[] {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const e = getComputedStyle(el);
    return e.display !== "none" && e.visibility !== "hidden" && Number(e.opacity) > 0.05;
  };
  const textoDe = (el: Element) =>
    (
      el.getAttribute("aria-label") ||
      // La primera línea: una fila con título y metadatos se nombra por el título.
      ((el as HTMLElement).innerText ?? "").split("\n").find((l) => l.trim() !== "") ||
      el.getAttribute("title") ||
      (el as HTMLInputElement).value ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

  document.querySelectorAll("[data-dolphin-tocar]").forEach((el) => el.removeAttribute("data-dolphin-tocar"));

  // Con un menú, una lista o una ventana abierta, una persona elige algo
  // de ahí adentro (o lo cierra): no toca lo que quedó detrás. Tocarlo
  // daba «no se puede tocar: lo tapa otro elemento» en todo, un falso.
  const capas = Array.from(
    document.querySelectorAll(
      '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], dialog[open], [data-radix-popper-content-wrapper]',
    ),
  ).filter(visible);
  const raiz: ParentNode = capas.length > 0 ? capas[capas.length - 1]! : document;

  const candidatos = Array.from(
    raiz.querySelectorAll(
      'a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], summary',
    ),
  );
  const cuenta = new Map<string, number>();
  const lista: Crudo[] = [];

  for (const el of candidatos) {
    if (!visible(el)) continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el.closest("[inert]")) continue;
    const actual = el.getAttribute("aria-current");
    if ((actual && actual !== "false") || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true") continue;
    const texto = textoDe(el);
    if (texto === "") continue;

    let rol: Rol = "boton";
    let destino: string | undefined;
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute("href") ?? "";
      let url: URL | null = null;
      try {
        url = new URL(el.href);
      } catch {
        url = null;
      }
      // Otro sitio, un mail, un teléfono: no es parte de esta app.
      if (!url || url.origin !== location.origin || /^(mailto|tel|javascript):/i.test(href)) continue;
      const mismaPagina = url.pathname === location.pathname && url.search === location.search;
      // «#» a secas o javascript: es un botón disfrazado de enlace: se prueba.
      if (href === "#" || href === "") {
        rol = "boton";
      } else if (mismaPagina) {
        // Un enlace a donde ya estás (el «Inicio» de la barra estando en el
        // inicio) o a un ancla de la misma página: que no cambie nada es lo
        // esperado. Probarlo era reportar un botón roto que no lo es.
        continue;
      } else {
        rol = "enlace";
        destino = url.href.split("#")[0];
      }
    } else if (el.getAttribute("role") === "tab" || el.parentElement?.matches('nav, [role="tablist"]')) {
      rol = "pestaña";
    }

    // El botón que manda un formulario con campos de texto —no uno de búsqueda,
    // que vacío es legítimo— se prueba mandándolo vacío (ver enviarVacio).
    const form = (el as HTMLButtonElement).form ?? null;
    const envia =
      form !== null &&
      (el as HTMLButtonElement).type === "submit" &&
      !form.closest('[role="search"]') &&
      !form.querySelector('input[type="search"]') &&
      Array.from(form.querySelectorAll("input, textarea")).some((c) => {
        const tipo = (c as HTMLInputElement).type;
        return (
          visible(c) &&
          !["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "image", "range", "color"].includes(tipo) &&
          !(c as HTMLInputElement).disabled &&
          !(c as HTMLInputElement).readOnly
        );
      });

    const clave = `${rol}|${texto}`;
    const n = cuenta.get(clave) ?? 0;
    cuenta.set(clave, n + 1);
    lista.push({ rol, texto, n, ...(destino ? { destino } : {}), ...(envia ? { envia: true } : {}) });

    if (marcar && marcar.rol === rol && marcar.texto === texto && marcar.n === n) {
      el.setAttribute("data-dolphin-tocar", "1");
    }
  }
  return lista;
}

/**
 * Los formularios de la pantalla que se pueden mandar vacíos: con campos de
 * texto y un botón que los manda, y que no sean de búsqueda. Con `marcar`,
 * marca el pedido y su botón, y le vacía los campos con el setter nativo
 * (así React y compañía se enteran). Corre en el navegador.
 */
function listarFormularios(
  marcar: { nombre: string; n: number; email?: boolean } | null,
): { nombre: string; n: number; campos: number; email?: boolean }[] {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const e = getComputedStyle(el);
    return e.display !== "none" && e.visibility !== "hidden" && Number(e.opacity) > 0.05;
  };
  document.querySelectorAll("[data-dolphin-form]").forEach((el) => el.removeAttribute("data-dolphin-form"));
  document.querySelectorAll("[data-dolphin-enviar]").forEach((el) => el.removeAttribute("data-dolphin-enviar"));
  const cuenta = new Map<string, number>();
  const lista: { nombre: string; n: number; campos: number; email?: boolean }[] = [];
  // Un campo de email: por su tipo o, si no lo declara, por cómo se llama.
  const esEmail = (c: HTMLInputElement | HTMLTextAreaElement) =>
    (c as HTMLInputElement).type === "email" ||
    /e-?mail|correo/i.test(`${c.getAttribute("name") ?? ""} ${c.id} ${c.getAttribute("placeholder") ?? ""} ${c.getAttribute("autocomplete") ?? ""}`);
  for (const form of Array.from(document.querySelectorAll("form"))) {
    if (!visible(form) || form.closest('[role="search"]') || form.querySelector('input[type="search"]')) continue;
    const campos = Array.from(form.querySelectorAll("input, textarea")).filter((c) => {
      const tipo = (c as HTMLInputElement).type;
      return (
        visible(c) &&
        !["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "image", "range", "color"].includes(tipo) &&
        !(c as HTMLInputElement).disabled &&
        !(c as HTMLInputElement).readOnly
      );
    }) as (HTMLInputElement | HTMLTextAreaElement)[];
    if (campos.length === 0) continue;
    const boton = Array.from(form.querySelectorAll('button, input[type="submit"]')).find(
      (b) => visible(b) && (b as HTMLButtonElement).type === "submit",
    );
    if (!boton) continue;
    const nombre = (
      boton.getAttribute("aria-label") ||
      (boton as HTMLElement).innerText ||
      (boton as HTMLInputElement).value ||
      form.getAttribute("aria-label") ||
      "Enviar"
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const n = cuenta.get(nombre) ?? 0;
    cuenta.set(nombre, n + 1);
    const conEmail = campos.some(esEmail);
    lista.push({ nombre, n, campos: campos.length, ...(conEmail ? { email: true } : {}) });
    if (marcar && marcar.nombre === nombre && marcar.n === n) {
      form.setAttribute("data-dolphin-form", "1");
      boton.setAttribute("data-dolphin-enviar", "1");
      for (const c of campos) {
        const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        // Todo vacío; o, si se pidió, «hola» en el email: lo que escribe alguien apurado.
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(c, marcar.email && esEmail(c) ? "hola" : "");
        c.dispatchEvent(new Event("input", { bubbles: true }));
        c.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
  return lista;
}

/** Después de mandarlo vacío: ¿avisó qué falta? Corre en el navegador. */
function avisoDelFormulario(): { hay: boolean; invalido: boolean; alerta: boolean; texto: string } {
  const form = document.querySelector('[data-dolphin-form="1"]') as HTMLFormElement | null;
  const alerta = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]')).some(
    (el) => ((el as HTMLElement).innerText ?? "").trim() !== "",
  );
  if (!form) return { hay: false, invalido: false, alerta, texto: "" };
  // checkValidity() es lo que frena el navegador con un «required»: su globito no está en la página.
  const invalido = !form.checkValidity() || form.querySelector('[aria-invalid="true"]') !== null;
  return { hay: true, invalido, alerta, texto: (form.innerText ?? "").replace(/\s+/g, " ").trim() };
}

/** Dónde estoy y la forma de la pantalla, sin los datos. Corre en el navegador. */
function describir(): { ruta: string; forma: string } {
  const activa =
    document.querySelector('[aria-current="page"]') ?? document.querySelector('[role="tab"][aria-selected="true"]');
  const vista = activa ? (activa.getAttribute("aria-label") || (activa as HTMLElement).innerText || "").trim() : "";
  const ruta = `${location.pathname}${location.hash}${vista ? ` · ${vista}` : ""}`;

  // La forma: qué se puede tocar, con su estado. Un texto largo es dato
  // (una tarea, una fila), no forma: se cuenta como «largo» para que una
  // cosecha nueva no parezca una pantalla nueva.
  const partes = new Set<string>();
  document
    .querySelectorAll('a[href], button, [role="button"], [role="tab"], input, select, textarea, [role="dialog"], dialog[open]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const etiqueta = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("placeholder") || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\d+/g, "#");
      const texto = etiqueta.length > 40 ? "<largo>" : etiqueta;
      const estados = ["aria-expanded", "aria-pressed", "aria-selected", "aria-checked"]
        .map((a) => el.getAttribute(a) ?? "")
        .join("");
      partes.add(`${el.tagName.toLowerCase()}:${el.getAttribute("role") ?? ""}:${texto}:${estados}`);
    });
  return { ruta, forma: [...partes].sort().join("\n") };
}

/** Una instantánea para comparar antes y después de un clic. Corre en el navegador. */
function instantanea(): { url: string; huella: string; huellaSinTocado: string; dialogos: number } {
  const estados = Array.from(document.querySelectorAll("[aria-expanded], [aria-pressed], [aria-selected], [aria-checked]"))
    .map((el) => ["aria-expanded", "aria-pressed", "aria-selected", "aria-checked"].map((a) => el.getAttribute(a) ?? "").join(""))
    .join("|");
  const valores = Array.from(document.querySelectorAll("input, textarea, select"))
    .map((el) => (el as HTMLInputElement).value ?? "")
    .join("|");
  // La misma huella sin el elemento tocado: si solo cambió él (su propio
  // «Copiado»), fue una respuesta y no una pantalla nueva.
  const copia = document.body.cloneNode(true) as HTMLElement;
  copia.querySelectorAll("[data-dolphin-tocar]").forEach((el) => el.remove());
  return {
    url: location.href,
    huella: `${document.body.innerText.slice(0, 20000)}\n${estados}\n${valores}`,
    huellaSinTocado: (copia.textContent ?? "").replace(/\s+/g, " ").slice(0, 20000),
    dialogos: document.querySelectorAll('[role="dialog"], dialog[open], [role="alertdialog"]').length,
  };
}

const TEXTO_DE_ERROR =
  /algo sali[oó] mal|something went wrong|error inesperado|unexpected error|\bundefined\b|\bNaN\b|\[object Object\]|cannot read propert/i;

/** Lo que apareció en la pantalla después del clic y no estaba antes. */
function textoDeErrorNuevo(antes: string, despues: string): string | undefined {
  const viejas = new Set(antes.split("\n").map((l) => l.trim()));
  for (const linea of despues.split("\n")) {
    const l = linea.trim();
    if (l === "" || viejas.has(l)) continue;
    const m = TEXTO_DE_ERROR.exec(l);
    if (m) return m[0];
  }
  return undefined;
}

function porQueNoSePudo(mensaje: string): string {
  if (/intercepts pointer events/i.test(mensaje)) return "lo tapa otro elemento";
  if (/not visible|outside of the viewport/i.test(mensaje)) return "no se ve o queda fuera de la pantalla";
  if (/not enabled|disabled/i.test(mensaje)) return "está deshabilitado";
  if (/timeout/i.test(mensaje)) return "no responde al clic";
  return mensaje.split("\n")[0]!.slice(0, 120);
}

/** Hasta dónde llega una captura de la página entera, en px. */
const TOPE_DE_ALTO = 3200;

/** Lo más que se espera a que la página conteste algo: medir o listar no tarda más que esto. */
const TOPE_DE_EVALUAR = 10_000;

export async function abrirNavegadorExplorable(opciones: OpcionesNavegador): Promise<NavegadorExplorable | null> {
  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    return null;
  }

  const navegador = await abrirNavegador(chromium);
  if (!navegador) return null;

  try {
    const ancho = opciones.ancho ?? 1440;
    const alto = opciones.alto ?? 900;
    if (opciones.carpetaVideo) await mkdir(opciones.carpetaVideo, { recursive: true });
    await mkdir(opciones.carpetaCapturas, { recursive: true });

    const crear = async (conVideo: boolean) => {
      const contexto = await navegador.newContext({
        viewport: { width: ancho, height: alto },
        permissions: ["clipboard-read", "clipboard-write"],
        ...(conVideo && opciones.carpetaVideo
          ? { recordVideo: { dir: opciones.carpetaVideo, size: { width: ancho, height: alto } } }
          : {}),
      });
      return { contexto, pagina: await contexto.newPage() };
    };

    // Grabar necesita el ffmpeg de Playwright. Si no está, se explora igual
    // sin video y se avisa cómo prenderlo: un video que falta no es motivo
    // para no buscar errores.
    let avisoVideo: string | undefined;
    let abierto: Awaited<ReturnType<typeof crear>>;
    try {
      abierto = await crear(Boolean(opciones.carpetaVideo));
    } catch (error) {
      if (!opciones.carpetaVideo || !/ffmpeg/i.test(String(error))) throw error;
      avisoVideo = "no se grabó video: falta el ffmpeg de Playwright (npx playwright-core install ffmpeg)";
      abierto = await crear(false);
    }
    const { contexto, pagina } = abierto;
    // El reloj del video: cada error sabe en qué segundo de la grabación pasó.
    const arranque = Date.now();
    // Un enlace con target=_blank abre otra pestaña: se cierra sola, el
    // recorrido sigue en la original.
    contexto.on("page", (otra: any) => {
      if (otra !== pagina) void otra.close().catch(() => {});
    });
    // Ver el comentario de pantalla.ts: esbuild agrega __name y en el navegador no existe.
    await pagina.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

    let origen = "";
    const errores: string[] = [];
    const red: string[] = [];
    const mismoSitio = (url: string) => {
      try {
        return new URL(url).origin === origen;
      } catch {
        return false;
      }
    };
    const camino = (url: string) => {
      try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
      } catch {
        return url;
      }
    };

    // Un clic que le pide algo al servidor hizo algo, aunque la pantalla no
    // cambie: «Refrescar» sin datos nuevos no es un botón roto.
    let pedidos = 0;
    // Y lo que se manda: un formulario vacío que sale como POST se mandó, aunque no navegue.
    let envios = 0;
    pagina.on("request", (r: any) => {
      if ((r.resourceType() === "fetch" || r.resourceType() === "xhr") && mismoSitio(r.url())) pedidos += 1;
      if (r.method() !== "GET" && mismoSitio(r.url())) envios += 1;
    });
    pagina.on("pageerror", (e: Error) => errores.push(e.message.slice(0, 300)));
    // El favicon lo pide el navegador solo: que falte no es un error de la app.
    const esFavicon = (url: string) => /\/favicon\.ico(\?|$)/i.test(url);
    pagina.on("console", (m: any) => {
      if (m.type() !== "error") return;
      const ubicacion = String(m.location?.()?.url ?? "");
      if (esFavicon(ubicacion)) return;
      errores.push(String(m.text()).slice(0, 300));
    });
    pagina.on("response", (r: any) => {
      if (r.status() >= 400 && mismoSitio(r.url()) && !esFavicon(r.url())) red.push(`${r.request().method()} ${camino(r.url())} → ${r.status()}`);
    });
    pagina.on("requestfailed", (r: any) => {
      const motivo = r.failure()?.errorText ?? "";
      // Un pedido que se corta porque la página navegó no es una falla.
      if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(motivo) || !mismoSitio(r.url())) return;
      red.push(`${r.method()} ${camino(r.url())} → ${motivo || "no respondió"}`);
    });
    // Un alert o un confirm bloquea todo: se cierra, y cuenta como «pasó algo».
    // El de «tenés cambios sin guardar» se acepta: descartarlo cancelaba la
    // navegación y la exploración entera se cortaba con ERR_ABORTED.
    let dialogos = 0;
    pagina.on("dialog", (d: any) => {
      dialogos += 1;
      void (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => {});
    });

    // Una página trabada (un `while(true)` después de un clic) no contesta
    // nunca, y `evaluate` no tiene tope: la siembra entera esperaba para
    // siempre. Al vencer se cierra la página y todo lo que sigue falla con el porqué.
    let trabada: string | undefined;
    const evaluar = async (fn: unknown, arg?: unknown): Promise<any> => {
      if (trabada) throw new Error(trabada);
      let reloj: ReturnType<typeof setTimeout> | undefined;
      const vencio = new Promise<never>((_, fallar) => {
        reloj = setTimeout(() => {
          trabada = "la página se trabó: dejó de contestar (un bucle que no termina)";
          void pagina.close({ runBeforeUnload: false }).catch(() => {});
          fallar(new Error(trabada));
        }, TOPE_DE_EVALUAR);
      });
      try {
        return await Promise.race([pagina.evaluate(fn, arg), vencio]);
      } finally {
        clearTimeout(reloj);
      }
    };

    const vaciar = () => {
      errores.length = 0;
      red.length = 0;
    };

    const explorable: PaginaExplorable = {
      async ir(url) {
        if (trabada) throw new Error(trabada);
        if (!origen) origen = new URL(url).origin;
        vaciar();
        await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await pagina.waitForLoadState("load", { timeout: 4000 }).catch(() => {});
        await pagina.waitForTimeout(400);
      },

      async estado(): Promise<Estado> {
        const { ruta, forma } = await evaluar(describir);
        return { ruta, firma: createHash("sha1").update(forma).digest("hex").slice(0, 12) };
      },

      async elementos(): Promise<Elemento[]> {
        return (await evaluar(recolectar, null)) as Elemento[];
      },

      async tocar(elemento): Promise<Reaccion> {
        vaciar();
        const dialogosAntes = dialogos;
        const pedidosAntes = pedidos;
        const antes = await evaluar(instantanea);
        const encontrados = (await evaluar(recolectar, { rol: elemento.rol, texto: elemento.texto, n: elemento.n })) as Crudo[];
        const esta = encontrados.some((e) => e.rol === elemento.rol && e.texto === elemento.texto && e.n === elemento.n);
        if (!esta) return { navego: false, cambio: false, errores: [], fallasDeRed: [], noSePudo: "ya no está en la pantalla" };

        try {
          await pagina.locator('[data-dolphin-tocar="1"]').first().click({ timeout: 3000 });
        } catch (error) {
          return {
            navego: false,
            cambio: false,
            errores: [],
            fallasDeRed: [],
            noSePudo: porQueNoSePudo(error instanceof Error ? error.message : String(error)),
          };
        }

        await pagina.waitForTimeout(550);
        await pagina.waitForLoadState("load", { timeout: 3000 }).catch(() => {});
        const despues = await evaluar(instantanea).catch(() => antes);

        const urlAntes = new URL(antes.url);
        const urlDespues = new URL(despues.url);
        const navego = urlAntes.pathname !== urlDespues.pathname || urlAntes.search !== urlDespues.search;
        const cambio =
          despues.huella !== antes.huella ||
          despues.dialogos !== antes.dialogos ||
          urlAntes.hash !== urlDespues.hash ||
          dialogos !== dialogosAntes ||
          pedidos !== pedidosAntes;
        const textoDeError = textoDeErrorNuevo(antes.huella, despues.huella);
        const soloElPropio =
          cambio && !navego && despues.huellaSinTocado === antes.huellaSinTocado && despues.dialogos === antes.dialogos;

        return {
          navego,
          cambio,
          errores: [...errores],
          fallasDeRed: [...red],
          ...(textoDeError ? { textoDeError } : {}),
          ...(soloElPropio ? { soloElPropio } : {}),
        };
      },

      async medir(): Promise<Medicion[]> {
        const medidos = (await pagina
          .evaluate(auditarPagina, { tactil: false, chequeos: ["desborde", "nombre-accesible"] })
          .catch(() => [])) as Medicion[];
        const deCarga: Medicion[] = [
          ...errores.map((e) => ({ tipo: "consola", donde: "al abrir la pantalla", detalle: e })),
          ...red.map((r) => ({ tipo: "red", donde: r.split(" → ")[0]!, detalle: `no cargó: ${r}` })),
        ];
        vaciar();
        return [...medidos, ...deCarga];
      },

      async capturar(nombre, opcionesDeCaptura) {
        const limpio = nombre
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);
        const archivo = `${limpio || "captura"}-${createHash("sha1").update(`${nombre}${Date.now()}`).digest("hex").slice(0, 6)}.png`;
        try {
          if (opcionesDeCaptura?.entera) {
            // La página entera, para que lo que quedó abajo del pliegue también se vea;
            // con un tope de alto, que una imagen de 9000 px el modelo la achica hasta no leerla.
            const altoTotal = Number(await evaluar(() => document.documentElement.scrollHeight).catch(() => alto));
            await pagina.screenshot({
              path: join(opciones.carpetaCapturas, archivo),
              fullPage: true,
              ...(altoTotal > TOPE_DE_ALTO ? { clip: { x: 0, y: 0, width: ancho, height: TOPE_DE_ALTO } } : {}),
            });
          } else {
            await pagina.screenshot({ path: join(opciones.carpetaCapturas, archivo) });
          }
          return archivo;
        } catch {
          return undefined;
        }
      },

      tiempo() {
        return Math.round((Date.now() - arranque) / 100) / 10;
      },

      async formularios(): Promise<Formulario[]> {
        return (await evaluar(listarFormularios, null).catch(() => [])) as Formulario[];
      },

      async urlActual() {
        const url = pagina.url() as string;
        return mismoSitio(url) ? url.split("#")[0] : undefined;
      },

      enviarVacio(formulario) {
        return mandar(formulario, false);
      },

      enviarConEmailMalo(formulario) {
        return mandar(formulario, true);
      },
    };

    /** Deja el formulario vacío (o con «hola» en el email), lo manda y mira qué pasó. */
    async function mandar(formulario: Formulario, conEmailMalo: boolean): Promise<ReaccionAlVacio> {
      vaciar();
      const nada = { aviso: false, seMando: false, errores: [], fallasDeRed: [] };
      const encontrados = (await evaluar(listarFormularios, { nombre: formulario.nombre, n: formulario.n, email: conEmailMalo })) as Formulario[];
      if (!encontrados.some((f) => f.nombre === formulario.nombre && f.n === formulario.n)) return { ...nada, noSePudo: "ya no está en la pantalla" };
      const antes = await evaluar(instantanea);
      const textoAntes = (await evaluar(avisoDelFormulario)).texto;
      const enviosAntes = envios;
      const dialogosAntes = dialogos;
      try {
        await pagina.locator('[data-dolphin-enviar="1"]').first().click({ timeout: 3000 });
      } catch (error) {
        return { ...nada, noSePudo: porQueNoSePudo(error instanceof Error ? error.message : String(error)) };
      }
      await pagina.waitForLoadState("load", { timeout: 3000 }).catch(() => {});

      /**
       * Se espera a que haya veredicto, en vez de mirar una sola vez después de
       * un rato fijo. Antes eran 600 ms y listo: cuando el navegador tardaba
       * más en marcar el campo inválido o en pintar el mensaje, el resultado
       * era «se manda vacío y no avisa» sobre un formulario que sí avisaba.
       * Eso no es un test que parpadea: es el portón acusando a la app de algo
       * que no hizo.
       */
      const sinAviso = { hay: false, invalido: false, alerta: false, texto: "" };
      // Más del doble de lo que se esperaba fijo antes, y se corta en cuanto hay
      // veredicto: solo gasta el tope el formulario que de verdad no hace nada.
      const hasta = Date.now() + 1500;
      let despues = antes;
      let navego = false;
      let quedo = sinAviso;
      let aviso = false;
      do {
        await pagina.waitForTimeout(100);
        despues = await evaluar(instantanea).catch(() => antes);
        const urlAntes = new URL(antes.url);
        const urlDespues = new URL(despues.url);
        navego = urlAntes.pathname !== urlDespues.pathname || urlAntes.search !== urlDespues.search;
        quedo = navego ? sinAviso : await evaluar(avisoDelFormulario).catch(() => sinAviso);
        // Avisó: un campo inválido (el «required» del navegador también), una alerta,
        // un mensaje nuevo adentro del formulario, o un alert() de los de antes.
        aviso = quedo.invalido || quedo.alerta || (quedo.hay && quedo.texto !== textoAntes) || dialogos !== dialogosAntes;
        // Mandarse también es un veredicto: no se espera de gusto al que ya navegó.
      } while (!aviso && !navego && envios === enviosAntes && Date.now() < hasta);
      const textoDeError = textoDeErrorNuevo(antes.huella, despues.huella);
      return {
        aviso,
        seMando: navego || envios > enviosAntes,
        errores: [...errores],
        fallasDeRed: [...red],
        ...(textoDeError ? { textoDeError } : {}),
      };
    }

    return {
      pagina: explorable,
      ...(avisoVideo ? { avisoVideo } : {}),
      async cerrar() {
        const video = pagina.video();
        // El navegador se cierra aunque el contexto no quiera: sin esto quedaba un Chrome abierto por siembra.
        try {
          await contexto.close();
        } finally {
          await navegador.close().catch(() => {});
        }
        return video ? ((await video.path().catch(() => undefined)) as string | undefined) : undefined;
      },
    };
  } catch (error) {
    // Algo falló después de lanzar Chrome (una carpeta, el contexto): no queda abierto.
    await navegador.close().catch(() => {});
    throw error;
  }
}
