import { FASES, type Paso } from "@/lib/guion-del-chat";

/**
 * Cómo se dibuja cada paso de la demo del chat.
 *
 * Vive aparte de `ChatTrabajando` porque son dos cosas distintas: allá está el reloj —cuándo entra
 * cada paso— y acá cómo se ve cada uno. Separadas, se puede tocar la pinta de una fila sin entrar
 * al motor que la hace aparecer.
 *
 * Las marcas son las mismas de la app: círculo vacío mientras pasa, tilde verde cuando salió. Es
 * lo que hace que la demo se reconozca al abrir el producto.
 */

export function Renglon({
  paso,
  ultimo,
  corriendo,
  fases,
}: {
  readonly paso: Paso;
  readonly ultimo: boolean;
  readonly corriendo: boolean;
  /** Cuántas fases del portón van encendidas, cuando el paso es el portón. */
  readonly fases: number;
}) {
  if (paso.tipo === "pide") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[var(--radius-caja)] bg-app-espuma/[0.08] px-4 py-2.5 text-sm text-app-espuma">
          {paso.texto}
        </p>
      </div>
    );
  }

  if (paso.tipo === "piensa") {
    return (
      <p className="flex items-center gap-2.5 text-sm text-app-tenue italic">
        <Circulo lleno={false} />
        {paso.texto}…
      </p>
    );
  }

  if (paso.tipo === "hace") {
    // El círculo vacío sólo en la de abajo mientras algo sigue pasando: las de arriba ya cerraron.
    const abierta = ultimo && corriendo;
    return (
      <p className="flex items-start gap-2.5 text-sm">
        <Circulo lleno={!abierta} />
        <span className="min-w-0">
          <span className="text-app-espuma">{paso.que}</span>{" "}
          <span className="font-codigo text-[13px] text-app-tenue">{paso.sobre}</span>
        </span>
      </p>
    );
  }

  if (paso.tipo === "dice") {
    return <p className="max-w-[92%] text-sm leading-relaxed text-app-tinta">{paso.texto}</p>;
  }

  if (paso.tipo === "orquesta") {
    return (
      <div className="rounded-[var(--radius-caja)] bg-app-espuma/[0.04] p-3">
        <p className="mb-2 flex items-center gap-2 text-[12px] text-app-apagado">
          <span aria-hidden className="size-1.5 rounded-full bg-electrico" />
          Intelligent Orchestration · {paso.companeros.length} compañeros
        </p>
        <ul className="flex flex-col gap-1.5">
          {paso.companeros.map((companero) => (
            <li key={companero.nombre} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="text-app-espuma">{companero.nombre}</span>
              <span className="rounded-full bg-app-espuma/10 px-1.5 py-px text-[11px] text-app-tenue">
                {companero.modelo}
              </span>
              <span className="font-codigo text-[12px] text-app-apagado">{companero.tarea}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (paso.tipo === "porton") {
    return <Porton encendidas={fases} reboto={paso.reboto} />;
  }

  return (
    <div className="mt-1 rounded-[var(--radius-caja)] bg-paso/[0.09] px-4 py-3 ring-1 ring-paso/25">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Circulo lleno />
        <span className="font-codigo text-[13px] text-app-espuma">{paso.rama}</span>
        <span className="text-app-tenue">lista para mirar</span>
      </p>
      <p className="mt-1.5 pl-6 text-[13px] text-app-apagado">
        {paso.archivos} {paso.archivos === 1 ? "archivo" : "archivos"} ·{" "}
        <span className="text-paso">+{paso.mas}</span> <span className="text-cayo">−{paso.menos}</span> ·{" "}
        {paso.segundos} s
      </p>
    </div>
  );
}

/**
 * Las ocho fases encendiéndose de a una.
 *
 * Que se vean correr en orden es el punto: cada escalón sólo corre si pasó el anterior, y por eso
 * una rama rota en los tipos nunca llega a pagarle a un modelo.
 */
function Porton({ encendidas, reboto }: { readonly encendidas: number; readonly reboto?: string }) {
  return (
    <div className="rounded-[var(--radius-caja)] bg-app-espuma/[0.04] p-3">
      <p className="mb-2 text-[12px] text-app-apagado">El portón</p>
      <ul className="flex flex-wrap gap-1.5">
        {FASES.map((fase, i) => {
          const paso = i < encendidas;
          const rebotada = reboto === fase && paso;
          return (
            <li
              key={fase}
              className={`rounded-full px-2 py-0.5 text-[11px] transition-colors duration-200 ${
                rebotada
                  ? "bg-cayo/15 text-cayo"
                  : paso
                    ? "bg-paso/15 text-paso"
                    : "bg-app-espuma/[0.06] text-app-apagado"
              }`}
            >
              {fase}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** La misma marca que usa el chat de la app: círculo vacío mientras pasa, tilde verde cuando salió. */
export function Circulo({ lleno }: { readonly lleno: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-0.5 size-3.5 shrink-0">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className={lleno ? "text-paso" : "text-app-tenue"}
      />
      {lleno ? (
        <path
          d="M5 8.2l2 2 4-4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-paso"
        />
      ) : null}
    </svg>
  );
}
