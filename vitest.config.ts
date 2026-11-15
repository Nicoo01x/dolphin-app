import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Medio suite corre git de verdad: abre worktrees, commitea, mergea. En
 * Windows, con el antivirus mirando cada archivo nuevo y la máquina
 * ocupada, eso pasa los 5 s por defecto sin que nada esté roto —seis
 * tests «fallaron» así el 22/10, y la corrida siguiente salió limpia—.
 *
 * El 31/10 volvió a pasar con 30 s, y con la máquina de verdad al lado: la app de escritorio
 * abierta, la consola corriendo y un navegador. Cada escritura de estado reintenta hasta 10 s
 * cuando Windows tiene el archivo tomado (ver nucleo/escritura.ts), así que un test que escribe
 * tres o cuatro se pasa sin que nada esté roto. Y un test que parpadea es peor que un test lento:
 * deja de creerse el portón. Un test colgado de verdad se sigue viendo, ahora a los dos minutos.
 */
export default defineConfig({
  // Los tests de la consola (ui/src/**/*.test.tsx) importan con el alias de la consola.
  resolve: { alias: { "@": fileURLToPath(new URL("./ui/src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ["tests/preparar.ts"],
    // El escritorio (escritorio/) tiene su propia suite con su propia config: no se corre desde acá.
    exclude: [...configDefaults.exclude, "escritorio/**"],
  },
});
