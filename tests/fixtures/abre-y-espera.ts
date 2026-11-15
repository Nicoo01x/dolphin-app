import { soltarEnlacesAlCortar } from "../../src/nucleo/entorno.js";
import { TallerDeGit } from "../../src/nucleo/taller.js";

/**
 * Para el test de «cancelar»: abre un universo (con el enlace a node_modules
 * puesto), avisa dónde quedó y se queda esperando, como una siembra a mitad
 * de camino. Lo que se prueba es qué deja cuando la consola le pide que corte.
 */
const [repo, carpeta] = process.argv.slice(2);
soltarEnlacesAlCortar();
const universo = await new TallerDeGit(repo!, carpeta!).abrir("u1", "dolphin/cancelar");
process.send?.({ abierto: universo.ruta });
setInterval(() => {}, 60_000);
