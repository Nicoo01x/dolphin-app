"use client";

import { useState } from "react";
import { pedir } from "./api";

/** La puerta del panel: una contraseña, sin usuario. Un error dice qué pasó y qué hacer. */
export function Ingreso({ alEntrar }: { readonly alEntrar: () => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(evento: { preventDefault(): void }) {
    evento.preventDefault();
    if (!clave) return;
    setEntrando(true);
    setError(null);
    try {
      await pedir("/entrar", { metodo: "POST", cuerpo: { clave } });
      alEntrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar.");
      setEntrando(false);
    }
  }

  return (
    <main id="contenido" className="grid min-h-dvh place-items-center bg-lienzo-2 px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-ventana bg-lienzo p-8 shadow-[0_1px_2px_rgb(11_13_16/0.06),0_12px_40px_-12px_rgb(11_13_16/0.18)]">
        <h1 className="text-[26px] font-bold tracking-[var(--tracking-titulo)] text-espuma">Panel de Dolphin</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-tenue">Crashes, comentarios, descargas y visitas.</p>
        <label htmlFor="clave" className="mt-8 block text-[13px] font-medium text-tinta">
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="mt-2 h-11 w-full rounded-control bg-lienzo-3 px-4 text-[15px] text-espuma outline-none transition-colors duration-150 hover:bg-lienzo-4 focus-visible:ring-2 focus-visible:ring-electrico focus-visible:ring-offset-2"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "error-ingreso" : undefined}
        />
        {error && (
          <p id="error-ingreso" role="alert" className="mt-3 text-[14px] text-cayo">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={entrando || !clave}
          className="mt-6 h-11 w-full rounded-full bg-espuma text-[15px] font-medium text-lienzo transition duration-150 ease-out hover:bg-espuma/85 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electrico focus-visible:ring-offset-2"
        >
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
