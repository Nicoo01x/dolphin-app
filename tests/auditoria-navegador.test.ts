import { afterAll, describe, expect, it } from "vitest";
import { auditarPagina, esperarQuietud, focoSeVe, type Hallazgo } from "../src/tester/auditoria.js";

/**
 * Lo que el tester mide adentro de la página, en un Chrome de verdad: es la
 * única forma de probar estilos computados, :focus-within, colores en
 * cualquier sintaxis y animaciones. Sin Chrome ni Edge en la máquina, se
 * saltea (no es una falla de dolphin).
 */

async function abrirNavegador(): Promise<any | undefined> {
  try {
    const { chromium } = await import("playwright-core");
    for (const canal of ["chrome", "msedge"]) {
      try {
        return await chromium.launch({ channel: canal, headless: true });
      } catch {
        /* el próximo canal */
      }
    }
  } catch {
    /* sin playwright-core */
  }
  return undefined;
}

const navegador = await abrirNavegador();

async function paginaCon(html: string) {
  const pagina = await navegador.newPage();
  // esbuild le pone `__name` a las funciones y el navegador no lo conoce.
  await pagina.addInitScript("globalThis.__name = (f) => f");
  await pagina.setContent(html);
  return pagina;
}

describe.skipIf(!navegador)("el tester, adentro de la página", () => {
  afterAll(async () => navegador?.close());

  it("vale el foco marcado en lo que envuelve, y se sigue cazando el foco invisible", async () => {
    const pagina = await paginaCon(`
      <style>
        button, textarea, input { outline: none; }
        .tarjeta { border: 1px solid #333; }
        .tarjeta:focus-within { border-color: #fff; }
        .sombra-fija { box-shadow: 0 0 0 2px red; }
        .anillo:focus-visible { box-shadow: 0 0 0 2px blue; }
      </style>
      <button>sin nada</button>
      <div class="tarjeta"><textarea aria-label="la tarea"></textarea></div>
      <div class="sombra-fija"><input aria-label="campo" /></div>
      <button class="anillo">con anillo</button>
    `);

    const vistos: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      await pagina.keyboard.press("Tab");
      vistos.push((await pagina.evaluate(focoSeVe)).visible);
    }
    // 1: nada cambia → invisible. 2: cambia el borde de la tarjeta → se ve.
    // 3: hay una sombra, pero no cambia al enfocar → invisible. 4: anillo propio.
    expect(vistos).toEqual([false, true, false, true]);

    // Y medir no le roba el foco: el Tab sigue desde donde estaba.
    expect(await pagina.evaluate(() => document.activeElement?.textContent)).toBe("con anillo");
  });

  it("caza el texto que no se lee y deja en paz lo que está exento", async () => {
    const pagina = await paginaCon(`
      <body style="background:#171717; color:#fafafa; font: 14px sans-serif">
        <p id="bien">se lee bien</p>
        <p id="gris" style="color:#5a5a5a">gris sobre gris</p>
        <p id="mezcla" style="color: color-mix(in oklab, #a1a1a1 60%, transparent)">gris a medias</p>
        <p id="rojo" style="color:#c2524a">se cortó en test</p>
        <p id="grande" style="color:#7a7a7a; font-size:28px">título grande</p>
        <span style="color:#333">·</span>
        <button disabled style="color:#444; background:#171717">desactivado</button>
        <div style="opacity:.4"><p id="apagado">dentro de algo apagado</p></div>
      </body>
    `);

    const hallazgos: Hallazgo[] = await pagina.evaluate(auditarPagina, { tactil: false, chequeos: ["contraste"] });
    const textos = hallazgos.map((h) => h.donde.replace(/^[^«]*«|»$/g, ""));

    // El gris oscuro, el gris por color-mix, el rojo viejo de dolphin
    // (3,9:1) y lo que hereda una opacidad baja se cazan.
    expect(textos).toEqual(expect.arrayContaining(["gris sobre gris", "gris a medias", "se cortó en test", "dentro de algo apagado"]));
    // Lo legible, el título grande (3:1 alcanza), el «·» de adorno y el
    // botón desactivado, no.
    expect(textos).not.toEqual(expect.arrayContaining(["se lee bien"]));
    expect(textos).not.toContain("título grande");
    expect(textos).not.toContain("·");
    expect(textos).not.toContain("desactivado");
    expect(hallazgos.find((h) => h.donde.includes("se cortó"))?.detalle).toContain("3,9:1");
  });

  it("espera a que termine un fundido antes de medir: a mitad de camino, todo «se lee mal»", async () => {
    const pagina = await paginaCon(`
      <style>@keyframes entra { from { opacity: 0 } to { opacity: 1 } }</style>
      <body style="background:#0a0a0a; color:#fafafa">
        <p style="animation: entra 600ms linear both">recién llegado</p>
        <p style="animation: entra 1s linear infinite alternate">un pulso que nunca termina</p>
      </body>
    `);

    // El fundido, congelado al 20 %: con la máquina cargada, «esperar 150 ms»
    // no garantiza en qué punto está. A esa opacidad el texto «se lee mal»,
    // que es lo que pasaba midiendo apenas cargaba la página.
    await pagina.evaluate(() => {
      const [entrada] = document.getAnimations();
      entrada?.pause();
      if (entrada) entrada.currentTime = 120;
    });
    const apurado: Hallazgo[] = await pagina.evaluate(auditarPagina, { tactil: false, chequeos: ["contraste"] });
    expect(apurado.some((h) => h.donde.includes("recién llegado"))).toBe(true);
    await pagina.evaluate(() => document.getAnimations()[0]?.play());

    const desde = Date.now();
    await pagina.evaluate(esperarQuietud);
    // El pulso infinito no la hace esperar los 2,5 s del tope.
    expect(Date.now() - desde).toBeLessThan(2000);
    const quieto: Hallazgo[] = await pagina.evaluate(auditarPagina, { tactil: false, chequeos: ["contraste"] });
    expect(quieto.some((h) => h.donde.includes("recién llegado"))).toBe(false);
  });
});
