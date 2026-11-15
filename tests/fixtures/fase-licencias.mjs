import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Una fase de terceros de ejemplo, igual a la que escribiría cualquiera:
 * ninguna dependencia nueva sin licencia permitida.
 *
 * Es la forma entera del contrato — una fábrica que recibe sus opciones del
 * dolphin.config.json y devuelve un `Verificador`—, y por eso también sirve de
 * documentación ejecutable: si esto deja de andar, docs/fases.md miente.
 */
export default function faseDeLicencias(opciones) {
  const permitidas = new Set(opciones?.permitidas ?? ["MIT"]);
  return {
    nombre: "licencias",
    costo: "gratis",
    async correr(universo) {
      const crudo = await readFile(join(universo.ruta, "package.json"), "utf8").catch(() => undefined);
      if (crudo === undefined) return { paso: true, salteada: true, detalle: "licencias: este repo no tiene package.json" };

      const malas = Object.entries(JSON.parse(crudo).dependencias ?? {}).filter(([, licencia]) => !permitidas.has(licencia));
      if (malas.length === 0) return { paso: true, detalle: "licencias: todas permitidas" };
      return {
        paso: false,
        detalle: `licencias: ${malas[0][0]} es ${malas[0][1]}`,
        evidencia: malas.map(([nombre, licencia]) => `${nombre}  ${licencia}`).join("\n"),
      };
    },
  };
}
