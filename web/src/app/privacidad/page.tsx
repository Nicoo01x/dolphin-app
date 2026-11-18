import type { Metadata } from "next";
import { Escena } from "@/components/Escena";
import { canonicalDe, REPO, SITIO_PUBLICADO } from "@/lib/contenido";

const DESCRIPCION = "Qué sale de tu máquina cuando usás Dolphin, qué lleva un reporte de crash y qué se cuenta en esta web.";

export const metadata: Metadata = {
  title: "Privacidad",
  description: DESCRIPCION,
  openGraph: { title: "Privacidad · Dolphin", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/privacidad" } : {}) },
  ...canonicalDe("/privacidad"),
};

/**
 * Lo que dice esta página sale del código, no de una plantilla legal:
 * - el reporte de crash: escritorio/src/shared/crash-reporting.ts (formatCrashReportText) y
 *   crash-report-redaction.ts (lo que se tacha);
 * - adónde va: DOLPHIN_FEEDBACK_URL en escritorio/src/shared/dolphin-brand.ts;
 * - lo que guarda el servidor y lo que cuenta la web: web/servidor/.
 * Si eso cambia, cambia esto.
 */
const SECCIONES: readonly { titulo: string; parrafos: readonly string[]; lista?: readonly string[] }[] = [
  {
    titulo: "Lo que sale para trabajar",
    parrafos: [
      "Dolphin corre en tu máquina con tus cuentas. Lo que viaja afuera para que un agente trabaje es lo que tu CLI (Claude Code, Codex u otro) le manda a su proveedor, con tu sesión, igual que si lo usaras sin Dolphin. Si conectás un bot a Telegram, sus mensajes pasan por Telegram.",
      "No hay cuenta de Dolphin. La consola escucha sólo en tu propia máquina (127.0.0.1) y el núcleo no tiene telemetría.",
    ],
  },
  {
    titulo: "Los reportes de crash",
    parrafos: [
      "Si la app de escritorio se cierra de golpe, la próxima vez te ofrece mandar un reporte. Sale sólo si tocás enviar, va al servidor de Dolphin (odolphin.tech) y no se reenvía a nadie: lo lee quien hace Dolphin para arreglar el error.",
      "Un reporte lleva:",
    ],
    lista: [
      "la versión de Dolphin, tu sistema operativo y su versión, la arquitectura (x64, arm64) y las versiones de Electron y Chrome;",
      "qué proceso se cayó, el motivo y el código de salida, y el módulo donde falló si se sabe;",
      "los últimos pasos de la app antes de caerse, como eventos con nombre (abrir un espacio, lanzar una terminal…);",
      "lo que escribas en la nota, si escribís algo;",
      "si lo dejás marcado, los registros de diagnóstico de la app;",
      "tu usuario de GitHub, sólo si no lo mandás de forma anónima.",
    ],
  },
  {
    titulo: "Lo que se tacha antes de mandar",
    parrafos: [
      "Antes de salir, el reporte pasa por un filtro que reemplaza las rutas de tus carpetas por [redacted-path], las credenciales metidas en direcciones por [redacted-credential] y lo que parece una clave o un token por [redacted-secret].",
    ],
  },
  {
    titulo: "Los comentarios",
    parrafos: [
      "«Enviar comentarios», en el menú de Ayuda de la app, manda lo que escribas, las imágenes que adjuntes y la versión y el sistema, al mismo servidor. Nada más.",
    ],
  },
  {
    titulo: "Lo que cuenta esta web",
    parrafos: [
      "odolphin.tech cuenta cuántas veces se vio cada página por día, de qué sitio venía la gente (google.com, github.com…) y en qué sistema se tocó «Descargar». No usa cookies ni guarda tu IP ni ningún identificador: no hay forma de saber que dos visitas son de la misma persona. No hay Google Analytics ni píxeles de terceros.",
      "Las descargas de los instaladores las cuenta GitHub, que es de donde se bajan.",
    ],
  },
  {
    titulo: "Para borrar un reporte",
    parrafos: [
      `Escribí en las Discussions del repositorio (${REPO}/discussions) con la fecha aproximada y tu sistema, y se borra.`,
    ],
  },
];

export default function Privacidad() {
  return (
    <Escena>
      <article className="mx-auto max-w-[760px] px-6 pt-10 pb-28 md:px-10">
        <h1 className="titulo-grande">Privacidad.</h1>
        <p className="bajada mt-6">Qué sale de tu máquina cuando usás Dolphin, y para qué.</p>
        {SECCIONES.map((s) => (
          <section key={s.titulo} className="mt-14" aria-labelledby={`p-${s.titulo}`}>
            <h2 id={`p-${s.titulo}`} className="text-[24px] font-medium tracking-[var(--tracking-titulo)] text-espuma">
              {s.titulo}
            </h2>
            {s.parrafos.map((p) => (
              <p key={p.slice(0, 30)} className="mt-4 text-[16px] leading-relaxed text-tinta/80">
                {p}
              </p>
            ))}
            {s.lista && (
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[16px] leading-relaxed text-tinta/80 marker:text-apagado">
                {s.lista.map((l) => (
                  <li key={l.slice(0, 30)}>{l}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="mt-16 text-[14px] text-tenue">Última actualización: 18 de noviembre de 2026.</p>
      </article>
    </Escena>
  );
}
