/// <reference lib="dom" />

/**
 * Lo que se mide DENTRO de la página.
 *
 * Esta función se serializa y corre en el navegador, así que no puede
 * referenciar nada de afuera: todo entra por parámetro.
 *
 * Todo lo de acá es determinista y no cuesta un token. Esa es la idea:
 * cuanto más se puede verificar gratis, más barato sale el turno entero.
 */

export interface Hallazgo {
  readonly tipo: string;
  /** Qué elemento, en palabras que sirvan para encontrarlo. */
  readonly donde: string;
  /** En voz humana, lo que se le muestra a la persona. */
  readonly detalle: string;
}

export interface OpcionesAuditoria {
  readonly tactil: boolean;
  readonly chequeos: readonly string[];
  /** Dejar marcado el elemento de cada hallazgo (para resaltarlo en el video). */
  readonly marcar?: boolean;
}

export function auditarPagina(opciones: OpcionesAuditoria): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const quiere = (c: string) => opciones.chequeos.includes(c);
  // Con video, el elemento culpable queda marcado: después se resalta en
  // cámara para que se vea DÓNDE está el problema, no solo que hay uno.
  const anotar = (el: Element, hallazgo: Hallazgo) => {
    hallazgos.push(hallazgo);
    if (opciones.marcar && !el.hasAttribute("data-dolphin-hallazgo")) {
      el.setAttribute("data-dolphin-hallazgo", `${hallazgo.donde}: ${hallazgo.detalle}`);
    }
  };
  const anchoVentana = window.innerWidth;

  const describir = (el: Element): string => {
    const etiqueta = el.tagName.toLowerCase();
    const clase = typeof el.className === "string" && el.className.trim() !== ""
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
    const texto = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    return `${etiqueta}${clase}${texto ? ` «${texto}»` : ""}`;
  };

  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const estilo = getComputedStyle(el);
    if (estilo.display === "none" || estilo.visibility === "hidden" || estilo.opacity === "0") return false;
    // Oculto A PROPÓSITO para lectores de pantalla (el `sr-only` de siempre:
    // 1 px y recortado). Su texto «no entra en la caja» por diseño: contarlo
    // como desborde era llenar el informe de falsos.
    if (r.width <= 1 && r.height <= 1) return false;
    if (estilo.clip === "rect(0px, 0px, 0px, 0px)" || estilo.clipPath === "inset(50%)") return false;
    return true;
  };

  /**
   * ¿Está adentro de algo que scrollea para el costado a propósito?
   * Una barra de navegación horizontal, un carrusel o una tabla ancha
   * tienen hijos fuera de la pantalla porque así se diseñaron. Sin esto,
   * el informe llama "desborde" a todo carrusel y nadie le cree más.
   */
  const dentroDeScrollHorizontal = (el: Element): boolean => {
    let padre = el.parentElement;
    while (padre && padre !== document.body) {
      const estilo = getComputedStyle(padre);
      if (estilo.overflowX === "auto" || estilo.overflowX === "scroll") return true;
      padre = padre.parentElement;
    }
    return false;
  };

  const todos = Array.from(document.querySelectorAll<HTMLElement>("body *"));

  // ── se sale de la pantalla ────────────────────────────
  if (quiere("desborde")) {
    for (const el of todos) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();

      if (r.right > anchoVentana + 1 && r.width < anchoVentana * 1.5 && !dentroDeScrollHorizontal(el)) {
        anotar(el, {
          tipo: "desborde",
          donde: describir(el),
          detalle: `se sale ${Math.round(r.right - anchoVentana)} px de la pantalla`,
        });
        continue;
      }

      const estilo = getComputedStyle(el);
      const puedeScrollear = estilo.overflowX === "auto" || estilo.overflowX === "scroll";
      // Una línea de código ancha adentro de un panel que scrollea de costado
      // es lo esperable: se lee scrolleando, como en cualquier visor de código.
      if (!puedeScrollear && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !dentroDeScrollHorizontal(el)) {
        // Solo cuenta si lo que se sale es TEXTO. Un adorno sin contenido
        // —un círculo con un ::after, un ícono— mide de más por el
        // pseudo-elemento y no es un bug: era el falso positivo que
        // llenaba el informe de ruido.
        const esTexto = el.children.length === 0 && (el.textContent ?? "").trim() !== "";
        if (esTexto && estilo.textOverflow !== "ellipsis") {
          anotar(el, {
            tipo: "desborde",
            donde: describir(el),
            detalle: `el contenido es ${el.scrollWidth - el.clientWidth} px más ancho que su caja`,
          });
        }
      }
    }

    if (document.documentElement.scrollWidth > anchoVentana + 1) {
      hallazgos.push({
        tipo: "desborde",
        donde: "la página",
        detalle: `scrollea ${document.documentElement.scrollWidth - anchoVentana} px para el costado`,
      });
    }
  }

  // ── texto cortado sin forma de leerlo entero ──────────
  if (quiere("texto-cortado")) {
    for (const el of todos) {
      if (!visible(el) || el.children.length > 0) continue;
      const estilo = getComputedStyle(el);
      if (estilo.textOverflow !== "ellipsis") continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (el.title || el.getAttribute("aria-label")) continue;
      // El tooltip de un ancestro también aparece al pasar por encima: si su
      // title trae el texto entero, se puede leer (una fila con title y el
      // nombre cortado adentro no es un problema).
      const conTitulo = el.parentElement?.closest("[title]");
      const texto = (el.textContent ?? "").trim();
      if (conTitulo && texto !== "" && (conTitulo.getAttribute("title") ?? "").includes(texto)) continue;

      anotar(el, {
        tipo: "texto-cortado",
        donde: describir(el),
        detalle: "queda cortado con puntos suspensivos y no hay manera de leerlo entero (falta title)",
      });
    }
  }

  // ── el dedo no llega ──────────────────────────────────
  if (quiere("target-chico") && opciones.tactil) {
    const tocables = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]"),
    );
    for (const el of tocables) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const lado = Math.min(r.width, r.height);
      if (lado < 44) {
        anotar(el, {
          tipo: "target-chico",
          donde: describir(el),
          detalle: `mide ${Math.round(r.width)}×${Math.round(r.height)} px y para el dedo hacen falta 44`,
        });
      }
    }
  }

  // ── la pantalla quedó en blanco sin decir que está cargando ──
  if (quiere("espera-sin-aviso")) {
    const texto = (document.body.textContent ?? "").trim();
    const algoSeMueve =
      document.querySelectorAll("[aria-busy='true'], progress, [role='progressbar']").length > 0 ||
      /cargando|loading|esperá|aguardá/i.test(texto);

    if (texto.length < 40 && !algoSeMueve) {
      hallazgos.push({
        tipo: "espera-sin-aviso",
        donde: "la pantalla",
        detalle: "con la red lenta queda en blanco y nada dice que está cargando",
      });
    }
  }

  // ── algo que se toca y no se sabe qué es ──────────────
  if (quiere("nombre-accesible")) {
    const tocables = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href], [role=button]"),
    );
    for (const el of tocables) {
      if (!visible(el)) continue;
      const texto = (el.textContent ?? "").trim();
      const nombre = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
      if (texto === "" && nombre === "") {
        anotar(el, {
          tipo: "nombre-accesible",
          donde: describir(el),
          detalle: "no dice qué hace: sin texto y sin aria-label, un lector de pantalla lo anuncia vacío",
        });
      }
    }
  }

  // ── el texto no se lee contra su fondo (WCAG AA) ──────
  if (quiere("contraste")) {
    // Un canvas de 1 px normaliza cualquier color que entienda el navegador
    // (hex, rgb, oklab, color-mix): así no hay que parsear cada sintaxis.
    const lienzo = document.createElement("canvas");
    lienzo.width = 1;
    lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    const rgba = (css: string): [number, number, number, number] | null => {
      if (!ctx) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const sobre = (arriba: [number, number, number, number], abajo: [number, number, number]): [number, number, number] => [
      arriba[0] * arriba[3] + abajo[0] * (1 - arriba[3]),
      arriba[1] * arriba[3] + abajo[1] * (1 - arriba[3]),
      arriba[2] * arriba[3] + abajo[2] * (1 - arriba[3]),
    ];
    const canal = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luz = (c: [number, number, number]) => 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);

    /** El fondo que se ve detrás: las capas con transparencia, apiladas. Sin imagen de fondo: con una, no se puede saber. */
    const fondoDe = (el: Element): [number, number, number] | null => {
      const capas: [number, number, number, number][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const estilo = getComputedStyle(n);
        if (estilo.backgroundImage !== "none") return null;
        const c = rgba(estilo.backgroundColor);
        if (c && c[3] > 0) capas.push(c);
        if (c && c[3] >= 1) break;
      }
      let base: [number, number, number] = [255, 255, 255];
      for (const capa of capas.reverse()) base = sobre(capa, base);
      return base;
    };

    for (const el of todos) {
      if (!visible(el)) continue;
      // Solo lo que tiene texto propio, con letras o números: un «·» de
      // adorno no se lee, se ve.
      const propio = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (!/[\p{L}\p{N}]/u.test(propio)) continue;
      // Lo desactivado está exento (WCAG 1.4.3): se ve apagado a propósito.
      if (el.closest("[disabled], [aria-disabled='true']")) continue;

      const estilo = getComputedStyle(el);
      const color = rgba(estilo.color);
      const fondo = fondoDe(el);
      if (!color || !fondo) continue;
      let opacidad = 1;
      for (let n: Element | null = el; n; n = n.parentElement) opacidad *= Number.parseFloat(getComputedStyle(n).opacity) || 1;
      const texto = sobre([color[0], color[1], color[2], color[3] * opacidad], fondo);

      const [a, b] = [luz(texto), luz(fondo)];
      const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const tam = Number.parseFloat(estilo.fontSize);
      const grande = tam >= 24 || (tam >= 18.66 && Number.parseInt(estilo.fontWeight, 10) >= 700);
      const minimo = grande ? 3 : 4.5;
      if (contraste < minimo) {
        anotar(el, {
          tipo: "contraste",
          donde: describir(el),
          detalle: `se lee mal: contraste ${contraste.toFixed(1).replace(".", ",")}:1 contra su fondo y hace falta ${String(minimo).replace(".", ",")}`,
        });
      }
    }
  }

  return hallazgos;
}

