import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { autorizarFases, revisarConGuardian, type Informe } from "./nucleo/guardian.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";

/**
 * dolphin guardian --repo <ruta> [--cada 60] [--una-vez]
 *
 * Mira la rama del repo a cero tokens: cada commit nuevo pasa por las fases
 * autorizadas en un worktree propio, y lo que se rompe respecto de la última
 * base verde deja una tarjeta en la bandeja con el commit culpable. No toca
 * el repo y no arregla nada solo: la tarjeta propone, la persona decide.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    cada: { type: "string", default: "60" },
    "una-vez": { type: "boolean", default: false },
    // Las fases que corre en un repo clonado, autorizadas desde acá (no desde el config que vino con el código).
    autorizar: { type: "string" },
    ayuda: { type: "boolean", default: false },
  },
});

if (values.ayuda) {
  console.log(`
  dolphin guardian · la rama principal, vigilada a cero tokens

  npm run guardian -- --repo "D:/mi-app"

  --repo       la carpeta del repo (por defecto, esta)
  --cada       cada cuántos segundos mira si hay un commit nuevo (por defecto, 60)
  --una-vez    revisa el commit actual y termina (sale con 1 si hay una regresión
               nueva y con 2 si no pudo revisar)
  --autorizar  en un repo clonado, qué fases puede correr: --autorizar test,lint
               (vacío, --autorizar "", las desautoriza)

  Vigila la rama principal (o la de guardian.rama) y corre las fases de
  dolphin.config.json → guardian.fases o, si no hay, los scripts sintaxis,
  typecheck, lint y test que tenga el repo. En un repo clonado, solo lo que
  autorices con --autorizar.
`);
  process.exit(0);
}

// Absoluta desde acá: con «../mi-app», el enlace a node_modules de cada worktree apuntaba a la nada.
const repo = resolve(values.repo ?? process.cwd());
const cada = Math.max(10, Number(values.cada) || 60) * 1000;
const hora = () => new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const segundos = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);

function contar(informe: Informe): void {
  if (!informe.reviso) {
    if (informe.porQue) console.log(`  ${hora()} · no revisé: ${informe.porQue}`);
    return;
  }
  const r = informe.revision!;
  console.log(`  ${hora()} · ${r.sha.slice(0, 7)}`);
  for (const fase of r.fases) {
    console.log(`    ${fase.paso ? "✓" : "✗"} ${fase.nombre.padEnd(10)} ${segundos(fase.ms).padStart(7)}${fase.inestable ? "  inestable: falló y al repetirla pasó" : ""}`);
  }
  for (const g of informe.nuevas) {
    const quien = g.culpable ? `${g.culpable.sha.slice(0, 7)} (${g.culpable.autor}: «${g.culpable.mensaje}»)` : `entre ${g.desde.slice(0, 7)} y ${g.vista.slice(0, 7)}`;
    console.log(`    → «${g.fase}» se rompió en ${quien}: tarjeta en la bandeja`);
  }
  for (const fase of informe.arregladas) console.log(`    → «${fase}» vuelve a pasar: su tarjeta se cerró`);
  if (informe.sinBase.length > 0) {
    console.log(`    → el repo ya está en rojo en ${informe.sinBase.join(", ")}: la base va a ser el primer commit en verde`);
  }
  if (r.fases.every((f) => f.paso)) console.log("    → todo en verde: es la base nueva");
}

if (values.autorizar !== undefined) {
  const fases = values.autorizar.split(",").map((s) => s.trim()).filter(Boolean);
  await autorizarFases(repo, fases);
  console.log(fases.length > 0 ? `\n  Guardian puede correr ${fases.join(", ")} en ${repo}.\n` : `\n  Guardian ya no corre nada en ${repo}.\n`);
  process.exit(0);
}

console.log(`\n  dolphin · guardian · ${repo}\n  ${values["una-vez"] ? "una revisión" : `mira si hay commits nuevos cada ${cada / 1000} s`}\n`);

// Ctrl+C o cerrar la terminal a mitad de una fase: suelta el enlace a node_modules del
// worktree y mata la fase antes de irse. Antes esperaba al final de la pasada y al
// sueño de 60 s; cerrar la terminal no corría el `finally` y el enlace quedaba puesto.
soltarEnlacesAlCortar();

for (;;) {
  const informe = await revisarConGuardian(repo).catch((error: unknown) => {
    console.error(`  ${hora()} · no pude revisar: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  if (informe) contar(informe);
  if (values["una-vez"]) {
    // Para un hook o un CI: 1 con una regresión nueva, 2 si no pudo revisar —un 0 ahí sería un verde sin haber corrido nada—.
    const noReviso = !informe || (!informe.reviso && informe.porQue !== undefined);
    process.exitCode = noReviso ? 2 : informe.nuevas.length > 0 ? 1 : 0;
    break;
  }
  await new Promise((listo) => setTimeout(listo, cada));
}
