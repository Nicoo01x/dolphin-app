import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Brain, Check, ChevronRight, MessageSquareText, Pencil, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Aviso, Cabecera, Pagina, Seccion } from "./Pagina";
import {
  entrenarAlDelfin,
  olvidarAprendido,
  mandarMemoria,
  traerEntrenamiento,
  traerMemoria,
  type Entrenamiento,
  type NotaEnObservacion,
  type Origen,
  type Recuerdo,
} from "@/lib/api";
import { Fila as FuenteAprendida, Verdad } from "./Entrenando";
import { cuandoFue } from "@/lib/datos";
import { cn } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Leible } from "./Leible";

/**
 * Dolphin Memory: lo que el repo ya te corrigió una vez, no se repite.
 *
 * Dos capas, como OpenClaw. Lo que corregís vos entra de una: con patrón es
 * un verificador más del portón (frena sola); sin patrón, va en el pedido de
 * cada agente. Lo que Dolphin ve en cada trabajo queda EN OBSERVACIÓN, y el
 * sueño lo pasa a la memoria recién cuando se repite en tareas distintas
 * (ver src/nucleo/sueno.ts). Lo que viene de afuera espera tu visto bueno.
 *
 * El orden es el de lo que pide algo: primero lo que espera tu visto bueno,
 * después lo que ya sabe (con el campo para enseñarle), lo que está mirando
 * y, plegado, el perfil.
 */

const DE_DONDE: Readonly<Record<Origen, string>> = {
  owner: "lo dijiste vos",
  sistema: "lo midió el portón",
  agente: "lo anotó un agente",
  sesion: "salió de una sesión",
  untrusted: "vino de afuera",
};

