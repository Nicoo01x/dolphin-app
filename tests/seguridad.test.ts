import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { hallazgosDeSeguridad, riesgosDe, verificadorDeSeguridad } from "../src/nucleo/seguridad.js";
import { prepararSiembra } from "../src/siembra.js";

const correr = promisify(execFile);
let repos: string[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map(borrarCarpeta));
});

describe("fase de seguridad", () => {
  it("encuentra las tres filtraciones: la clave en el bundle, la tabla sin RLS y el endpoint que escribe sin preguntar", () => {
    // 1a. Un secreto con prefijo de cliente: el nombre ya dice que viaja al navegador.
    const porNombre = hallazgosDeSeguridad(
      diffDeArchivoNuevo("src/cliente.ts", ["export const clave = import.meta.env.VITE_STRIPE_SECRET_KEY;"]),
    );
    expect(porNombre).toHaveLength(1);
    expect(porNombre[0]).toMatchObject({ tipo: "clave-en-el-front", archivo: "src/cliente.ts", linea: 1 });
    expect(porNombre[0]?.detalle).toContain("VITE_STRIPE_SECRET_KEY");

    // 1b. Y una clave de proveedor escrita a mano en un archivo que se sirve al navegador.
    const aMano = hallazgosDeSeguridad(
      diffDeArchivoNuevo("web/src/pagos.ts", [
        'import Stripe from "stripe";',
        `export const stripe = new Stripe("${claveDeStripeDeMentira()}");`,
      ]),
    );
    expect(aMano).toHaveLength(1);
    expect(aMano[0]).toMatchObject({ tipo: "clave-en-el-front", linea: 2 });
    expect(aMano[0]?.detalle).toContain("Stripe");

    // El mismo archivo y el mismo nombre que un caso limpio de más abajo, con el
    // valor puesto: lo que salva al `.env.local` vacío es el relleno, no el archivo.
    const conValor = hallazgosDeSeguridad(
      diffDeArchivoNuevo(".env.local", [`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${jwtDeMentira("service_role")}`]),
    );
    expect(conValor).toHaveLength(1);

    // Y lo mismo con el archivo que arma el cliente de Supabase: lo que lo salva es
    // que use la clave anon, no que esté en una lista de archivos perdonados.
    const clienteConServiceRole = hallazgosDeSeguridad(
      diffDeArchivoNuevo("web/src/supabase.ts", [
        "export const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!);",
      ]),
    );
    expect(clienteConServiceRole).toHaveLength(1);

    // 1c. La service_role de Supabase no tiene prefijo que la delate: se decodifica el JWT.
    const serviceRole = hallazgosDeSeguridad(
      diffDeArchivoNuevo("web/src/datos.tsx", [`const clave = "${jwtDeMentira("service_role")}";`]),
    );
    expect(serviceRole).toHaveLength(1);
    expect(serviceRole[0]?.detalle).toContain("service_role");

    // 2. Una tabla nueva de Supabase sin RLS.
    const sinRls = hallazgosDeSeguridad(
      diffDeArchivoNuevo("supabase/migrations/20260131_notas.sql", [
        "create table public.notas (",
        "  id uuid primary key default gen_random_uuid(),",
        "  autor uuid references auth.users (id),",
        "  texto text not null",
        ");",
      ]),
    );
    expect(sinRls).toHaveLength(1);
    expect(sinRls[0]).toMatchObject({ tipo: "tabla-sin-rls", archivo: "supabase/migrations/20260131_notas.sql", linea: 1 });
    expect(sinRls[0]?.detalle).toContain("«notas»");

    // 3. Un endpoint que escribe sin ningún chequeo cerca. Ojo con «guardar»: tiene
    //    «guard» adentro y por eso la señal de auth no puede ir con un `\b` cualquiera.
    const sinAuth = hallazgosDeSeguridad(
      diffDeArchivoNuevo("server/rutas/notas.ts", [
        'import { app } from "../app.js";',
        "",
        'app.post("/api/notas", async (req, res) => {',
        "  const nota = await guardar(req.body);",
        "  res.status(201).json(nota);",
        "});",
      ]),
    );
    expect(sinAuth).toHaveLength(1);
    expect(sinAuth[0]).toMatchObject({ tipo: "endpoint-sin-auth", archivo: "server/rutas/notas.ts", linea: 3 });
    expect(sinAuth[0]?.detalle).toContain("POST /api/notas");

    // 3b. Y el route handler de Next, donde el método es el nombre de la función.
    const deNext = hallazgosDeSeguridad(
      diffDeArchivoNuevo("app/api/facturas/route.ts", [
        "export async function POST(pedido: Request) {",
        "  const datos = await pedido.json();",
        "  await crear(datos);",
        "  return Response.json(datos);",
        "}",
      ]),
    );
    expect(deNext).toHaveLength(1);
    expect(deNext[0]?.detalle).toContain("POST /api/facturas");
  });

  /**
   * Lo más importante del archivo. Una fase que grita en falso se apaga a la
   * semana, y una fase apagada no protege de nada: cada caso de acá es una rama
   * legítima que se parece a una filtración y NO tiene que cortarse.
   */
  it("no grita en falso", () => {
    const limpios: Record<string, readonly [string, readonly string[]]> = {
      "la clave de ejemplo del .env.example": [
        ".env.example",
        ["VITE_STRIPE_SECRET_KEY=sk_test_poné_la_tuya", "NEXT_PUBLIC_API_URL=https://api.ejemplo.com"],
      ],
      "un .env.local todavía sin completar": [".env.local", ["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY="]],
      "las variables públicas de verdad: la URL y la clave anon": [
        "web/src/supabase.ts",
        [
          'import { createClient } from "@supabase/supabase-js";',
          "",
          "export const api = process.env.NEXT_PUBLIC_API_URL;",
          "export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);",
        ],
      ],
      "la clave anon, que es un JWT igualito a la service_role": [
        "web/src/datos.tsx",
        [`const clave = "${jwtDeMentira("anon")}";`],
      ],
      "una tabla con el RLS prendido abajo": [
        "supabase/migrations/20260131_notas.sql",
        [
          "create table public.notas (",
          "  id uuid primary key,",
          "  autor uuid not null",
          ");",
          "",
          "alter table public.notas",
          "  enable row level security;",
          "",
          'create policy "cada uno ve lo suyo" on public.notas',
          "  for select using (auth.uid() = autor);",
        ],
      ],
      "una migración de un Postgres que no publica nada por HTTP": [
        "migrations/001_usuarios.sql",
        ["create table usuarios (", "  id serial primary key,", "  email text not null unique", ");"],
      ],
      "una tabla en un esquema que la API no expone": [
        "supabase/migrations/20260131_privado.sql",
        ["create schema if not exists privado;", "create table privado.auditoria (id bigserial primary key);"],
      ],
      "un endpoint de lectura": [
        "server/rutas/listar.ts",
        ['import { app } from "../app.js";', "", 'app.get("/api/notas", async (_req, res) => {', "  res.json(await listar());", "});"],
      ],
      "un endpoint que sí valida la sesión": [
        "server/rutas/borrar.ts",
        [
          'import { app } from "../app.js";',
          'import { sesionDe } from "../sesion.js";',
          "",
          'app.delete("/api/notas/:id", async (req, res) => {',
          "  const sesion = await sesionDe(req);",
          '  if (!sesion) return res.status(401).json({ error: "Entrá de nuevo para seguir." });',
          "  await borrar(req.params.id, sesion.usuarioId);",
          "  res.status(204).end();",
          "});",
        ],
      ],
      "un endpoint que mira la cabecera, que es un string": [
        "server/rutas/importar.ts",
        [
          'import { app } from "../app.js";',
          "",
          'app.put("/api/notas", async (req, res) => {',
          '  if (req.headers["authorization"] !== `Bearer ${process.env.CLAVE_INTERNA}`) return res.status(403).end();',
          "  await reemplazar(req.body);",
          "  res.end();",
          "});",
        ],
      ],
      "un login, que no puede pedir sesión": [
        "server/rutas/entrar.ts",
        [
          'import { app } from "../app.js";',
          "",
          'app.post("/api/login", async (req, res) => {',
          "  const persona = await buscarPorMail(req.body.mail);",
          "  res.json({ ok: true, id: persona.id });",
          "});",
        ],
      ],
      "un router con el guardia puesto arriba, para todas sus rutas": [
        "server/rutas/empresas.ts",
        [
          'import { router } from "../router.js";',
          "",
          "router.use(autenticar);",
          "",
          'router.post("/api/empresas", async (req, res) => {',
          "  res.json(await alta(req.body));",
          "});",
        ],
      ],
      "una llamada del front, que no es un endpoint": [
        "web/src/api.ts",
        ['import axios from "axios";', "", 'export const crear = (nota: Nota) => axios.post("/api/notas", nota);'],
      ],
      "una clave de mentira en un test": [
        "tests/pagos.test.ts",
        [`const stripe = new Stripe("${claveDeStripeDeMentira()}");`],
      ],
    };

    // Cada caso va en su propio diff: juntos, la huella de Supabase de uno hace
    // que la regla 2 se aplique al de al lado, y eso no es lo que se prueba.
    for (const [porQue, [archivo, lineas]] of Object.entries(limpios)) {
      expect(hallazgosDeSeguridad(diffDeArchivoNuevo(archivo, lineas)), porQue).toEqual([]);
    }
  });

  it("mira el diff de la rama, así que lo que ya estaba mal no se le cobra a ella", async () => {
    const repo = await repoBase();
    await git(repo, ["checkout", "-q", "-b", "rama", "main"]);
    await writeFile(join(repo, "web", "src", "saludo.ts"), 'export const saludo = () => "hola";\n');
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "-qm", "saludo"]);

    // En main ya hay una clave en el front y una tabla sin RLS: no son de esta rama.
    expect(await riesgosDe(repo, "main")).toEqual([]);

    // Lo que sí agrega, todavía sin commitear: el portón lo ve contra HEAD.
    await writeFile(join(repo, "supabase", "migrations", "002_notas.sql"), "create table public.notas (id uuid primary key);\n");
    const veredicto = await verificadorDeSeguridad().correr({ id: "u1", rama: "rama", ruta: repo, nacido: 0 });
    expect(veredicto.paso).toBe(false);
    expect(veredicto.detalle).toContain("supabase/migrations/002_notas.sql:1");
    expect(veredicto.detalle).toContain("«notas»");
    expect(veredicto.gastado).toBe(0);
  }, 120_000);

  it("viene puesta y se apaga desde dolphin.config.json", async () => {
    const repo = await repoBase();
    const fases = async () => (await prepararSiembra({ repo, tarea: "sumá una pantalla", agente: "mentira" })).verificadores.map((v) => v.nombre);
    expect(await fases()).toContain("seguridad");

    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ seguridad: false }));
    expect(await fases()).not.toContain("seguridad");
  }, 120_000);
});

