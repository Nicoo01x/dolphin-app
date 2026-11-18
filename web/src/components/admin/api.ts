// El panel le habla a /api/admin/* del mismo origen (Caddy lo pasa al servicio de web/servidor).
// La sesión es una cookie HttpOnly: acá no se guarda nada.

export class SinSesion extends Error {}

export async function pedir<T>(ruta: string, opciones: { metodo?: "GET" | "POST"; cuerpo?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api/admin${ruta}`, {
    method: opciones.metodo ?? "GET",
    credentials: "same-origin",
    headers: opciones.cuerpo !== undefined ? { "content-type": "application/json" } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  if (r.status === 401 && ruta !== "/entrar") throw new SinSesion();
  const datos = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok) throw new Error(datos.error ?? `El servidor contestó ${r.status}.`);
  return datos;
}

export type Resumen = {
  dias: number;
  crashesSinVer: number;
  comentariosSinVer: number;
  crashesPeriodo: number;
  firmasAbiertas: number;
  visitasPeriodo: number;
  clicsPeriodo: number;
};

export type Firma = {
  firma: string;
  titulo: string | null;
  veces: number;
  primera: string;
  ultima: string;
  sin_ver: number;
  versiones: string | null;
  plataformas: string | null;
  resuelto_en: string | null;
  version_al_resolver: string | null;
};

export type ReporteCorto = {
  id: string;
  recibido: string;
  version: string | null;
  plataforma: string | null;
  sistema: string | null;
  arch: string | null;
  proceso: string | null;
  motivo: string | null;
  visto: number;
  diagnostico_bytes: number;
};

export type Reporte = ReporteCorto & {
  texto: string;
  github: string | null;
  correo: string | null;
  imagenes: string[];
  tipo: "crash" | "feedback";
};

export type Comentario = {
  id: string;
  recibido: string;
  version: string | null;
  plataforma: string | null;
  sistema: string | null;
  texto: string;
  github: string | null;
  correo: string | null;
  imagenes: number;
  diagnostico_bytes: number;
  visto: number;
};

type PorSistema = { windows: number; macos: number; linux: number };

export type Descargas = {
  dias: number;
  error: string | null;
  github: {
    total: { instaladores: PorSistema; chequeos: PorSistema; actualizaciones: number };
    versiones: {
      tag: string;
      publicada: string;
      prerelease: boolean;
      instaladores: PorSistema;
      chequeos: PorSistema;
      actualizaciones: number;
      archivos: { nombre: string; descargas: number; sistema: string }[];
    }[];
    consultado: string;
    viejo?: boolean;
  } | null;
  clics: { dia: string; sistema: string; n: number }[];
};

export type Visitas = {
  dias: number;
  porDia: { dia: string; n: number }[];
  porRuta: { ruta: string; n: number }[];
  porOrigen: { origen: string; n: number }[];
};

const PLATAFORMAS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };
export const nombrePlataforma = (p: string | null) => (p ? PLATAFORMAS[p] ?? p : "—");

export function haceCuanto(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return "recién";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export const numero = (n: number) => n.toLocaleString("es-AR");
