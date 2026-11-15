import { commitsDeLaRama, detalleDeCommit, diffDeCommit, grafoDelRepo, issuesDelRepo, prsPorRama, ramasDelRepo, type CambioDeArchivo, type Commit, type Issue, type Rama, type RenglonDeGrafo } from "../nucleo/vista-git.js";

/**
 * Lo que la sección Git de la terminal sabe del repo: ramas, el grafo de commits y los issues, y el
 * detalle de lo elegido. Se lee de git y de `gh` al entrar (y con «r»), no en cada cuadro; el
 * detalle se pide al elegir y queda guardado. Todo es de lectura: nada de acá cambia el repo.
 *
 * Con enter se entra, como en lazygit: de una rama a sus commits, de un commit a sus archivos y de
 * un archivo a su diff; esc vuelve un paso, a la fila de donde se entró.
 */

export type PestanaGit = "ramas" | "commits" | "issues";
export const PESTANAS_GIT: readonly PestanaGit[] = ["ramas", "commits", "issues"];

export type DetalleGit =
  /** `propios`: cuántos de arriba son de la rama y no de la base (sin él, la rama es la base). */
  | { readonly que: "commits"; readonly commits: readonly Commit[]; readonly propios?: number }
  | { readonly que: "archivos"; readonly mensaje: string; readonly archivos: readonly CambioDeArchivo[] }
  | { readonly que: "diff"; readonly filas: readonly FilaDiff[]; readonly recortado: boolean };

export type FilaDiff = { readonly clase: "trozo"; readonly texto: string } | { readonly clase: "mas" | "menos" | "ctx"; readonly numero: number; readonly texto: string };

/** Como en la consola (ui/src/lib/datos.ts): la cabecera que es para git afuera, cada renglón con su número. */
export function filasDelDiff(texto: string): FilaDiff[] {
  const filas: FilaDiff[] = [];
  let viejo = 0;
  let nuevo = 0;
  let enCabecera = false;
  for (const linea of texto.split("\n")) {
    if (linea.startsWith("diff --git ")) {
      enCabecera = true;
      continue;
    }
    const trozo = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(linea);
    if (trozo) {
      enCabecera = false;
      viejo = Number(trozo[1]);
      nuevo = Number(trozo[2]);
      filas.push({ clase: "trozo", texto: trozo[3] ?? "" });
    } else if (enCabecera || linea.startsWith("\\")) continue;
    else if (linea.startsWith("+")) filas.push({ clase: "mas", numero: nuevo++, texto: linea.slice(1) });
    else if (linea.startsWith("-")) filas.push({ clase: "menos", numero: viejo++, texto: linea.slice(1) });
    else if (linea.startsWith(" ")) {
      filas.push({ clase: "ctx", numero: nuevo++, texto: linea.slice(1) });
      viejo++;
    }
  }
  return filas;
}

type Leido = DetalleGit | "cargando" | { readonly error: string };

/** Un paso hacia adentro; `volverA` es la fila elegida antes de entrar. */
export type PasoGit =
  | { readonly que: "rama"; readonly rama: string; readonly volverA: number }
  | { readonly que: "commit"; readonly hash: string; readonly hashCorto: string; readonly mensaje: string; readonly volverA: number }
  | { readonly que: "archivo"; readonly hash: string; readonly archivo: string; readonly volverA: number };

/** En el detalle de una rama entran más commits que en la vista previa: ahí se recorren. */
const COMMITS_DE_UNA_RAMA = 100;

export class EstadoGit {
  pestana: PestanaGit = "ramas";
  ramas: readonly Rama[] | null = null;
  grafo: readonly RenglonDeGrafo[] | null = null;
  issues: readonly Issue[] | null = null;
  /** Por qué no hay issues (sin gh, sin sesión, sin remoto): se dice en vez de una lista vacía. */
  sinIssues: string | null = null;
  error: string | null = null;
  cargandoDesde = 0;
  /** Por dónde se entró: vacío es la lista de la pestaña. */
  adentro: PasoGit[] = [];
  /** Cuántos renglones del diff entran en pantalla (lo anota el dibujo): se baja hasta que el último queda abajo. */
  altoDelDiff = 20;
  private repo = "";
  private readonly leidos = new Map<string, Leido>();

  constructor(private readonly alCambiar: () => void = () => {}) {}

  /** Lee todo de nuevo si es otro repo, si se pide o si pasó más de un minuto. */
  cargar(repo: string, ahora: number, forzar = false): void {
    if (!forzar && repo === this.repo && this.cargandoDesde && ahora - this.cargandoDesde < 60_000) return;
    if (repo !== this.repo) this.adentro = [];
    this.repo = repo;
    this.cargandoDesde = ahora;
    this.error = null;
    this.leidos.clear();
    const fallo = (e: unknown) => {
      this.error = e instanceof Error ? e.message : String(e);
      this.alCambiar();
    };
    void prsPorRama(repo)
      .then((prs) => ramasDelRepo(repo, 60, prs))
      .then((r) => ((this.ramas = r), this.alCambiar()), fallo);
    void grafoDelRepo(repo).then((g) => ((this.grafo = g), this.alCambiar()), fallo);
    void issuesDelRepo(repo).then((r) => {
      this.issues = r.disponible ? r.issues : [];
      this.sinIssues = r.disponible ? null : r.porQue;
      this.alCambiar();
    }, fallo);
  }

