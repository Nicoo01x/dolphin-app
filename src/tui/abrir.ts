import { spawn } from "node:child_process";

/** Abre un link en el navegador de la persona, sin esperar ni dejar la terminal colgada. */
export function abrirEnElNavegador(url: string): void {
  // Solo links de la web: nada que el sistema interprete como un programa o un archivo.
  if (!/^https?:\/\//i.test(url)) return;
  const [cmd, args] =
    process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd as string, args as string[], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