/**
 * Resalta en pantalla lo que se encontró: un borde en cada elemento marcado
 * y un cartel con el primer problema, abajo, como un subtítulo. Es lo que
 * hace que el video se entienda sin explicación (y que su portada lo diga).
 * Devuelve cuántos resaltó.
 */
export function resaltarHallazgos(): number {
  const marcados = Array.from(document.querySelectorAll<HTMLElement>("[data-dolphin-hallazgo]"));
  for (const el of marcados) {
    el.style.outline = "3px solid #e5776d";
    el.style.outlineOffset = "2px";
  }
  const primero = marcados[0];
  if (!primero) return 0;
  primero.scrollIntoView({ block: "center" });
  const cartel = document.createElement("div");
  cartel.textContent = primero.getAttribute("data-dolphin-hallazgo");
  Object.assign(cartel.style, {
    position: "fixed",
    left: "8px",
    right: "8px",
    bottom: "8px",
    zIndex: "2147483647",
    background: "#e5776d",
    color: "#0a0a0a",
    font: "600 13px/1.4 system-ui, sans-serif",
    padding: "8px 10px",
    borderRadius: "8px",
  });
  document.body.appendChild(cartel);
  return marcados.length;
}

/**
 * Anota el elemento que tiene el foco y dice si ya había pasado por ahí:
 * es como se sabe que el Tab dio la vuelta entera. La lista vive en un
 * WeakSet de la ventana, no en atributos: no se le toca el DOM a la app.
 */