  /** Dónde se está parado: el último paso hacia adentro, o ninguno. */
  get paso(): PasoGit | undefined {
    return this.adentro.at(-1);
  }

  /** Cuántas filas tiene lo que se ve; adentro de un archivo, cuántos renglones de diff (se recorren igual). */
  cuantas(): number {
    const p = this.paso;
    if (p) {
      const d = this.leer(this.claveDelPaso(p));
      if (typeof d !== "object" || "error" in d) return 0;
      return d.que === "commits" ? d.commits.length : d.que === "archivos" ? d.archivos.length : Math.max(1, d.filas.length - this.altoDelDiff + 1);
    }
    if (this.pestana === "ramas") return this.ramas?.length ?? 0;
    if (this.pestana === "commits") return this.commitsDelGrafo().length;
    return this.issues?.length ?? 0;
  }

  commitsDelGrafo(): Commit[] {
    return (this.grafo ?? []).flatMap((r) => (r.commit ? [r.commit] : []));
  }

  /** Lo que lista el paso actual (los commits de la rama, los archivos del commit o el diff). */
  delPaso(): Leido | null {
    const p = this.paso;
    return p ? this.leer(this.claveDelPaso(p)) : null;
  }

  /** El detalle de la fila elegida, a la derecha; si todavía no está, lo pide y avisa cuando llega. */
  detalle(seleccion: number): Leido | null {
    const clave = this.claveDe(seleccion);
    return clave ? this.leer(clave) : null;
  }

  /** Entra a la fila elegida. Devuelve la fila nueva, o null si ahí no hay adónde entrar. */
  entrar(seleccion: number): number | null {
    const siguiente = this.pasoDesde(seleccion);
    if (!siguiente) return null;
    this.adentro.push(siguiente);
    return 0;
  }

  /** Vuelve un paso. Devuelve la fila de donde se había entrado, o null si ya estaba afuera. */
  salir(): number | null {
    return this.adentro.pop()?.volverA ?? null;
  }

  private pasoDesde(seleccion: number): PasoGit | null {
    const commit = (c: Commit | undefined): PasoGit | null => (c ? { que: "commit", hash: c.hash, hashCorto: c.hashCorto, mensaje: c.mensaje, volverA: seleccion } : null);
    const p = this.paso;
    if (!p) {
      if (this.pestana === "ramas") {
        const r = this.ramas?.[seleccion];
        return r ? { que: "rama", rama: r.nombre, volverA: seleccion } : null;
      }
      return this.pestana === "commits" ? commit(this.commitsDelGrafo()[seleccion]) : null;
    }
    const d = this.delPaso();
    if (typeof d !== "object" || d === null || "error" in d) return null;
    if (d.que === "commits") return commit(d.commits[seleccion]);
    if (d.que === "archivos" && p.que === "commit") {
      const a = d.archivos[seleccion];
      return a ? { que: "archivo", hash: p.hash, archivo: a.archivo, volverA: seleccion } : null;
    }
    return null;
  }

  private claveDelPaso(p: PasoGit): string {
    return p.que === "rama" ? `r:${p.rama}` : p.que === "commit" ? `c:${p.hash}` : `d:${p.hash}:${p.archivo}`;
  }

  private claveDe(seleccion: number): string | null {
    const p = this.paso;
    // Adentro de un archivo el diff ocupa todo: no hay detalle aparte.
    if (p?.que === "archivo") return null;
    if (p) {
      const siguiente = this.pasoDesde(seleccion);
      return siguiente ? this.claveDelPaso(siguiente) : null;
    }
    if (this.pestana === "ramas") return this.ramas?.[seleccion] ? `r:${this.ramas[seleccion]!.nombre}` : null;
    if (this.pestana === "commits") {
      const c = this.commitsDelGrafo()[seleccion];
      return c ? `c:${c.hash}` : null;
    }
    return null;
  }

  private leer(clave: string): Leido {
    const guardado = this.leidos.get(clave);
    if (guardado) return guardado;
    this.leidos.set(clave, "cargando");
    const [tipo, ...resto] = clave.split(":");
    const valor = resto.join(":");
    const pedido: Promise<DetalleGit> =
      tipo === "r"
        ? commitsDeLaRama(this.repo, valor, COMMITS_DE_UNA_RAMA).then((d) => ({ que: "commits" as const, ...d }))
        : tipo === "c"
          ? detalleDeCommit(this.repo, valor).then((d) => ({ que: "archivos" as const, ...d }))
          : diffDeCommit(this.repo, valor.slice(0, valor.indexOf(":")), valor.slice(valor.indexOf(":") + 1)).then((d) => ({ que: "diff" as const, filas: filasDelDiff(d.texto), recortado: d.recortado }));
    void pedido.then(
      (d) => (this.leidos.set(clave, d), this.alCambiar()),
      (e: unknown) => (this.leidos.set(clave, { error: e instanceof Error ? e.message : String(e) }), this.alCambiar()),
    );
    return "cargando";
  }
}
