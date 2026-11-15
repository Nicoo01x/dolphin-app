import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buscarTarjeta, columnaDe, COLUMNAS, comentarTarjeta, crearTarjeta, leerTablero, moverTarjeta, NOMBRE_DE_COLUMNA, type Tarjeta } from "./nucleo/tarjetas.js";
import { esperar, laEsperan, laFrenan, listasParaHacer, soltar } from "./nucleo/tarjetas-espera.js";
import { compartirTablero, traerTablero } from "./nucleo/tablero-compartido.js";
import { documentoATarjetas } from "./nucleo/documento-a-tarjetas.js";
import { todosAlTablero } from "./nucleo/ideas-del-codigo.js";
import { issuesAlTablero } from "./nucleo/issues-al-tablero.js";
import { comoSeDice, parecidasA } from "./nucleo/parecidas.js";

/**
 * dolphin tarea                              el tablero, columna por columna
 * dolphin tarea nueva "título" [--detalle …] [--terminado …] [--bug | --idea] [--quien …]
 * dolphin tarea mover <id> <columna>         ideas · hacer · haciendo · revisar · hecho
 * dolphin tarea ver <id>
 * dolphin tarea comentar <id> "texto"
 * dolphin tarea esperar <id> <otra>         no arranca hasta que la otra esté en Hecho (soltar, al revés)
 * dolphin tarea listas                      lo que se puede hacer ya: Para hacer, sin nada que la frene
 * dolphin tarea desde <archivo.md>          cada ítem de su lista, una tarjeta
 * dolphin tarea todos                       los TODO del código, como ideas
 * dolphin tarea compartir [--rama R]        escribe el tablero en una rama de git, sin tocar tu árbol
 * dolphin tarea traer [--rama R]            trae lo que haya en esa rama (lo tuyo más nuevo no se pisa)
 *
 * El tablero del proyecto (ver docs/idea.md). El id se puede abreviar, como un hash de git.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: "string", default: process.cwd() },
    rama: { type: "string" },
    etiqueta: { type: "string" },
    detalle: { type: "string", default: "" },
    terminado: { type: "string", default: "" },
    quien: { type: "string", default: "" },
    bug: { type: "boolean", default: false },
    idea: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    ayuda: { type: "boolean", short: "h", default: false },
  },
});

const repo = resolve(values.repo ?? process.cwd());
const [accion = "lista", ...resto] = positionals;
// La hora y un poco de lo aleatorio: dos anotadas en el mismo milisegundo no comparten el corto.
const corto = (t: Tarjeta) => t.id.slice(0, 12);
const marca = (t: Tarjeta) => (t.tipo === "bug" ? "bug · " : "");

function ayuda(): never {
  console.error(`
  dolphin tarea · el tablero del proyecto

  dolphin tarea                              el tablero, columna por columna (--json)
  dolphin tarea nueva "título"               a Para hacer (con --idea, a Ideas)
      --detalle "…"      qué hay que hacer
      --terminado "…"    cómo se sabe que está terminada
      --bug | --idea     el tipo (por defecto, una tarea)
      --quien "…"        quién la toma: una persona, o agentes
  dolphin tarea mover <id> <columna>         ideas · hacer · haciendo · revisar · hecho
  dolphin tarea ver <id>
  dolphin tarea comentar <id> "texto"
  dolphin tarea esperar <id> <otra>          no arranca hasta que la otra esté en Hecho
  dolphin tarea soltar <id> <otra>           que deje de esperarla
  dolphin tarea listas                       lo que se puede hacer ya (--json)
  dolphin tarea desde <archivo.md>           cada ítem de su lista, una tarjeta
  dolphin tarea todos                        los TODO del código, como ideas
  dolphin tarea issues                       los issues abiertos de GitHub (--etiqueta X)
  dolphin tarea compartir                    el tablero a la rama dolphin/tablero (--rama)
  dolphin tarea traer                        lo que haya en esa rama (--rama)
`);
  process.exit(1);
}

try {
  if (values.ayuda) ayuda();
  if (accion === "lista") {
    const tablero = await leerTablero(repo);
    if (values.json) console.log(JSON.stringify(tablero, null, 2));
    else if (tablero.length === 0) console.log(`\n  El tablero está vacío. Anotá la primera: dolphin tarea nueva "lo que haya que hacer"\n`);
    else {
      console.log("");
      for (const columna of COLUMNAS) {
        const estas = tablero.filter((t) => t.columna === columna);
        console.log(`  ${NOMBRE_DE_COLUMNA[columna]} · ${estas.length}`);
        for (const t of estas) {
          const frenan = columna === "hecho" ? [] : laFrenan(t, tablero);
          console.log(`    ${corto(t)}  ${marca(t)}${t.titulo}${t.quien ? `  (${t.quien})` : ""}${frenan.length ? `  · espera a ${frenan.map(corto).join(", ")}` : ""}`);
        }
        console.log("");
      }
    }
  } else if (accion === "nueva") {
    const titulo = resto.join(" ");
    if (!titulo.trim()) ayuda();
    // Las parecidas se miran ANTES de crearla, y se avisan después: la tarjeta se crea igual
    // —dos tareas parecidas pueden ser dos tareas— pero vos te enterás en el momento.
    const parecidas = parecidasA(await leerTablero(repo).catch(() => []), titulo);
    const t = await crearTarjeta(repo, {
      titulo,
      detalle: values.detalle,
      terminado: values.terminado,
      quien: values.quien,
      tipo: values.bug ? "bug" : values.idea ? "idea" : "tarea",
    });
    console.log(`\n  ${corto(t)}  ${t.titulo}  → ${NOMBRE_DE_COLUMNA[t.columna]}\n`);
    if (parecidas.length > 0) {
      console.log(`  Ojo: ${comoSeDice(parecidas)}.`);
      console.log(`  Si era la misma: dolphin tarea comentar ${corto(parecidas[0]!.tarjeta)} "…" y borrá la nueva.\n`);
    }
  } else if (accion === "mover") {
    const [id = "", ...columna] = resto;
    const destino = columnaDe(columna.join(" "));
    if (!id || !destino) {
      console.error(`\n  ¿A qué columna? ${COLUMNAS.map((c) => NOMBRE_DE_COLUMNA[c]).join(" · ")}\n`);
      process.exit(1);
    }
    const t = await moverTarjeta(repo, (await buscarTarjeta(repo, id)).id, destino);
    console.log(`\n  ${corto(t)}  ${t.titulo}  → ${NOMBRE_DE_COLUMNA[t.columna]}\n`);
  } else if (accion === "ver") {
    const t = await buscarTarjeta(repo, resto[0] ?? "");
    if (values.json) console.log(JSON.stringify(t, null, 2));
    else {
      console.log(`\n  ${t.titulo}`);
      console.log(`  ${NOMBRE_DE_COLUMNA[t.columna]} · ${t.tipo}${t.quien ? ` · la toma ${t.quien}` : " · libre"} · ${t.id}`);
      if (t.detalle) console.log(`\n  ${t.detalle.replace(/\n/g, "\n  ")}`);
      if (t.terminado) console.log(`\n  Terminada cuando: ${t.terminado}`);
      if (t.rama) console.log(`\n  Rama: ${t.rama}`);
      const tablero = await leerTablero(repo);
      const frenan = laFrenan(t, tablero);
      if (frenan.length) console.log(`\n  Espera a:\n${frenan.map((o) => `    ${corto(o)}  ${o.titulo}  (${NOMBRE_DE_COLUMNA[o.columna]})`).join("\n")}`);
      const esperan = laEsperan(t, tablero);
      if (esperan.length) console.log(`\n  La esperan:\n${esperan.map((o) => `    ${corto(o)}  ${o.titulo}`).join("\n")}`);
      for (const c of t.comentarios) console.log(`\n  ${c.quien} · ${c.cuando.slice(0, 16).replace("T", " ")}\n  ${c.texto.replace(/\n/g, "\n  ")}`);
      console.log("");
    }
  } else if (accion === "comentar") {
    const [id = "", ...texto] = resto;
    const t = await comentarTarjeta(repo, (await buscarTarjeta(repo, id)).id, texto.join(" "));
    console.log(`\n  ${corto(t)}  ${t.comentarios.length} ${t.comentarios.length === 1 ? "comentario" : "comentarios"}\n`);
  } else if (accion === "esperar" || accion === "soltar") {
    const [id = "", otra = ""] = resto;
    if (!id || !otra) ayuda();
    const t = await (accion === "esperar" ? esperar(repo, id, otra) : soltar(repo, id, otra));
    const frenan = laFrenan(t, await leerTablero(repo));
    console.log(`\n  ${corto(t)}  ${t.titulo}  ${frenan.length ? `→ espera a ${frenan.map((o) => `«${o.titulo}»`).join(", ")}` : "→ no la frena nada"}\n`);
  } else if (accion === "listas") {
    const listas = listasParaHacer(await leerTablero(repo));
    if (values.json) console.log(JSON.stringify(listas, null, 2));
    else if (listas.length === 0) console.log("\n  No hay nada listo para hacer: Para hacer está vacía o todo espera a algo.\n");
    else console.log(`\n${listas.map((t) => `  ${corto(t)}  ${marca(t)}${t.titulo}`).join("\n")}\n`);
  } else if (accion === "desde") {
    // Un documento con una lista de cosas se vuelve tarjetas. No gasta un token.
    const archivo = positionals[1];
    if (!archivo) ayuda();
    const nuevas = await documentoATarjetas(repo, archivo);
    if (values.json) console.log(JSON.stringify(nuevas, null, 2));
    else if (nuevas.length === 0) console.log(`\n  No saqué nada nuevo de «${archivo}»: o no tiene listas, o ya está todo en el tablero.\n`);
    else console.log(`\n  ${nuevas.length} ${nuevas.length === 1 ? "tarjeta" : "tarjetas"} desde «${archivo}»:\n${nuevas.map((t) => `    ${corto(t)}  ${marca(t)}${t.titulo}`).join("\n")}\n`);
  } else if (accion === "issues") {
    // Los issues abiertos de GitHub, como ideas. No gasta nada: los lee con gh.
    const r = await issuesAlTablero(repo, { ...(values.etiqueta ? { etiqueta: values.etiqueta } : {}) });
    if (values.json) console.log(JSON.stringify(r, null, 2));
    else if (!r.ok) {
      console.error(`\n  No pude traer los issues: ${r.porQue}.\n`);
      process.exit(1);
    } else if (r.nuevas.length === 0) {
      console.log(`\n  No hay issues nuevos${r.yaEstaban > 0 ? `: los ${r.yaEstaban} que hay ya están en el tablero` : ""}.\n`);
    } else {
      console.log(`\n  ${r.nuevas.length} ${r.nuevas.length === 1 ? "idea" : "ideas"} desde GitHub:\n${r.nuevas.map((t) => `    ${corto(t)}  ${marca(t)}${t.titulo}`).join("\n")}\n`);
    }
  } else if (accion === "todos") {
    // Los TODO que ya están en el código, como ideas.
    const nuevas = await todosAlTablero(repo);
    if (values.json) console.log(JSON.stringify(nuevas, null, 2));
    else if (nuevas.length === 0) console.log("\n  No hay TODO nuevos en el código: los que había ya están en el tablero.\n");
    else console.log(`\n  ${nuevas.length} ${nuevas.length === 1 ? "idea" : "ideas"} desde el código:\n${nuevas.map((t) => `    ${corto(t)}  ${t.titulo}`).join("\n")}\n`);
  } else if (accion === "compartir") {
    const r = await compartirTablero(repo, values.rama);
    if (values.json) console.log(JSON.stringify(r, null, 2));
    else if (r.sinCambios) console.log(`\n  Ya estaba compartido igual en «${r.rama}»: no hice un commit nuevo.\n`);
    else console.log(`\n  ${r.tarjetas} ${r.tarjetas === 1 ? "tarjeta" : "tarjetas"} en «${r.rama}». Para que la vea otra máquina: git push origin ${r.rama}\n`);
  } else if (accion === "traer") {
    const r = await traerTablero(repo, values.rama);
    if (values.json) console.log(JSON.stringify(r, null, 2));
    else {
      const partes = [
        r.nuevas.length ? `${r.nuevas.length} ${r.nuevas.length === 1 ? "nueva" : "nuevas"}` : "",
        r.actualizadas.length ? `${r.actualizadas.length} ${r.actualizadas.length === 1 ? "actualizada" : "actualizadas"}` : "",
        r.mias.length ? `${r.mias.length} ${r.mias.length === 1 ? "tuya, más nueva" : "tuyas, más nuevas"}` : "",
      ].filter(Boolean);
      console.log(`\n  ${partes.length ? partes.join(" · ") : "No había nada que traer"}.\n`);
    }
  } else ayuda();
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
