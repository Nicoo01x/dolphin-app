import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deshacerBot } from "@/lib/bots";
import { Aviso, conTono } from "./Pagina";

/**
 * Deshacer lo último que tocó un bot con permiso «carpeta»: antes de cada corrida con escritura deja
 * un punto (un `git stash create`, sin tocar tu rama ni tu índice) y esto vuelve la carpeta ahí.
 *
 * Es destructivo, así que se confirma en dos pasos y sin ventana: el segundo dice qué se pierde.
 * Vuelve TODA la carpeta a ese momento: también lo que hayas cambiado vos después.
 */
export function BotDeshacer({ id, alHecho }: { id: string; alHecho: () => Promise<unknown> }) {
  const [paso, setPaso] = useState<"quieto" | "confirmar" | "deshaciendo">("quieto");
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);

  const deshacer = async () => {
    setPaso("deshaciendo");
    try {
      await deshacerBot(id);
      setAviso({ bien: true, texto: "Listo: la carpeta volvió a como estaba antes de su última corrida." });
      await alHecho();
    } catch (e) {
      setAviso({ bien: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setPaso("quieto");
    }
  };

  return (
    <section className="bg-background mt-6 flex flex-col gap-3 rounded-2xl p-4" aria-labelledby={`deshacer-${id}`}>
      <h3 id={`deshacer-${id}`} className="titulo-seccion">
        Deshacer lo último que tocó
      </h3>
      {paso === "confirmar" ? (
        <div className="bg-murio/10 flex flex-wrap items-center gap-3 rounded-xl p-3" role="alert">
          <p className="min-w-0 flex-1 text-[13px]">Vuelve toda la carpeta a antes de su última corrida: también se pierde lo que hayas cambiado vos después.</p>
          <Button variant="secondary" onClick={() => setPaso("quieto")}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void deshacer()}>
            Sí, deshacer
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          disabled={paso === "deshaciendo"}
          onClick={() => {
            setAviso(null);
            setPaso("confirmar");
          }}
        >
          <RotateCcw aria-hidden="true" />
          {paso === "deshaciendo" ? "Deshaciendo…" : "Deshacer"}
        </Button>
      )}
      {aviso &&
        (aviso.bien ? (
          <p role="status" className="flex items-baseline gap-2 text-[13px]">
            <span aria-hidden="true" className="punto-tono size-2 flex-none translate-y-[-1px] rounded-full" style={conTono("var(--paso)")} />
            {aviso.texto}
          </p>
        ) : (
          <Aviso>{aviso.texto}</Aviso>
        ))}
    </section>
  );
}
