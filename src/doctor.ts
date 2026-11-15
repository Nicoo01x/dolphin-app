import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readlink, stat, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { matarArbol, procesoVivo } from "./agentes/ejecutar.js";
import { liberarCortados } from "./nucleo/bandeja.js";
import { destrabarTarjetas } from "./nucleo/tarjetas-trabadas.js";
import { git } from "./nucleo/git.js";
import { barrerHuerfanos } from "./nucleo/taller.js";
import { cajaDisponible, type Caja } from "./nucleo/aislado.js";
import { leerConfig } from "./nucleo/config.js";
import { enlacesEnElDisco } from "./nucleo/entorno.js";
import { TOPE_DEL_TURNO } from "./nucleo/ssh.js";
import { desprendidosVencidos, leerDesprendidos } from "./nucleo/turnos-desprendidos.js";

/**
 * dolphin doctor: lo que queda roto cuando algo se corta a mitad de camino, encontrado y arreglado solo.
 *
 *   worktrees huérfanos      → los de un Dolphin que ya no corre: se sueltan y se borran (con su rama)
 *   worktrees perdidos       → git los recuerda pero la carpeta no existe: `git worktree prune`
 *   ramas ya integradas      → las de Dolphin que ya están en tu rama: se borran (nada se pierde)
 *   enlaces rotos            → un node_modules enlazado (el de la raíz o el de un paquete anidado) que apunta a nada: se saca el enlace
 *   asuntos colgados         → la bandeja dice «implementando» y el proceso murió: vuelven a abiertos
 *   agentes huérfanos        → un claude/codex que sigue corriendo sobre un worktree que ya no existe: se corta
 *   turnos desprendidos      → uno lanzado en un VPS que nadie vio terminar pasado el tope: se dice cómo mirarlo
 *   lo que no se arregla solo → sin sesión de Claude o de Codex, o sin cupo en ninguna ventana: se dice qué hacer
 *
 * Nada de esto toca lo tuyo: solo lo que Dolphin creó y quedó abandonado. Cada revisión se protege
 * sola: si una falla, las demás corren igual.
 */

export interface Hallazgo {
  readonly que: string;
  readonly arreglado: boolean;
  readonly detalle: string;
}

export interface ProcesoVisto {
  readonly pid: number;
  readonly comando: string;
}

export interface DepsDelDoctor {
  /** Los procesos de la máquina (pid y línea de comando). */
  readonly procesos?: () => Promise<ProcesoVisto[]>;
  readonly matar?: (pid: number) => Promise<void>;
  readonly vivo?: (pid: number) => boolean;
  readonly casa?: string;
  readonly temporal?: string;
  readonly ahora?: () => Date;
  /** Con qué se aísla en esta máquina (ver nucleo/aislado.ts). */
  readonly caja?: () => Promise<Caja | null>;
}

const correr = (cmd: string, args: readonly string[]) =>
  new Promise<string>((listo) => execFile(cmd, [...args], { windowsHide: true, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }, (_e, stdout) => listo(stdout ?? "")));

/** Los procesos de la máquina: en Windows con CIM, en el resto con ps. */
async function procesosDelSistema(): Promise<ProcesoVisto[]> {
  if (process.platform === "win32") {
    const salida = await correr("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"]);
    try {
      const lista = JSON.parse(salida) as { ProcessId: number; CommandLine: string | null }[];
      return (Array.isArray(lista) ? lista : [lista]).filter((p) => p.CommandLine).map((p) => ({ pid: p.ProcessId, comando: p.CommandLine! }));
    } catch {
      return [];
    }
  }
  return (await correr("ps", ["-eo", "pid=,args="]))
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), comando: m[2]! }));
}

/** Las carpetas de worktrees de Dolphin que nombra una línea de comando: `<temporal>/dolphin-XXXX/u3`. */
export function worktreesNombrados(comando: string, temporal: string): string[] {
  const base = temporal.replace(/[\\/]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\\/g, "[\\\\/]");
  const patron = new RegExp(`${base}[\\\\/]dolphin-[\\w]+[\\\\/][\\w-]+`, "gi");
  return [...new Set(comando.match(patron) ?? [])];
}