/** Un campo de texto tonal. El anillo de foco es el de toda la consola (app.css). */
const CAMPO = "bg-secondary placeholder:text-muted-foreground w-full rounded-2xl px-3";

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Memoria() {
  const [recuerdos, setRecuerdos] = useState<Recuerdo[] | null>(null);
  const [enObservacion, setEnObservacion] = useState<NotaEnObservacion[]>([]);
  const [esperando, setEsperando] = useState<NotaEnObservacion[]>([]);
  const [suenos, setSuenos] = useState<string[]>([]);
  const [minTareas, setMinTareas] = useState(3);
  const [todasLasNotas, setTodasLasNotas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Un error de una fila va al lado de esa fila, no arriba de todo. */
  const [errorDeFila, setErrorDeFila] = useState<{ id: string; texto: string } | null>(null);
  /** La fila que tiene un pedido en vuelo: sus botones no se pueden tocar dos veces. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dicho, setDicho] = useState("");
  const [patron, setPatron] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [porOlvidar, setPorOlvidar] = useState<string | null>(null);
  const [perfil, setPerfil] = useState("");
  const [perfilGuardado, setPerfilGuardado] = useState("");
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [revisado, setRevisado] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroMemoria>("todas");
  const [editando, setEditando] = useState<{ id: string; dicho: string; candidato: boolean } | null>(null);
  const [entrenamiento, setEntrenamiento] = useState<Entrenamiento | null>(null);
  const [entrenando, setEntrenando] = useState(false);
  const tachos = useRef(new Map<string, HTMLButtonElement>());

  const candidatas = recuerdos?.filter((r) => r.candidato) ?? [];
  const memoriasVisibles = (recuerdos ?? []).filter((r) => !r.candidato && pasaElFiltro(r, filtro));

  const cargar = useCallback(async () => {
    try {
      const memoria = await traerMemoria();
      setRecuerdos([...memoria.recuerdos].reverse());
      setPerfil(memoria.perfil ?? "");
      setPerfilGuardado(memoria.perfil ?? "");
      setEnObservacion(memoria.enObservacion ?? []);
      setEsperando(memoria.esperando ?? []);
      setSuenos(memoria.suenos ?? []);
      // Lo que trajo de otros modelos: si el servidor no lo sabe, la sección no aparece.
      setEntrenamiento((await traerEntrenamiento().catch(() => null))?.entrenamiento ?? null);
      if (memoria.umbrales) setMinTareas(memoria.umbrales.minTareas);
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Una acción sobre una fila: una sola a la vez, y si falla lo dice al lado. */
  const enFila = async (id: string, accion: Parameters<typeof mandarMemoria>[0]) => {
    if (ocupado) return;
    setOcupado(id);
    setErrorDeFila(null);
    try {
      await mandarMemoria(accion);
      await cargar();
    } catch (e) {
      setErrorDeFila({ id, texto: mensajeDe(e) });
    } finally {
      setOcupado(null);
    }
  };

  const guardarElPerfil = async () => {
    if (guardandoPerfil || perfil === perfilGuardado) return;
    setGuardandoPerfil(true);
    try {
      await mandarMemoria({ accion: "perfil", perfil });
      setPerfilGuardado(perfil);
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const crear = async () => {
    if (dicho.trim() === "" || guardando) return;
    setGuardando(true);
    try {
      await mandarMemoria({ accion: "crear", dicho: dicho.trim(), ...(patron.trim() ? { patron: patron.trim() } : {}) });
      setDicho("");
      setPatron("");
      // El campo del patrón se va con el texto: si el foco estaba ahí, vuelve al de la corrección.
      document.getElementById("memoria-dicho")?.focus();
      await cargar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  const revisar = async () => {
    if (revisando) return;
    setRevisando(true);
    setRevisado(null);
    try {
      const r = await mandarMemoria({ accion: "sonar" });
      const partes = [
        `entraron ${r.promovidas ?? 0}`,
        ...(r.esperando ? [`${r.esperando} esperan tu visto bueno`] : []),
        ...(r.olvidadas ? [`se olvidaron ${r.olvidadas}`] : []),
      ];
      setRevisado(`Listo: ${partes.join(" · ")}.`);
      await cargar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setRevisando(false);
    }
  };

  const editarYGuardar = async (r: Recuerdo) => {
    if (!editando || editando.dicho.trim() === "") return;
    await enFila(r.id, { accion: editando.candidato ? "aprobar-candidato" : "editar", id: r.id, dicho: editando.dicho.trim() });
    setEditando(null);
  };

  const errorDe = (id: string) =>
    errorDeFila?.id === id && <Aviso className="mt-2">{errorDeFila.texto}</Aviso>;

  return (
    <Pagina>
      {/* El mismo ancho que la Bandeja y En vivo: a 880 px, en una pantalla ancha la vista quedaba
          cortada al medio con medio monitor en negro (Nico, 31/10). El texto largo de cada recuerdo
          igual se lee: lo limita su propia caja, no la vista entera. */}
      <div className="w-full max-w-[1760px]">
        <Cabecera titulo="Memoria" className="items-end gap-y-4">
          {recuerdos !== null && <Resumen recuerdos={recuerdos} porAprobar={candidatas.length + esperando.length} />}
        </Cabecera>

        {/* El buscador: en todo lo que sabe, sin que importen tildes ni mayúsculas. */}
        <div className="relative mt-5">
          <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
          <input
            type="search"
            name="buscar"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Escape" && setBusqueda("")}
            placeholder="Buscar en todo lo que sabe: «coma decimal», «deploy», «ramas»…"
            aria-label="Buscar en la memoria"
            className={cn(CAMPO, "h-11 rounded-2xl pl-10 text-sm")}
          />
        </div>

        {busqueda.trim() !== "" && (
          <section aria-label="Resultados de la búsqueda" aria-live="polite" className="mt-4">
            {(() => {
              const encontrados = buscarEnLaMemoria(busqueda, {
                aprendido: entrenamiento?.aprendido ?? [],
                recuerdos: recuerdos ?? [],
                enObservacion,
                esperando,
                perfil: perfilGuardado,
              });
              if (encontrados.length === 0) {
                return (
                  <p className="text-muted-foreground px-1 text-[13px]">No sabe nada de «{busqueda.trim()}».</p>
                );
              }
              return (
                <>
                  <p className="text-muted-foreground px-1 text-xs">
                    {encontrados.length} {encontrados.length === 1 ? "cosa" : "cosas"} · Escape para volver
                  </p>
                  <ul className="bg-card mt-2 space-y-0.5 rounded-3xl p-2">
                    {encontrados.map((e, i) => (
                      <li key={`${e.donde}|${i}`} className="rounded-2xl px-4 py-2.5">
                        <p className="text-[13px] leading-snug">
                          <Marcado texto={e.texto} busqueda={busqueda} />
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[12px]">
                          {e.donde}
                          {e.detalle ? ` · ${e.detalle}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </section>
        )}

        {busqueda.trim() === "" && (
        <>

        {error && (
          <Aviso className="mt-4" alReintentar={recuerdos === null ? () => void cargar() : undefined}>
            {error}
          </Aviso>
        )}

        {/* Solo los filtros que tienen algo: un chip que siempre da cero es ruido. */}
        <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Filtrar memorias">
          {FILTROS.map((opcion) => {
            // Las candidatas no cuentan: tienen su sección, «Para aprobar», arriba de los filtros.
            const cuantas = (recuerdos ?? []).filter((r) => !r.candidato && pasaElFiltro(r, opcion.id)).length;
            if (opcion.id !== "todas" && cuantas === 0 && filtro !== opcion.id) return null;
            return (
              <button
                key={opcion.id}
                type="button"
                aria-pressed={filtro === opcion.id}
                onClick={() => setFiltro(opcion.id)}
                className={cn(
                  "presionable h-8 cursor-pointer rounded-full px-3.5 text-xs font-medium transition-colors",
                  filtro === opcion.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {opcion.nombre} <span className="tabular-nums opacity-60">{cuantas}</span>
              </button>
            );
          })}
        </div>

        {candidatas.length > 0 && (
          <Seccion titulo="Para aprobar" extra={candidatas.length} className="mt-8">
            <ul className="bg-card space-y-0.5 rounded-3xl p-2">
              {candidatas.map((r) => (
                <li key={r.id} className="hover:bg-secondary/50 rounded-2xl px-4 py-3 transition-colors">
                  {editando?.id === r.id ? (
                    <EditorDeMemoria editando={editando} setEditando={setEditando} guardar={() => void editarYGuardar(r)} cancelar={() => setEditando(null)} />
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                      {/* La caja usa el ancho de la vista; el texto corta antes, en la medida en que se lee. */}
                      <div className="min-w-0 flex-1 [&_p]:max-w-[95ch]">
                        <p className="text-sm font-medium break-words">{r.dicho}</p>
                        {/* El porqué dice más que el origen; sin porqué, de dónde vino. */}
                        <p className="text-muted-foreground mt-0.5 text-xs break-words">{r.porQue ?? DE_DONDE[r.origen ?? "sesion"]}</p>
                        {/* Lo que más importa ver antes de aprobar: si dice lo contrario de algo que ya sabe. */}
                        {r.conflictoCon && (
                          <p className="text-murio mt-2 text-xs break-words">
                            Choca con lo que ya sabe: «{recuerdos?.find((otro) => otro.id === r.conflictoCon)?.dicho ?? "una memoria que ya no está"}». Si la aprobás, conviene apagar o editar esa.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-none items-center gap-0.5">
                        <Button variant="secondary" size="sm" disabled={ocupado !== null} onClick={() => void enFila(r.id, { accion: "aprobar-candidato", id: r.id })} className="mr-1">
                          <Check aria-hidden="true" /> Aprobar
                        </Button>
                        <Button variant="ghost" size="icon" disabled={ocupado !== null} aria-label={`Editar y aprobar «${r.dicho}»`} title="Editar y aprobar" onClick={() => setEditando({ id: r.id, dicho: r.dicho, candidato: true })}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={ocupado !== null} aria-label={`Descartar «${r.dicho}»`} title="Descartar" onClick={() => void enFila(r.id, { accion: "descartar-candidato", id: r.id })}>
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {errorDe(r.id)}
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {esperando.length > 0 && (
          <Seccion titulo="Espera tu visto bueno" extra={esperando.length} className="mt-8">
            <ul className="bg-card space-y-0.5 rounded-3xl p-2">
              {esperando.map((n) => (
                <li key={n.id} className="hover:bg-secondary/50 rounded-2xl px-4 py-3 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1 [&_p]:max-w-[95ch]">
                      <p className="text-sm font-medium break-words"><Leible texto={n.texto} /></p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {DE_DONDE[n.origen]} · {n.vistas} {n.vistas === 1 ? "vez" : "veces"} en {n.tareas} tareas
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" disabled={ocupado !== null} onClick={() => void enFila(n.id, { accion: "aprobar-nota", id: n.id })} className="mr-1">
                      <Check aria-hidden="true" /> Aprobar
                    </Button>
                    <Button variant="ghost" size="icon" disabled={ocupado !== null} aria-label={`Descartar «${n.texto}»`} title="Descartar" onClick={() => void enFila(n.id, { accion: "descartar-nota", id: n.id })}>
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                  {errorDe(n.id)}
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        <Seccion titulo="Lo que ya sabe" extra={recuerdos !== null ? memoriasVisibles.length : undefined} className="mt-10">
          <div className="bg-card rounded-3xl p-2">
            {/* Enseñarle algo: una línea; el patrón aparece recién cuando hay algo que enseñar. */}
            <div className="bg-secondary/60 rounded-2xl p-1.5">
              <div className="flex items-center gap-2">
                <Plus aria-hidden="true" className="text-muted-foreground ml-2.5 size-4 flex-none" />
                <input
                  id="memoria-dicho"
                  value={dicho}
                  onChange={(ev) => setDicho(ev.target.value)}
                  onKeyDown={(ev) => ev.key === "Enter" && void crear()}
                  maxLength={300}
                  aria-label="La corrección, tal como se la dirías a una persona"
                  placeholder="Enseñale algo: «los importes van con coma decimal, nunca con punto»"
                  className="placeholder:text-muted-foreground h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                <Button onClick={() => void crear()} disabled={dicho.trim() === "" || guardando}>
                  {guardando ? "Aprendiendo…" : "Aprender"}
                </Button>
              </div>
              {dicho.trim() !== "" && (
                <div className="flex items-center gap-2 pt-1 pb-0.5">
                  <ShieldCheck aria-hidden="true" className="text-muted-foreground ml-2.5 size-4 flex-none" />
                  <input
                    id="memoria-patron"
                    value={patron}
                    onChange={(ev) => setPatron(ev.target.value)}
                    onKeyDown={(ev) => ev.key === "Enter" && void crear()}
                    maxLength={200}
                    aria-label="Texto que no puede aparecer en el código nuevo (opcional, expresión regular)"
                    placeholder={"Que frene sola si el código nuevo tiene esto (opcional): toLocaleString\\('en"}
                    className="placeholder:text-muted-foreground h-8 min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none"
                  />
                </div>
              )}
            </div>

            {recuerdos === null ? (
              error ? null : (
                <ul aria-busy="true" aria-label="Leyendo la memoria" className="mt-1 space-y-0.5">
                  {Array.from({ length: 3 }, (_, i) => (
                    <li key={i} className="flex items-center gap-4 rounded-2xl px-3 py-3">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/5" />
                        <Skeleton className="h-3 w-2/5" />
                      </div>
                      <Skeleton className="h-5 w-9 rounded-full" />
                    </li>
                  ))}
                </ul>
              )
            ) : memoriasVisibles.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Brain aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{filtro === "todas" ? "Todavía no aprendió nada" : "Nada con este filtro"}</EmptyTitle>
                  {filtro !== "todas" && <EmptyDescription>Probá con Todas.</EmptyDescription>}
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {memoriasVisibles.map((r) => (
                  <li
                    key={r.id}
                    className={cn("group hover:bg-secondary/50 rounded-2xl px-3 py-2.5 transition-colors", !r.activo && "opacity-55")}
                  >
                    <div className="flex items-center gap-3">
                      {/* Qué hace la regla, de un vistazo: frena sola (con patrón) o va en el pedido. */}
                      {r.patron ? (
                        <ShieldCheck aria-label="Frena sola" className="text-foreground size-4 flex-none" />
                      ) : (
                        <MessageSquareText aria-label="Va en el pedido" className="text-muted-foreground size-4 flex-none" />
                      )}
                      <div className="min-w-0 flex-1">
                        {editando?.id === r.id ? (
                          <EditorDeMemoria editando={editando} setEditando={setEditando} guardar={() => void editarYGuardar(r)} cancelar={() => setEditando(null)} />
                        ) : <p className="text-sm font-medium break-words">{r.dicho}</p>}
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {r.patron ? (
                            <>
                              frena sola · <code className="text-foreground/80 font-mono text-[12px]">/{r.patron}/</code>
                            </>
                          ) : (
                            "va en el pedido de cada agente"
                          )}
                          <span className="mx-1.5">·</span>
                          {r.sinUso ? (
                            <span className="text-corriendo">sin uso en 30 días</span>
                          ) : (
                            <span className="tabular-nums">
                              {r.usos ?? 0} {(r.usos ?? 0) === 1 ? "uso" : "usos"}
                              {r.ultimoUso ? `, el último ${cuandoFue(r.ultimoUso)}` : ""}
                            </span>
                          )}
                          {/* El origen solo si no fuiste vos (sin origen, las reglas son tuyas). */}
                          {r.origen && r.origen !== "owner" && (
                            <>
                              <span className="mx-1.5">·</span>
                              {DE_DONDE[r.origen]}
                            </>
                          )}
                          {r.conflictoCon && (
                            <>
                              <span className="mx-1.5">·</span>
                              <span className="text-murio">en conflicto</span>
                            </>
                          )}
                        </p>
                        {/* Por qué entró, si no lo dijiste vos: lo mismo que cuenta DREAMS.md. */}
                        {r.porQue && r.origen !== "owner" && <p className="text-muted-foreground mt-1 text-[12px] break-words"><Leible texto={r.porQue} /></p>}
                      </div>
                      {/* Editar y olvidar aparecen al pasar o con el teclado; el interruptor, siempre. Con el
                          dedo no hay «pasar»: ahí se ven siempre. */}
                      <div
                        className={cn(
                          "flex items-center gap-0.5 transition-opacity",
                          porOlvidar === r.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
                        )}
                      >
                        {!editando || editando.id !== r.id ? (
                          <Button variant="ghost" size="icon" aria-label={`Editar «${r.dicho}»`} onClick={() => setEditando({ id: r.id, dicho: r.dicho, candidato: false })}>
                            <Pencil aria-hidden="true" />
                          </Button>
                        ) : null}
                        {porOlvidar === r.id ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            // El foco pasa a la confirmación: Escape o salir de ella la desarma.
                            autoFocus
                            disabled={ocupado !== null}
                            onClick={async () => {
                              await enFila(r.id, { accion: "olvidar", id: r.id });
                              setPorOlvidar(null);
                            }}
                            onBlur={() => setPorOlvidar(null)}
                            onKeyDown={(ev) => {
                              if (ev.key !== "Escape") return;
                              setPorOlvidar(null);
                              requestAnimationFrame(() => tachos.current.get(r.id)?.focus());
                            }}
                          >
                            ¿Seguro? Olvidar
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            ref={(el: HTMLButtonElement | null) => {
                              if (el) tachos.current.set(r.id, el);
                              else tachos.current.delete(r.id);
                            }}
                            aria-label={`Olvidar «${r.dicho}»`}
                            onClick={() => setPorOlvidar(r.id)}
                            className="hover:text-murio"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      <Switch
                        checked={r.activo}
                        disabled={ocupado !== null}
                        aria-label={r.activo ? `Apagar «${r.dicho}»` : `Prender «${r.dicho}»`}
                        onCheckedChange={(activo) => void enFila(r.id, { accion: activo ? "prender" : "apagar", id: r.id })}
                      />
                    </div>
                    {errorDe(r.id)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Seccion>

        <section aria-labelledby="memoria-observacion" className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 id="memoria-observacion" className="titulo-seccion flex items-baseline gap-2 whitespace-nowrap">
              En observación <span className="text-muted-foreground font-sans text-[13px] font-normal tabular-nums">{enObservacion.length}</span>
            </h2>
            <Button variant="secondary" disabled={revisando} onClick={() => void revisar()}>
              {revisando ? "Revisando…" : "Revisar ahora"}
            </Button>
          </div>
          <p role="status" className="text-muted-foreground mt-1 text-xs">
            {revisado}
          </p>
          {enObservacion.length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {(todasLasNotas ? enObservacion : enObservacion.slice(0, 6)).map((n) => (
                  <li key={n.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 text-[13px]">
                    <Leible texto={n.texto} className="min-w-0 flex-1 break-words" />
                    {/* La misma frase puede estar dos veces: una de un agente y otra de afuera no se mezclan. */}
                    <span className="text-muted-foreground flex flex-none items-center gap-2 text-[12px]">
                      {n.faltan > 0 ? <Avance tareas={n.tareas} de={minTareas} /> : "lista para entrar"}
                      <span aria-hidden="true">·</span>
                      {DE_DONDE[n.origen]}
                    </span>
                  </li>
                ))}
              </ul>
              {enObservacion.length > 6 && (
                <Button variant="ghost" size="sm" onClick={() => setTodasLasNotas((x) => !x)} className="mt-1">
                  {todasLasNotas ? "Ver menos" : `Ver las ${enObservacion.length}`}
                </Button>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="memoria-otros" className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 id="memoria-otros" className="titulo-seccion flex items-baseline gap-2 whitespace-nowrap">
              De otros modelos
              {entrenamiento?.aprendido && (
                <span className="text-muted-foreground font-sans text-[13px] font-normal tabular-nums">{entrenamiento.aprendido.length}</span>
              )}
            </h2>
            <Button
              variant="secondary"
              disabled={entrenando}
              onClick={async () => {
                setEntrenando(true);
                try {
                  setEntrenamiento((await entrenarAlDelfin()).entrenamiento);
                } catch (e) {
                  setError(mensajeDe(e));
                } finally {
                  setEntrenando(false);
                }
              }}
              // Buscar es gratis; esto además destila con Claude, y eso usa el cupo: el botón lo dice.
              title="Usa tu cupo de Claude (medio minuto, más o menos)"
            >
              {entrenando
                ? "Destilando… (medio minuto)"
                : entrenamiento?.aprendido
                  ? "Volver a destilar con Claude"
                  : "Destilar con Claude"}
            </Button>
          </div>
          {entrenamiento?.aprendido && entrenamiento.aprendido.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {entrenamiento.aprendido.map((a) => (
                <Verdad
                  key={a.texto}
                  aprendido={a}
                  alTachar={async () => {
                    try {
                      const { entrenamiento: nuevo } = await olvidarAprendido(a.texto);
                      if (nuevo) setEntrenamiento(nuevo);
                    } catch (e) {
                      setError(mensajeDe(e));
                    }
                  }}
                />
              ))}
            </ul>
          ) : (
            // Lo único que vale decir sin destilar: que buscó y no hay nada de dónde sacar.
            entrenamiento &&
            entrenamiento.fuentes.length === 0 && (
              <p className="text-muted-foreground mt-2 text-[13px]">No encontró nada que otros modelos hayan aprendido de este proyecto.</p>
            )
          )}
          {entrenamiento && entrenamiento.fuentes.length > 0 && (
            <details className="group/fuentes mt-3">
              <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer list-none items-center gap-1 rounded-xl px-1 text-xs font-medium">
                <ChevronRight aria-hidden="true" className="size-3.5 transition-transform group-open/fuentes:rotate-90" />
                De dónde lo sacó · {entrenamiento.fuentes.length} {entrenamiento.fuentes.length === 1 ? "fuente" : "fuentes"}
              </summary>
              <ul className="mt-2 space-y-1">
                {entrenamiento.fuentes.map((f) => (
                  <FuenteAprendida key={`${f.herramienta}|${f.ruta}|${f.nombre}`} fuente={f} className="hover:bg-card transition-colors" />
                ))}
              </ul>
            </details>
          )}
        </section>

        <details open={perfilGuardado === ""} className="group mt-10">
          <summary className="titulo-seccion flex cursor-pointer list-none items-center gap-1.5 rounded-xl">
            <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
            El perfil del proyecto
            <span className="text-muted-foreground ml-1 font-sans text-xs font-normal">las verdades del dominio, en todos los prompts</span>
          </summary>
          <div className="bg-card mt-3 rounded-3xl p-3">
            <textarea
              value={perfil}
              onChange={(ev) => setPerfil(ev.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={
                "- Hay clientes particulares Y empresas: todo lo nuevo cubre a los dos.\n- Los importes van con coma decimal: $ 1.234,56."
              }
              name="perfil"
              aria-label="El perfil del proyecto"
              className={cn(CAMPO, "resize-y py-2.5 text-[13px] leading-relaxed")}
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              {perfil !== perfilGuardado && <span className="text-muted-foreground text-xs">hay cambios sin guardar</span>}
              <Button variant="secondary" onClick={() => void guardarElPerfil()} disabled={perfil === perfilGuardado || guardandoPerfil}>
                {guardandoPerfil ? "Guardando…" : "Guardar el perfil"}
              </Button>
            </div>
          </div>
        </details>

        {suenos.length > 0 && (
          <Seccion titulo="Por qué entró cada cosa" className="mt-10">
            <ol className="mt-0.5 space-y-4">
              {suenos.map((s, i) => (
                <li key={i} className="text-[13px] leading-relaxed">
                  <Sueno texto={s} />
                </li>
              ))}
            </ol>
          </Seccion>
        )}
        </>
        )}
      </div>
    </Pagina>
  );
}

/**
 * Lo que sabe, de un vistazo: cuántas reglas frenan solas, cuántas van en el pedido y cuántas
 * esperan tu visto bueno. Números grandes y una barra con la proporción, en blanco y gris.
 */
function Resumen({ recuerdos, porAprobar }: { recuerdos: readonly Recuerdo[]; porAprobar: number }) {
  const activas = recuerdos.filter((r) => !r.candidato && r.activo);
  const frenan = activas.filter((r) => r.patron).length;
  const enPedido = activas.length - frenan;
  if (activas.length === 0 && porAprobar === 0) return null;
  const cifra = (n: number, que: string, tenue = false) => (
    <div>
      <p className={cn("font-display text-[22px] leading-none font-semibold tabular-nums", tenue && "text-muted-foreground")}>{n}</p>
      <p className="text-muted-foreground mt-1.5 text-xs">{que}</p>
    </div>
  );
  return (
    <div className="min-w-[280px]">
      <div className="flex gap-8">
        {cifra(frenan, "frenan solas")}
        {cifra(enPedido, "van en el pedido", true)}
        {porAprobar > 0 && cifra(porAprobar, "por aprobar")}
      </div>
      {activas.length > 0 && (
        <div role="img" aria-label={`${frenan} de ${activas.length} reglas frenan solas`} className="bg-secondary mt-3 flex h-1.5 overflow-hidden rounded-full">
          <span className="bg-foreground h-full" style={{ width: `${(frenan / activas.length) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** Para buscar sin que importen las tildes ni las mayúsculas. */
const plano = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

interface Encontrado {
  readonly donde: string;
  readonly texto: string;
  readonly detalle?: string;
}

/** Lo que coincide con todas las palabras buscadas, en todo lo que sabe. */
function buscarEnLaMemoria(
  busqueda: string,
  datos: {
    aprendido: readonly { texto: string; fuente: string }[];
    recuerdos: readonly Recuerdo[];
    enObservacion: readonly NotaEnObservacion[];
    esperando: readonly NotaEnObservacion[];
    perfil: string;
  },
): Encontrado[] {
  const palabras = plano(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (...textos: (string | undefined)[]) => {
    const todo = plano(textos.filter(Boolean).join(" "));
    return palabras.every((p) => todo.includes(p));
  };
  return [
    ...datos.aprendido.filter((a) => coincide(a.texto, a.fuente)).map((a) => ({ donde: "Aprendido de otros modelos", texto: a.texto, detalle: `de ${a.fuente}` })),
    ...datos.recuerdos
      .filter((r) => coincide(r.dicho, r.patron, r.porQue))
      .map((r) => ({ donde: "Lo que ya sabe", texto: r.dicho, ...(r.patron ? { detalle: `frena sola · /${r.patron}/` } : {}) })),
    ...datos.esperando.filter((n) => coincide(n.texto)).map((n) => ({ donde: "Espera tu visto bueno", texto: n.texto })),
    ...datos.enObservacion.filter((n) => coincide(n.texto)).map((n) => ({ donde: "En observación", texto: n.texto })),
    ...datos.perfil
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
      .filter((l) => l !== "" && coincide(l))
      .map((l) => ({ donde: "El perfil del proyecto", texto: l })),
  ];
}

type FiltroMemoria = "todas" | "reglas" | "errores" | "decisiones" | "sin-uso" | "conflicto";

const FILTROS: readonly { id: FiltroMemoria; nombre: string }[] = [
  { id: "todas", nombre: "Todas" },
  { id: "reglas", nombre: "Reglas" },
  { id: "errores", nombre: "Errores" },
  { id: "decisiones", nombre: "Decisiones" },
  { id: "sin-uso", nombre: "Sin uso" },
  { id: "conflicto", nombre: "Con conflicto" },
];

function pasaElFiltro(recuerdo: Recuerdo, filtro: FiltroMemoria): boolean {
  if (filtro === "reglas") return (recuerdo.tipo ?? "regla") === "regla";
  if (filtro === "errores") return recuerdo.tipo === "error";
  if (filtro === "decisiones") return recuerdo.tipo === "decision";
  if (filtro === "sin-uso") return recuerdo.sinUso === true;
  if (filtro === "conflicto") return recuerdo.conflictoCon !== undefined;
  return true;
}

function EditorDeMemoria({
  editando,
  setEditando,
  guardar,
  cancelar,
}: {
  readonly editando: { id: string; dicho: string; candidato: boolean };
  readonly setEditando: Dispatch<SetStateAction<{ id: string; dicho: string; candidato: boolean } | null>>;
  readonly guardar: () => void;
  readonly cancelar: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        autoFocus
        value={editando.dicho}
        onChange={(ev) => setEditando({ ...editando, dicho: ev.target.value })}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") guardar();
          if (ev.key === "Escape") cancelar();
        }}
        maxLength={300}
        aria-label="Editar el dicho de la memoria"
        className={cn(CAMPO, "h-9 min-w-0 flex-1 text-sm")}
      />
      <Button variant="secondary" size="icon" aria-label={editando.candidato ? "Aprobar la candidata editada" : "Guardar edición"} onClick={guardar}>
        <Check aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Cancelar edición" onClick={cancelar}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** El texto con lo buscado marcado. */
function Marcado({ texto, busqueda }: { texto: string; busqueda: string }) {
  const palabras = plano(busqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return <>{texto}</>;
  const base = plano(texto);
  // Los tramos a marcar, sobre el texto sin tildes (mide lo mismo que el original: NFD solo saca marcas).
  const marcas: [number, number][] = [];
  for (const p of palabras) {
    for (let i = base.indexOf(p); i >= 0; i = base.indexOf(p, i + p.length)) marcas.push([i, i + p.length]);
  }
  if (marcas.length === 0 || base.length !== texto.length) return <>{texto}</>;
  marcas.sort((a, b) => a[0] - b[0]);
  const partes: React.ReactNode[] = [];
  let desde = 0;
  for (const [i, f] of marcas) {
    if (i < desde) continue;
    partes.push(texto.slice(desde, i));
    partes.push(
      <mark key={i} className="bg-foreground/15 text-foreground rounded-sm px-0.5">
        {texto.slice(i, f)}
      </mark>,
    );
    desde = f;
  }
  partes.push(texto.slice(desde));
  return <>{partes}</>;
}

/** Cuántas tareas distintas lleva una nota, en puntos: se lee de un vistazo. */
function Avance({ tareas, de }: { tareas: number; de: number }) {
  return (
    <span role="img" aria-label={`${tareas} de ${de} tareas`} title={`${tareas} de ${de} tareas`} className="flex gap-1">
      {Array.from({ length: de }, (_, i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < tareas ? "bg-foreground" : "bg-foreground/20")} />
      ))}
    </span>
  );
}

/** Una entrada de DREAMS.md, con lo justo de markdown: la fecha, los títulos en negrita y la lista. */
function Sueno({ texto }: { texto: string }) {
  return (
    <div>
      {texto.split("\n").map((linea, i) => {
        if (linea.startsWith("## ")) return <p key={i} className="text-muted-foreground text-xs font-medium">{linea.slice(3)}</p>;
        if (/^\*\*.+\*\*/.test(linea)) return <p key={i} className="mt-1.5 font-semibold">{linea.replace(/\*\*/g, "")}</p>;
        if (linea.startsWith("- ")) return <p key={i} className="text-foreground/85 ml-3 break-words">· {linea.slice(2)}</p>;
        if (linea.trim() === "") return null;
        return <p key={i} className="text-muted-foreground">{linea}</p>;
      })}
    </div>
  );
}
