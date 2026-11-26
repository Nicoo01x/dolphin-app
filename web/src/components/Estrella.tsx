"use client";

import { useEffect, useState } from "react";
import { REPO } from "@/lib/contenido";

/**
 * Pedirle una estrella en GitHub a quien le gusta Dolphin (Nico, 26/11/2026: «si te gusta Dolphin,
 * dejá una estrellita en GitHub, me gustaría tener más estrellas»).
 *
 * El número se pide en el navegador a la API pública de GitHub (sin cookies ni datos de quien
 * visita) y se guarda una hora, así navegar la web no gasta el límite de GitHub. Hasta las diez
 * estrellas no se muestra: un «1» al lado del botón aleja más de lo que invita.
 */
const API = REPO.replace("https://github.com/", "https://api.github.com/repos/");
const CLAVE = "dolphin-estrellas";
const UNA_HORA = 60 * 60 * 1000;
const DESDE_CUANTAS_SE_MUESTRA = 10;

function leerGuardadas(): number | null {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null") as { n: number; t: number } | null;
    return guardado && Date.now() - guardado.t < UNA_HORA ? guardado.n : null;
  } catch {
    return null;
  }
}

function useEstrellas(): number | null {
  const [estrellas, setEstrellas] = useState<number | null>(null);
  useEffect(() => {
    const guardadas = leerGuardadas();
    if (guardadas !== null) {
      setEstrellas(guardadas);
      return;
    }
    const control = new AbortController();
    fetch(API, { signal: control.signal, headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ stargazers_count?: number }>) : null))
      .then((datos) => {
        const n = datos?.stargazers_count;
        if (typeof n !== "number") return;
        setEstrellas(n);
        try {
          sessionStorage.setItem(CLAVE, JSON.stringify({ n, t: Date.now() }));
        } catch {
          // Sin almacenamiento (ventana privada): se vuelve a pedir en la próxima página.
        }
      })
      .catch(() => {
        // Sin red o GitHub sin contestar: el botón sigue, sin número.
      });
    return () => control.abort();
  }, []);
  return estrellas;
}

function formatear(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "")}k` : String(n);
}

export function IconoEstrella({ className = "size-4" }: { readonly className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M8 .9l2.06 4.38 4.79.6-3.5 3.32.9 4.75L8 11.62 3.75 13.95l.9-4.75L1.15 5.88l4.79-.6L8 .9z" />
    </svg>
  );
}

/** La pastilla de la barra: chica, tonal, para no competir con «Descargar». */
export function EstrellaEnLaBarra() {
  const estrellas = useEstrellas();
  const conNumero = estrellas !== null && estrellas >= DESDE_CUANTAS_SE_MUESTRA;
  return (
    <a
      href={REPO}
      className="boton-tonal h-[32px] gap-1.5 px-3 text-[13px] max-md:hidden"
      aria-label={conNumero ? `Dale una estrella en GitHub (${estrellas} estrellas)` : "Dale una estrella en GitHub"}
    >
      <IconoEstrella className="size-3.5 text-[#e3a008]" />
      <span>{conNumero ? "Estrella" : "Dar una estrella"}</span>
      {conNumero && <span className="tabular-nums text-tenue">{formatear(estrellas)}</span>}
    </a>
  );
}

/** El pedido del cierre, con el porqué: una estrella hace que más gente lo encuentre. */
export function PedidoDeEstrella() {
  const estrellas = useEstrellas();
  const conNumero = estrellas !== null && estrellas >= DESDE_CUANTAS_SE_MUESTRA;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] bg-lienzo-2 px-5 py-4">
      <IconoEstrella className="size-6 flex-none text-[#e3a008]" />
      <p className="min-w-0 flex-1 text-[15px] leading-[1.45] text-tinta">
        <span className="font-medium text-espuma">¿Te gusta Dolphin?</span> Dejale una estrella en GitHub: es gratis, tarda un segundo y
        hace que más gente lo encuentre.
      </p>
      <a href={REPO} className="boton-pill h-[36px] flex-none px-4 text-[14px]">
        <IconoEstrella className="size-3.5 text-[#f5c542]" />
        Dar una estrella
        {conNumero && <span className="tabular-nums opacity-70">· {formatear(estrellas)}</span>}
      </a>
    </div>
  );
}
