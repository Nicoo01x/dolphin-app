import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/**
 * Cada archivo de tests con su propio hogar de Dolphin: la llave de firma,
 * la lista de proyectos y todo lo que vive en `~/.dolphin` no se tocan en la
 * máquina de quien corre los tests. Los procesos que lancen lo heredan.
 */
const hogar = mkdtempSync(join(tmpdir(), "dolphin-hogar-test-"));
process.env.DOLPHIN_HOME = hogar;
afterAll(() => rmSync(hogar, { recursive: true, force: true }));

/**
 * Git sin `user.name` ni `user.email` no commitea, y medio suite commitea: los puntos de
 * `volver`, la entrega de una rama, el primer commit de un proyecto nuevo. El runner de
 * GitHub (ubuntu-latest) no trae identidad, así que ahí esos tests fallaban y en la máquina de
 * cualquiera pasaban. Si falta, se le da una como config de SISTEMA, la de menor precedencia:
 * la global de quien corre los tests o la que un test le pone a su repo siguen ganando.
 */
if (!hayIdentidadDeGit()) {
  const sistema = join(hogar, "gitconfig-de-los-tests");
  // La de sistema que había (autocrlf, el backend de https…) se incluye: solo se le suma la identidad.
  const original = configDeSistema();
  const incluir = original ? `[include]\n\tpath = ${original.replaceAll("\\", "/")}\n` : "";
  writeFileSync(sistema, `${incluir}[user]\n\tname = Dolphin tests\n\temail = tests@dolphin.invalid\n`);
  process.env.GIT_CONFIG_SYSTEM = sistema;
}

function configDeSistema(): string | undefined {
  try {
    const salida = execFileSync("git", ["config", "--system", "--list", "--show-origin"], { cwd: tmpdir(), stdio: "pipe", encoding: "utf8" });
    return /^file:(.+?)\t/m.exec(salida)?.[1];
  } catch {
    return undefined; // sin archivo de sistema no hay nada que conservar
  }
}

function hayIdentidadDeGit(): boolean {
  try {
    // Desde una carpeta fuera de cualquier repo: lo que cuenta es la config global y la de sistema.
    for (const clave of ["user.name", "user.email"]) {
      execFileSync("git", ["config", clave], { cwd: tmpdir(), stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}
