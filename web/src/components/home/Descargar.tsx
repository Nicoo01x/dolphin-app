"use client";

import { useEffect, useState } from "react";
import { contarDescarga } from "@/lib/contador";
import { INSTALADORES, SISTEMAS, sistemaDelNavegador, type Sistema } from "@/lib/descargas";

/**
 * El botón de descarga de la portada y del cierre: el instalador del sistema de quien visita, y
 * los otros dos a mano abajo. Los archivos y sus nombres viven en `lib/descargas.ts`.
 *
 * El sistema se lee recién en el navegador: el HTML sale con Windows (el export es estático y no
 * sabe quién lo pide) y se corrige al montar. Por eso el botón no cambia de ancho: «Descargar para
 * macOS» y «Descargar para Windows» miden casi lo mismo, y el resto de la fila no se mueve.
 *
 * Los instaladores todavía no están firmados: la nota dice cómo abrirlos, sin dramatizar.
 */
export function Descargar({ alinear = "centro", conNota = true }: { readonly alinear?: "centro" | "izquierda"; readonly conNota?: boolean }) {
  const [sistema, setSistema] = useState<Sistema>("windows");

  useEffect(() => {
    const datos = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    setSistema(sistemaDelNavegador(navigator.userAgent, datos?.platform ?? navigator.platform));
  }, []);

  const elegido = INSTALADORES[sistema];
  const otros = SISTEMAS.filter((s) => s !== sistema).map((s) => INSTALADORES[s]);
  const centro = alinear === "centro";

  return (
    <div className={`flex flex-col ${centro ? "items-center text-center" : "items-start"}`}>
      <a href={elegido.url} className="boton-pill h-11 px-5" download onClick={() => contarDescarga(elegido.sistema)}>
        <IconoBajar />
        Descargar para {elegido.nombre}
      </a>
      <p className="mt-3 text-[13px] text-tenue">
        También para{" "}
        {otros.map((o, i) => (
          <span key={o.sistema}>
            {i > 0 ? " y " : ""}
            <a
              href={o.url}
              className="text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma"
              download
              onClick={() => contarDescarga(o.sistema)}
            >
              {o.nombre}
            </a>
          </span>
        ))}
        .
      </p>
      {conNota ? (
        <p className="mt-1.5 max-w-[46ch] text-[13px] leading-[1.5] text-tenue">
          Todavía sin firmar. {elegido.sinFirma.replace(/`/g, "")}
        </p>
      ) : null}
    </div>
  );
}

function IconoBajar() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />
    </svg>
  );
}