export function marcarFoco(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const ventana = window as unknown as { __dolphinTab?: WeakSet<Element> };
  ventana.__dolphinTab ??= new WeakSet();
  if (ventana.__dolphinTab.has(el)) return true;
  ventana.__dolphinTab.add(el);
  return false;
}

/**
 * Esperar a que la pantalla se quede quieta: que terminen las animaciones
 * que terminan (las infinitas —un spinner, un pulso— no cuentan). Medir a
 * mitad de una entrada con fundido daba contrastes de 1:1 que no existen.
 * Tope de 2,5 s: una pantalla que nunca se queda quieta igual se mide.
 */
export async function esperarQuietud(): Promise<void> {
  const tope = Date.now() + 2500;
  while (Date.now() < tope) {
    const corriendo = document.getAnimations().filter((a) => {
      if (a.playState !== "running") return false;
      const tiempo = a.effect?.getComputedTiming();
      return tiempo ? tiempo.iterations !== Infinity : false;
    });
    if (corriendo.length === 0) break;
    await Promise.race([
      Promise.all(corriendo.map((a) => a.finished.catch(() => undefined))),
      new Promise((listo) => setTimeout(listo, 250)),
    ]);
  }
  // Dos cuadros más: lo que dejó la última animación, ya pintado.
  await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(() => listo(undefined))));
}

/**
 * Tabular y mirar si el foco se ve. Se corre aparte porque necesita teclear.
 *
 * «Se ve» quiere decir que algo cambia al enfocar: el anillo o la sombra
 * del propio elemento, o el borde, el fondo o la sombra de lo que lo
 * envuelve (un compositor marca el foco en la tarjeta entera, no en el
 * textarea que la llena). Se compara contra el mismo elemento sin foco:
 * sin esa comparación, una tarjeta con sombra fija pasaría por foco visible.
 */
export function focoSeVe(): { visible: boolean; donde: string } {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return { visible: false, donde: "nada tiene el foco" };

  const etiqueta = el.tagName.toLowerCase();
  const texto = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
  const donde = `${etiqueta}${texto ? ` «${texto}»` : ""}`;

  const estilo = getComputedStyle(el);
  const tieneAnillo =
    (estilo.outlineStyle !== "none" && Number.parseFloat(estilo.outlineWidth) > 0) ||
    (estilo.boxShadow !== "none" && estilo.boxShadow.trim() !== "");
  if (tieneAnillo) return { visible: true, donde };

  const cadena: Element[] = [];
  for (let n: Element | null = el; n && n !== document.body && cadena.length < 4; n = n.parentElement) cadena.push(n);
  const huella = (n: Element) => {
    const e = getComputedStyle(n);
    return [e.outlineStyle, e.outlineWidth, e.outlineColor, e.boxShadow, e.borderTopColor, e.borderBottomColor, e.backgroundColor].join("|");
  };

  // Sin transiciones mientras se mide: si no, recién enfocado o recién
  // soltado, el estilo está a mitad de camino y no se nota la diferencia.
  const quieto = document.createElement("style");
  quieto.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
  document.head.appendChild(quieto);
  const conFoco = cadena.map(huella);
  el.blur();
  const sinFoco = cadena.map(huella);
  el.focus({ preventScroll: true });
  quieto.remove();

  return { visible: conFoco.some((h, i) => h !== sinFoco[i]), donde };
}