/** Un diff unificado de un archivo nuevo: todas sus líneas, agregadas. */
function diffDeArchivoNuevo(archivo: string, lineas: readonly string[]): string {
  return [
    `diff --git a/${archivo} b/${archivo}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${archivo}`,
    `@@ -0,0 +1,${lineas.length} @@`,
    ...lineas.map((l) => `+${l}`),
    "",
  ].join("\n");
}

/**
 * Una clave «live» de Stripe inventada. Se arma en partes a propósito: escrita entera en el
 * archivo, el escáner de secretos de GitHub la toma por una clave real en el repo público (pasó
 * con la 1.6.0). El detector recibe exactamente el mismo texto.
 */
function claveDeStripeDeMentira(): string {
  return ["sk", "live", "51H8xQ2eZvKYlo2CabcdefghijKL"].join("_");
}

/** Un JWT con el `role` que se le pida: la forma es la que mira la regla, la firma no se valida. */
function jwtDeMentira(rol: string): string {
  const parte = (datos: unknown) => Buffer.from(JSON.stringify(datos)).toString("base64url");
  return `${parte({ alg: "HS256", typ: "JWT" })}.${parte({ iss: "supabase", role: rol, iat: 1 })}.unafirmacualquiera`;
}

async function repoBase(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "dolphin-seguridad-"));
  repos.push(repo);
  await mkdir(join(repo, "web", "src"), { recursive: true });
  await mkdir(join(repo, "supabase", "migrations"), { recursive: true });
  await writeFile(join(repo, "web", "src", "pagos.ts"), `export const clave = "${claveDeStripeDeMentira()}";\n`);
  await writeFile(join(repo, "supabase", "migrations", "001_perfiles.sql"), "create table public.perfiles (id uuid primary key);\n");
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-qm", "base"]);
  return repo;
}

async function git(repo: string, args: readonly string[]): Promise<void> {
  const conIdentidad = args[0] === "commit" ? ["-c", "user.email=n@n", "-c", "user.name=n", ...args] : [...args];
  await correr("git", conIdentidad, { cwd: repo, windowsHide: true });
}
