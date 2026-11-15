import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Casilla } from "./Casilla";
import { conTono } from "./Pagina";

// Adentro de la tarjeta (16) el campo va un escalón más chico (12): los radios se anidan.
const CAMPO = "bg-secondary placeholder:text-muted-foreground w-full rounded-xl px-3 text-[13px]";
type RutinaNueva = { cuando: { tipo: "diario"; hora: string } | { tipo: "cada"; minutos: number } | { tipo: "evento" }; tarea: string; latido?: boolean; modelo?: string; vueltas?: number; habilidades?: string[]; chequeo?: string; confiar?: boolean };

export function NuevaRutina({ botId, alAgregar }: { botId: string; alAgregar: (r: RutinaNueva) => Promise<unknown> }) {
  const [tipo, setTipo] = useState<"diario" | "cada" | "evento">("diario");
  const [hora, setHora] = useState("08:00");
  const [minutos, setMinutos] = useState(30);
  const [tarea, setTarea] = useState("");
  const [latido, setLatido] = useState(false);
  const [modelo, setModelo] = useState("");
  const [vueltas, setVueltas] = useState("");
  const [habilidades, setHabilidades] = useState("");
  const [chequeo, setChequeo] = useState("");
  const [confiar, setConfiar] = useState(false);
  const [secreto, setSecreto] = useState<string | null>(null);
  return (
    <form className="bg-background mt-4 flex flex-col gap-3 rounded-2xl p-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!tarea.trim()) return;
      const respuesta = await alAgregar({ cuando: tipo === "diario" ? { tipo, hora } : tipo === "cada" ? { tipo, minutos } : { tipo }, tarea: tarea.trim(), ...(latido ? { latido } : {}), ...(modelo.trim() ? { modelo: modelo.trim() } : {}), ...(vueltas ? { vueltas: Math.max(1, Number(vueltas)) } : {}), ...(habilidades.trim() ? { habilidades: habilidades.split(",").map((x) => x.trim()).filter(Boolean) } : {}), ...(chequeo.trim() ? { chequeo: chequeo.trim() } : {}), ...(tipo === "evento" && confiar ? { confiar: true } : {}) });
      const dato = respuesta as { rutina?: { secreto?: string; id: string } };
      if (dato.rutina?.secreto) setSecreto(`http://127.0.0.1:4890/evento/${botId}/${dato.rutina.id}\nSecreto (guardalo ahora): ${dato.rutina.secreto}`);
      setTarea("");
    }}>
      <h3 className="titulo-seccion">Nueva rutina</h3>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <select aria-label="Cuándo" className={cn(CAMPO, "h-10 w-auto")} value={tipo} onChange={(e) => setTipo(e.target.value as "diario" | "cada")}>
          <option value="diario">todos los días a las</option><option value="cada">cada</option><option value="evento">cuando llega un evento</option>
        </select>
        {tipo === "diario" ? <input aria-label="Hora" type="time" className={cn(CAMPO, "h-10 w-auto")} value={hora} onChange={(e) => setHora(e.target.value)} /> : tipo === "cada" ? <><input aria-label="Minutos" type="number" min={5} step={5} className={cn(CAMPO, "h-10 w-24")} value={minutos} onChange={(e) => setMinutos(Math.max(5, Number(e.target.value) || 5))} /><span>minutos</span></> : <span className="text-muted-foreground">POST con firma HMAC</span>}
      </div>
      <input aria-label="Qué hace" className={cn(CAMPO, "h-10")} value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="qué tiene que hacer" />
      <div className="grid grid-cols-2 gap-2"><input aria-label="Modelo" className={cn(CAMPO, "h-10")} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="modelo opcional" /><input aria-label="Vueltas" type="number" min={1} className={cn(CAMPO, "h-10")} value={vueltas} onChange={(e) => setVueltas(e.target.value)} placeholder="vueltas" /></div>
      <input aria-label="Habilidades" className={cn(CAMPO, "h-10")} value={habilidades} onChange={(e) => setHabilidades(e.target.value)} placeholder="habilidades, separadas por coma" />
      <textarea aria-label="Chequeo" className={cn(CAMPO, "min-h-16 py-2")} value={chequeo} onChange={(e) => setChequeo(e.target.value)} placeholder="chequeo opcional; Vigía usa «vigia»" />
      {tipo === "evento" && <Casilla marcada={confiar} alCambiar={setConfiar} className="text-[13px]">Confiar en los datos del evento (puede escribir)</Casilla>}
      {tipo !== "evento" && <Casilla marcada={latido} alCambiar={setLatido} className="text-[13px]">Latido: solo te escribe si encontró algo</Casilla>}
      <Button type="submit" size="lg" className="self-start" disabled={!tarea.trim()}>Agregar</Button>
      {/* Te espera a vos (guardarlo ahora): el color de «para revisar». */}
      {secreto && <p className="con-tono whitespace-pre-wrap break-all rounded-xl p-3 font-mono text-[12px]" style={conTono("var(--revisar)")}>{secreto}</p>}
    </form>
  );
}
