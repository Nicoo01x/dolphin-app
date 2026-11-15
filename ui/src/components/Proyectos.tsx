import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus } from "lucide-react";
import { irAlProyecto, mandarProyecto, proyectoActivo, traerProyectos, type ProyectoListado } from "@/lib/api";
import { cuandoFue, tituloDeTarea } from "@/lib/datos";
import { cn } from "@/lib/utils";
import { Visor } from "./Visor";

/**
 * Los proyectos, como en DOLPHIN: donde estaba el nombre de la carpeta va el
 * proyecto que estás mirando, con su logo, y un menú para pasar a otro o
 * sumar uno nuevo (una carpeta de la máquina o un repo para clonar). Cada
 * proyecto trae su memoria, su perfil y sus cosechas: cambiar de proyecto es
 * cambiar de todo eso, sin reiniciar nada.
 *
 * Si el servidor trabaja con un solo repo, queda el nombre de la carpeta.
 */
export function SelectorDeProyecto({ repo }: { repo: string }) {
  const [lista, setLista] = useState<{ delArranque: string; proyectos: ProyectoListado[] } | null | "uno">(null);
  const [abierto, setAbierto] = useState(false);
  const [sumando, setSumando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traerProyectos().then(
      (r) => setLista(r.solo || !r.delArranque ? "uno" : { delArranque: r.delArranque, proyectos: r.proyectos }),
      () => setLista("uno"),
    );
  }, []);

  // El menú se cierra con Escape o tocando afuera, y el foco vuelve al botón.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(menu.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const siguiente = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[siguiente]?.focus();
      }
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    menu.current?.querySelector<HTMLElement>("[aria-checked='true'], [data-item]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const carpeta = repo.split(/[\\/]/).filter(Boolean).pop() ?? repo;

  // Un solo repo (o todavía cargando): el nombre de la carpeta, como siempre.
  if (lista === null || lista === "uno") {
    return (
      // En el teléfono también: sin esto no se sabía en qué repo estabas.
      <p className="text-muted-foreground min-w-0 flex-1 truncate text-left text-xs" title={repo}>
        {carpeta}
      </p>
    );
  }

  const activo = lista.proyectos.find((p) => p.id === (proyectoActivo() ?? lista.delArranque));
  const nombre = activo?.nombre ?? carpeta;

  return (
    // En el teléfono no se achica: se achica la navegación, que ya scrollea.
    <div className="relative min-w-0 flex-1 max-[640px]:flex-none">
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={activo?.ruta ?? repo}
        onClick={() => setAbierto((x) => !x)}
        className="hover:bg-secondary inline-flex h-9 max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition-colors"
      >
        <Logo proyecto={activo} nombre={nombre} />
        <span className="truncate max-[640px]:sr-only">{nombre}</span>
        <ChevronDown aria-hidden="true" className={cn("text-muted-foreground size-3.5 flex-none transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div
          ref={menu}
          role="menu"
          aria-label="Proyectos"
          // En el teléfono baja fijo, a todo el ancho, debajo de la barra: anclado al botón se salía de la pantalla.
          className="vidrio absolute top-full left-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl p-1.5 max-[640px]:fixed max-[640px]:inset-x-3 max-[640px]:top-[64px] max-[640px]:mt-0 max-[640px]:w-auto max-[640px]:max-w-none"
        >
          <p className="text-muted-foreground px-2.5 pt-1.5 pb-1 text-[12px] font-medium">Proyectos</p>
          {lista.proyectos.map((p) => {
            const es = p.id === activo?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={es}
                data-item
                onClick={() => (es ? setAbierto(false) : irAlProyecto(p.id, lista.delArranque))}
                className="hover:bg-secondary focus-visible:bg-secondary flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none"
              >
                <Logo proyecto={p} nombre={p.nombre} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" title={p.nombre}>
                    {p.nombre}
                  </span>
                  {/* La ruta entera, solo en el hover: a la vista va el nombre y qué pasó último. */}
                  <span className="text-muted-foreground block truncate text-[12px]" title={p.ruta}>
                    {p.ultima ? `${cuandoFue(p.ultima.cuando)} · ${tituloDeTarea(p.ultima.tarea)}` : "sin siembras todavía"}
                  </span>
                </span>
                {es && <Check aria-hidden="true" className="size-4 flex-none" />}
              </button>
            );
          })}
          <div className="mt-1.5">
            <button
              type="button"
              role="menuitem"
              data-item
              onClick={() => {
                setAbierto(false);
                setSumando(true);
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:bg-secondary flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium outline-none"
            >
              <FolderPlus aria-hidden="true" className="size-4 flex-none" />
              Sumar un proyecto
            </button>
          </div>
        </div>
      )}

      {sumando && <SumarProyecto quienAbrio={boton.current} delArranque={lista.delArranque} alCerrar={() => setSumando(false)} />}
    </div>
  );
}

/** El logo del repo; si no tiene, la inicial: nunca un ícono genérico de carpeta. */
function Logo({ proyecto, nombre }: { proyecto: ProyectoListado | undefined; nombre: string }) {
  if (proyecto?.logo) return <img src={proyecto.logo} alt="" className="size-[18px] flex-none rounded-[5px] object-contain" />;
  return (
    <span aria-hidden="true" className="bg-secondary text-foreground/80 flex size-[18px] flex-none items-center justify-center rounded-[5px] text-[10px] font-bold uppercase">
      {nombre.trim().charAt(0) || "·"}
    </span>
  );
}

/**
 * Sumar un proyecto: una carpeta de esta máquina o un repo para clonar. Es
 * una ventana, así que va con la física de /nico-mockup (la del Visor): se
 * cierra arrastrándola.
 */
function SumarProyecto({ quienAbrio, delArranque, alCerrar }: { quienAbrio: HTMLElement | null; delArranque: string; alCerrar: () => void }) {
  const [modo, setModo] = useState<"carpeta" | "url">("carpeta");
  const [ruta, setRuta] = useState("");
  const [url, setUrl] = useState("");
  const [donde, setDonde] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = modo === "carpeta" ? ruta.trim() !== "" : url.trim() !== "";
  const hacer = async () => {
    if (!listo || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const proyecto = await mandarProyecto(
        modo === "carpeta" ? { accion: "sumar", ruta: ruta.trim() } : { accion: "clonar", url: url.trim(), ...(donde.trim() ? { donde: donde.trim() } : {}) },
      );
      if (proyecto) irAlProyecto(proyecto.id, delArranque);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOcupado(false);
    }
  };

  const campo = "bg-secondary placeholder:text-muted-foreground h-10 w-full rounded-xl px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/50";

  return (
    <Visor quienAbrio={quienAbrio} titulo="Sumar un proyecto" sub="Su memoria, su perfil y sus cosechas viajan con él" onCerrado={alCerrar} ancho={520} variante="formulario">
      <div role="group" aria-label="De dónde" className="bg-secondary inline-flex rounded-full p-0.5">
        {(
          [
            ["carpeta", "Una carpeta de esta máquina"],
            ["url", "Clonar de una URL"],
          ] as const
        ).map(([clave, rotulo]) => (
          <button
            key={clave}
            type="button"
            aria-pressed={modo === clave}
            onClick={() => setModo(clave)}
            className={cn(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
              modo === clave ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void hacer();
        }}
      >
        {modo === "carpeta" ? (
          <label className="block">
            <span className="text-[13px] font-medium">La carpeta del repo</span>
            <input name="ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="D:/Proyectos/mi-app" autoFocus className={cn(campo, "mt-1.5 font-mono text-[13px]")} />
            <span className="text-muted-foreground mt-1 block text-[12px]">Tiene que ser un repo de git con al menos un commit.</span>
          </label>
        ) : (
          <>
            <label className="block">
              <span className="text-[13px] font-medium">La URL del repo</span>
              <input name="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="git@github.com:usuario/repo.git" autoFocus className={cn(campo, "mt-1.5 font-mono text-[13px]")} />
            </label>
            <label className="block">
              <span className="text-muted-foreground text-[13px]">Dónde clonarlo (opcional)</span>
              <input name="donde" value={donde} onChange={(e) => setDonde(e.target.value)} placeholder="al lado del proyecto de ahora" className={cn(campo, "mt-1.5 font-mono text-[13px]")} />
            </label>
          </>
        )}

        {error && (
          <p role="alert" className="text-murio text-[13px]">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!listo || ocupado}
            className="presionable bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold disabled:cursor-default disabled:opacity-30"
          >
            {ocupado ? (modo === "url" ? "Clonando…" : "Sumando…") : modo === "url" ? "Clonar y sumar" : "Sumar"}
          </button>
        </div>
      </form>
    </Visor>
  );
}
