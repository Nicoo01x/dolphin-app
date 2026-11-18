"use client";

import { useEffect, useState } from "react";
import { contarDescarga } from "@/lib/contador";
import { INSTALADORES, RELEASES, SISTEMAS, sistemaDelNavegador, type Sistema } from "@/lib/descargas";
import { REPO } from "@/lib/contenido";

const ULTIMA = `${REPO}/releases/latest/download/`;

/** Lo que hay para cada sistema, con el paso de la primera vez escrito sin vueltas. */
const DETALLE: Record<Sistema, { readonly archivos: readonly { nombre: string; href: string; nota: string }[]; readonly pasos: readonly string[] }> = {
  windows: {
    archivos: [{ nombre: "Instalador para Windows", href: INSTALADORES.windows.url, nota: "Windows 10 y 11, 64 bits" }],
    pasos: [
      "Abrí dolphin-windows-setup.exe.",
      "Si SmartScreen dice que la app no es reconocida: «Más información» → «Ejecutar de todas formas». Pasa porque el instalador todavía no está firmado.",
      "Las versiones nuevas se bajan solas y te avisa para reiniciar.",
    ],
  },
  macos: {
    archivos: [
      { nombre: "Para Apple Silicon", href: INSTALADORES.macos.url, nota: "M1, M2, M3, M4 · macOS 13.4 o más nuevo" },
      { nombre: "Para Intel", href: `${ULTIMA}dolphin-macos-x64.dmg`, nota: "Mac con procesador Intel" },
    ],
    pasos: [
      "Abrí el .dmg y arrastrá Dolphin a Aplicaciones.",
      "La primera vez: clic derecho sobre la app → «Abrir» → «Abrir». macOS pregunta porque la app todavía no está firmada.",
      "Cuando salga una versión nueva, la app te avisa y te lleva a bajarla.",
    ],
  },
  linux: {
    archivos: [
      { nombre: "AppImage", href: INSTALADORES.linux.url, nota: "Cualquier distribución, x64" },
      { nombre: ".deb y .rpm", href: RELEASES, nota: "Debian, Ubuntu, Fedora: en la página de versiones" },
    ],
    pasos: [
      "chmod +x dolphin-linux.AppImage y abrilo.",
      "Con el .deb: sudo apt install ./dolphin_<versión>_amd64.deb. Con el .rpm: sudo dnf install ./dolphin-<versión>.x86_64.rpm.",
      "El AppImage se actualiza solo.",
    ],
  },
};

const NOMBRES: Record<Sistema, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

export function Instaladores() {
  const [tuyo, setTuyo] = useState<Sistema | null>(null);

  useEffect(() => {
    const datos = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    setTuyo(sistemaDelNavegador(navigator.userAgent, datos?.platform ?? ""));
  }, []);

  // El del visitante primero; el HTML del export sale con el orden de siempre.
  const orden = tuyo ? [tuyo, ...SISTEMAS.filter((s) => s !== tuyo)] : SISTEMAS;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {orden.map((s) => (
        <section key={s} aria-labelledby={`sistema-${s}`} className={`flex flex-col rounded-[var(--radius-tarjeta)] p-6 ${s === tuyo ? "bg-lienzo-3" : "bg-lienzo-2"}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`sistema-${s}`} className="text-[22px] font-medium tracking-[var(--tracking-titulo)] text-espuma">
              {NOMBRES[s]}
            </h2>
            {s === tuyo && <span className="text-[13px] text-tenue">tu sistema</span>}
          </div>
          <ul className="mt-5 flex flex-col gap-2">
            {DETALLE[s].archivos.map((a) => (
              <li key={a.nombre}>
                <a
                  href={a.href}
                  onClick={() => contarDescarga(s)}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-caja)] bg-lienzo px-4 py-3 transition-colors duration-150 hover:bg-lienzo-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico"
                >
                  <span>
                    <span className="block text-[15px] font-medium text-espuma">{a.nombre}</span>
                    <span className="block text-[13px] text-tenue">{a.nota}</span>
                  </span>
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4 flex-none text-tenue transition-transform duration-200 group-hover:translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
          <ol className="mt-6 flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-relaxed text-tenue marker:text-apagado">
            {DETALLE[s].pasos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