/**
 * A dónde apunta un enlace, sin la barra del final. En Windows, según la versión de Node, el
 * `readlink` de una junction devuelve el destino con una `\` al final (visto: 22.12 sí, 24.19 no):
 * el mismo enlace roto se contaba distinto según con qué se corriera. La raíz (`C:\`, `/`) queda.
 */
export function sinSeparadorFinal(destino: string): string {
  return destino.replace(/([^\\/:])[\\/]+$/, "$1");
}

const MOTORES = /\b(claude|codex|agy|gemini)(\.exe|\.cmd)?\b/i;

async function revisar(nombre: string, hacer: () => Promise<Hallazgo[]>): Promise<Hallazgo[]> {
  try {
    return await hacer();
  } catch (error) {
    return [{ que: nombre, arreglado: false, detalle: `no se pudo revisar: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` }];
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function doctor(repo: string, opciones: { arreglar?: boolean } = {}, deps: DepsDelDoctor = {}): Promise<Hallazgo[]> {
  const arreglar = opciones.arreglar !== false;
  const casa = deps.casa ?? homedir();
  const temporal = deps.temporal ?? tmpdir();
  const ahora = deps.ahora ?? (() => new Date());
  const hallazgos: Hallazgo[] = [];

  // Los que git recuerda y ya no están: solo metadata, nada de código. Va primero: barrer huérfanos
  // también poda, y lo podado ahí no se contaba.
  hallazgos.push(
    ...(await revisar("worktrees perdidos", async () => {
      // `prune --dry-run` lo dice por stderr; la lista los marca «prunable», que es lo mismo y se lee.
      const perdidos = (await git(["worktree", "list", "--porcelain"], repo).catch(() => "")).split(/\r?\n\r?\n/).filter((b) => /^prunable/m.test(b));
      if (perdidos.length === 0) return [];
      if (arreglar) await git(["worktree", "prune"], repo);
      return [{ que: "worktrees perdidos", arreglado: arreglar, detalle: `${plural(perdidos.length, "worktree que git recordaba", "worktrees que git recordaba")} y ya no existía${perdidos.length === 1 ? "" : "n"}` }];
    })),
  );

  // Los que dejó un Dolphin que ya no corre (ver taller.ts).
  if (arreglar) {
    hallazgos.push(
      ...(await revisar("worktrees huérfanos", async () => {
        const n = await barrerHuerfanos(repo);
        return n > 0 ? [{ que: "worktrees huérfanos", arreglado: true, detalle: `borré ${plural(n, "worktree que dejó", "worktrees que dejó")} un Dolphin que ya no corre` }] : [];
      })),
    );
  }

  const bloques = (await git(["worktree", "list", "--porcelain"], repo).catch(() => "")).split(/\r?\n\r?\n/);
  const enUso = new Set(bloques.map((b) => /^branch refs\/heads\/(.+)$/m.exec(b)?.[1]?.trim()).filter((r): r is string => !!r));

  // Ramas de Dolphin que ya están en tu rama: borrarlas no pierde nada (git branch -d se niega si no).
  hallazgos.push(
    ...(await revisar("ramas integradas", async () => {
      const integradas = (await git(["branch", "--merged", "HEAD", "--format=%(refname:short)", "--list", "dolphin/*", "dolphin-equipo/*", "dolphin-bug/*", "dolphin-ramas/*"], repo).catch(() => ""))
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r !== "" && !enUso.has(r));
      if (integradas.length === 0) return [];
      let borradas = 0;
      if (arreglar) for (const r of integradas) if (await git(["branch", "-d", r], repo).then(() => true, () => false)) borradas += 1;
      return [{ que: "ramas integradas", arreglado: arreglar && borradas > 0, detalle: arreglar ? `borré ${plural(borradas, "rama de Dolphin que ya estaba", "ramas de Dolphin que ya estaban")} en tu rama` : `${plural(integradas.length, "rama de Dolphin ya está", "ramas de Dolphin ya están")} en tu rama y se puede${integradas.length === 1 ? "" : "n"} borrar` }];
    })),
  );

  // Un node_modules enlazado que apunta a una carpeta que ya no existe. Se miran el de la raíz de
  // cada worktree Y los de los paquetes anidados (`escritorio/node_modules`): uno roto ahí no se
  // veía y el universo fallaba recién al correr un test. El recorrido es el de `soltarEnlaces`
  // (entorno.ts), el mismo que los descubre para soltarlos: dos recorridos distintos terminarían
  // en desacuerdo sobre qué enlaces existen.
  hallazgos.push(
    ...(await revisar("enlaces rotos", async () => {
      const rotos: string[] = [];
      for (const b of bloques) {
        const ruta = /^worktree (.+)$/m.exec(b)?.[1]?.trim();
        if (!ruta) continue;
        for (const enlace of await enlacesEnElDisco(ruta)) {
          const destino = sinSeparadorFinal(await readlink(enlace).catch(() => ""));
          if (destino && (await stat(enlace).then(() => true, () => false))) continue;
          // Qué enlace es y a dónde apuntaba, para poder rearmarlo si hace falta (a mano o con la siembra).
          rotos.push(`${relative(ruta, enlace).split(sep).join("/")} en ${ruta} apuntaba a ${destino || "(destino ilegible)"}`);
          if (arreglar) await unlink(enlace).catch(() => {});
        }
      }
      if (rotos.length === 0) return [];
      return [{ que: "enlaces rotos", arreglado: arreglar, detalle: `${plural(rotos.length, "node_modules enlazado apuntaba", "node_modules enlazados apuntaban")} a nada (${rotos.join("; ")})${arreglar ? ": saqué el enlace" : ""}` }];
    })),
  );

  // La bandeja dice «implementando» y el que lo implementaba murió.
  if (arreglar) {
    hallazgos.push(
      ...(await revisar("asuntos colgados", async () => {
        const liberados = await liberarCortados(repo, deps.vivo ?? procesoVivo, ahora());
        return liberados.length > 0 ? [{ que: "asuntos colgados", arreglado: true, detalle: `${plural(liberados.length, "asunto de la bandeja quedó", "asuntos de la bandeja quedaron")} «implementando» sin nadie: vuelve${liberados.length === 1 ? "" : "n"} a abierto${liberados.length === 1 ? "" : "s"}` }] : [];
      })),
    );
  }

  // Una tarjeta quedó en Haciendo y el proceso que la hacía murió: nadie la iba a sacar de ahí.
  if (arreglar) {
    hallazgos.push(
      ...(await revisar("tarjetas trabadas", async () => {
        const destrabadas = await destrabarTarjetas(repo, deps.vivo ?? procesoVivo, ahora());
        return destrabadas.length > 0
          ? [{ que: "tarjetas trabadas", arreglado: true, detalle: `${plural(destrabadas.length, "tarjeta quedó", "tarjetas quedaron")} en Haciendo sin nadie: vuelve${destrabadas.length === 1 ? "" : "n"} a Para hacer` }]
          : [];
      })),
    );
  }

  // Un agente que sigue corriendo sobre un worktree que ya no existe: gasta cupo para nadie.
  hallazgos.push(
    ...(await revisar("agentes huérfanos", async () => {
      const lista = await (deps.procesos ?? procesosDelSistema)();
      const huerfanos = lista.filter((p) => p.pid !== process.pid && MOTORES.test(p.comando) && worktreesNombrados(p.comando, temporal).some((r) => !existsSync(r)));
      if (huerfanos.length === 0) return [];
      if (arreglar) for (const p of huerfanos) await (deps.matar ?? matarArbol)(p.pid).catch(() => {});
      return [{ que: "agentes huérfanos", arreglado: arreglar, detalle: `${plural(huerfanos.length, "agente seguía", "agentes seguían")} corriendo sobre un worktree que ya no existe${arreglar ? ": lo" + (huerfanos.length === 1 ? "" : "s") + " corté" : ""}` }];
    })),
  );

  // El modo aislado pedido sin caja: no se corre ningún agente hasta que haya con qué aislar.
  hallazgos.push(
    ...(await revisar("modo aislado", async () => {
      if (!(await leerConfig(repo)).aislado) return [];
      if (await (deps.caja ?? (() => cajaDisponible()))()) return [];
      return [{ que: "modo aislado", arreglado: false, detalle: "pediste el modo aislado y no hay con qué aislar (Docker, Podman o bubblewrap): ningún agente va a correr hasta que instales uno (ver docs/aislamiento.md)" }];
    })),
  );

  // Un turno lanzado desprendido en un VPS que nadie vio terminar: Dolphin se cerró mientras corría,
  // o quedó colgado allá. No se toca (puede seguir trabajando): se dice cómo mirarlo.
  hallazgos.push(
    ...(await revisar("turnos desprendidos", async () => {
      const vencidos = desprendidosVencidos(await leerDesprendidos(repo), TOPE_DEL_TURNO, ahora());
      return vencidos.map((t) => ({
        que: "turnos desprendidos",
        arreglado: false,
        detalle: `el turno ${t.id} arrancó en ${t.maquina.destino} hace ${Math.round((ahora().getTime() - new Date(t.lanzado).getTime()) / 3_600_000)} h y nadie lo vio terminar: miralo con «dolphin turno adjuntar ${t.id}»`,
      }));
    })),
  );

  // Lo que no se arregla solo: se dice qué hacer.
  hallazgos.push(
    ...(await revisar("sesiones", async () => {
      const faltan: Hallazgo[] = [];
      const claude = existsSync(join(casa, ".claude", ".credentials.json")) || existsSync(join(casa, ".claude.json")) || !!process.env.ANTHROPIC_API_KEY;
      if (!claude) faltan.push({ que: "sesión de Claude", arreglado: false, detalle: "no encontré una sesión de Claude: corré `claude` una vez y entrá con tu cuenta" });
      return faltan;
    })),
  );
  hallazgos.push(
    ...(await revisar("cupo", async () => {
      const plan = JSON.parse(await readFile(join(casa, ".dolphin", "plan-uso.json"), "utf8").catch(() => "null")) as {
        escritoEn?: string;
        agentes?: { agente: string; ventanas: { nombre: string; usadoPct: number; reiniciaEn: string | null }[] }[];
      } | null;
      if (!plan?.agentes || !plan.escritoEn || ahora().getTime() - new Date(plan.escritoEn).getTime() > 15 * 60_000) return [];
      return plan.agentes.flatMap((a) =>
        a.ventanas
          .filter((v) => v.usadoPct >= 95)
          .map((v) => ({
            que: "cupo",
            arreglado: false,
            detalle: `${a.agente} está al ${Math.round(v.usadoPct)} % de ${v.nombre === "5h" ? "la ventana de 5 h" : "la semana"}${v.reiniciaEn ? `, vuelve ${new Date(v.reiniciaEn).toLocaleString("es-AR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}` : ""}: si tenés otra cuenta, Dolphin pasa a esa sola`,
          })),
      );
    })),
  );
  return hallazgos;
}

/** El resultado en pocas líneas: lo arreglado primero, después lo que hay que hacer a mano. */
export function textoDelDoctor(hallazgos: readonly Hallazgo[]): string {
  if (hallazgos.length === 0) return "Todo en orden: no encontré nada roto.";
  const arreglados = hallazgos.filter((h) => h.arreglado);
  const aMano = hallazgos.filter((h) => !h.arreglado);
  return [
    ...(arreglados.length ? ["Arreglé:", ...arreglados.map((h) => `- ${h.detalle}`)] : []),
    ...(aMano.length ? [...(arreglados.length ? [""] : []), "Para que mires:", ...aMano.map((h) => `- ${h.detalle}`)] : []),
  ].join("\n");
}
