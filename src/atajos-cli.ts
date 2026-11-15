// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { aprobarAtajo, borrarAtajo, contestarAtajo, guardarAtajo, leerAtajo, listarAtajos, type Consola } from "./atajos.js";
import { C, haceCuanto, pintar, tabla, titulo } from "./salida.js";

/**
 * dolphin atajo                                  la lista
 * dolphin atajo nuevo <nombre> --archivo X.ps1 [--descripcion "…"] [--consola powershell|sh]
 * dolphin atajo nuevo <nombre> --script "…"
 * dolphin atajo ver <nombre>                     el script entero, para revisarlo
 * dolphin atajo aprobar <nombre>                 un atajo que propuso un bot, revisado
 * dolphin atajo <nombre>                         lo corre (igual que «/nombre» por Telegram)
 * dolphin atajo borrar <nombre>
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    archivo: { type: "string" },
    script: { type: "string" },
    descripcion: { type: "string" },
    consola: { type: "string" },
  },
});

const [comando, nombre] = positionals;
const falta = (que: string): never => {
  console.error(`\n  Falta ${que}.\n`);
  process.exit(1);
};

try {
  if (!comando || comando === "lista") {
    const atajos = await listarAtajos();
    console.log(titulo("Atajos", "corren un script fijo, sin modelo · «/nombre» por Telegram"));
    if (atajos.length === 0) console.log(`  ${pintar("Todavía no hay atajos. Creá uno con «dolphin atajo nuevo juego --archivo juego.ps1».", C.suave)}\n`);
    else
      console.log(
        tabla(atajos, [
          { titulo: "", valor: (a) => (a.revisado ? pintar("●", C.texto) : pintar("?", C.amarillo)) },
          { titulo: "atajo", valor: (a) => pintar(`/${a.nombre}`, C.violeta, { negrita: true }) },
          { titulo: "qué hace", valor: (a) => (a.descripcion || pintar("(sin descripción)", C.tenue)) + (a.revisado ? "" : pintar("  sin revisar: «dolphin atajo aprobar»", C.amarillo)), elastica: true },
          { titulo: "última vez", valor: (a) => (a.ultima ? pintar(`${haceCuanto(a.ultima.cuando)}${a.ultima.codigo === 0 ? "" : ` · código ${a.ultima.codigo}`}`, a.ultima.codigo === 0 ? C.tenue : C.rojo) : pintar("nunca", C.tenue)), derecha: true },
        ]) + "\n",
      );
  } else if (comando === "nuevo") {
    const script = values.archivo ? await readFile(values.archivo, "utf8") : (values.script ?? falta("el script: --archivo o --script"));
    const consola = values.consola === "sh" || values.consola === "powershell" ? (values.consola as Consola) : undefined;
    // Lo escribiste vos desde la terminal: queda revisado.
    const atajo = await guardarAtajo({ nombre: nombre ?? falta("el nombre"), script, revisado: true, ...(values.descripcion ? { descripcion: values.descripcion } : {}), ...(consola ? { consola } : {}) });
    console.log(`\n  Listo: /${atajo.nombre} corre este script (${atajo.consola}):\n\n${atajo.script}\n`);
  } else if (comando === "ver") {
    const atajo = await leerAtajo(nombre ?? falta("el nombre"));
    if (!atajo) falta(`un atajo «${nombre}»`);
    console.log(`\n  /${atajo!.nombre} · ${atajo!.consola}${atajo!.revisado ? "" : " · sin revisar"}\n\n${atajo!.script}\n`);
  } else if (comando === "aprobar") {
    const atajo = await aprobarAtajo(nombre ?? falta("el nombre"));
    console.log(`\n  /${atajo.nombre} ya puede correr.\n`);
  } else if (comando === "borrar") {
    await borrarAtajo(nombre ?? falta("el nombre"));
    console.log(`\n  /${nombre} borrado.\n`);
  } else {
    // Cualquier otra palabra es el nombre de un atajo para correr.
    console.log(`\n${await contestarAtajo(comando)}\n`);
  }
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
