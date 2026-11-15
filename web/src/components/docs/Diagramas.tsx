/**
 * Los diagramas de la doc, en HTML y no en un SVG fijo: así se reacomodan en el celular y el texto
 * se lee del mismo tamaño que el resto.
 *
 * Son figuras de un libro: van numeradas («Fig. 2») y con su epígrafe, y se arman con filetes y
 * superficies tonales. Nada de cajas redondeadas flotando.
 */

const caja = "rounded bg-lienzo-2 px-4 py-3";

/** El pie de una figura: el número al margen y la explicación al lado. */
function Pie({ numero, children }: { numero?: number; children: React.ReactNode }) {
  return (
    <figcaption className="mt-4 flex gap-3 border-t border-espuma/10 pt-2 text-[13px] leading-relaxed text-tinta/60">
      {numero !== undefined && <span className="flex-none font-codigo text-[11px] text-tinta/55">Fig. {numero}</span>}
      <span>{children}</span>
    </figcaption>
  );
}

/** El portón como escalera: cinco ramas entran y en cada fase se cortan las que no pasan. */
function Porton({ numero }: { numero?: number }) {
  const fases = [
    { nombre: "configuración", costo: "gratis", vivas: 5 },
    { nombre: "política", costo: "gratis", vivas: 5 },
    { nombre: "memoria", costo: "gratis", vivas: 4 },
    { nombre: "tus scripts", costo: "gratis", vivas: 3 },
    { nombre: "pantalla", costo: "gratis", vivas: 2 },
    { nombre: "vision", costo: "barato", vivas: 2 },
    { nombre: "revisión", costo: "barato", vivas: 2 },
  ];
  return (
    <figure className="my-8">
      <div className="flex flex-col gap-1" role="img" aria-label="Cinco ramas entran al portón; en cada fase se cortan las que no pasan y al final quedan dos, de las que gana la más simple.">
        {fases.map((f, i) => (
          // La escalera baja en diagonal solo donde hay lugar; en el celular las fases van alineadas.
          <div key={f.nombre} className="flex items-center gap-3 rounded bg-lienzo-2 px-4 py-2.5 sm:ml-[calc(var(--i)*18px)]" style={{ "--i": i } as React.CSSProperties}>
            <span className="w-24 flex-none text-[15px] text-espuma sm:w-28">{f.nombre}</span>
            <span className={`w-12 flex-none text-[12px] sm:w-14 ${f.costo === "gratis" ? "text-tinta/55" : "text-espuma"}`}>{f.costo}</span>
            <span className="ml-auto flex gap-1.5" aria-hidden="true">
              {Array.from({ length: 5 }, (_, k) => (
                <span key={k} className={`size-2.5 rounded-full ${k < f.vivas ? "bg-espuma" : "bg-lienzo-3"}`} />
              ))}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-3 rounded bg-espuma px-4 py-2.5 text-lienzo sm:ml-[126px]">
          <span className="flex-none text-[15px] font-medium">la elegida</span>
          <span className="text-[13px]">la más simple de las que pasaron</span>
        </div>
      </div>
      <Pie numero={numero}>Un ejemplo con cinco ramas. Lo gratis corre primero; lo que cuesta, solo sobre las que llegaron.</Pie>
    </figure>
  );
}

function Flecha() {
  return (
    <svg viewBox="0 0 12 24" className="mx-auto h-6 w-3 text-tinta/40" aria-hidden="true">
      <path d="M6 0v20M1 15l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** El equipo: el líder parte, tres compañeros a la vez, y todo se junta antes del portón. */
function Equipo({ numero }: { numero?: number }) {
  return (
    <figure className="my-8">
      <div role="img" aria-label="El líder parte el pedido en tres tareas; tres compañeros las hacen a la vez en su rama; se integran, otro modelo revisa el diff y el portón decide.">
        <div className="mx-auto max-w-md">
          <div className={`${caja} text-center`}>
            <p className="text-[15px] text-espuma">El líder</p>
            <p className="text-[13px] text-tinta/70">parte el pedido, estima y espera tu «dale»</p>
          </div>
          <Flecha />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["la lógica", "medio"],
            ["la pantalla", "barato"],
            ["los tests", "barato · después de la lógica"],
          ].map(([t, escalon]) => (
            <div key={t} className="rounded bg-lienzo-2 px-3 py-3 text-center">
              <p className="text-[14px] text-espuma">{t}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-tinta/60">{escalon}</p>
              <p className="mt-2 text-[12px] text-tinta/60">su rama</p>
            </div>
          ))}
        </div>
        <div className="mx-auto max-w-md">
          <Flecha />
          <div className={`${caja} text-center`}>
            <p className="text-[15px] text-espuma">La integración</p>
            <p className="text-[13px] text-tinta/70">si chocan, un agente resuelve y se prueba todo junto</p>
          </div>
          <Flecha />
          <div className={`${caja} text-center`}>
            <p className="text-[15px] text-espuma">Revisión y portón</p>
            <p className="text-[13px] text-tinta/70">otro modelo lee el diff entero; después, las fases</p>
          </div>
        </div>
      </div>
      <Pie numero={numero}>Un pedido repartido entre tres compañeros. Las tres ramas vuelven a juntarse antes de que decida el portón.</Pie>
    </figure>
  );
}

/** El ciclo de permiso de un bot que pregunta. */
function Permiso({ numero }: { numero?: number }) {
  const pasos = [
    ["Le pedís algo", "por Telegram, la consola o la terminal"],
    ["Corre de solo lectura", "mira, piensa, no toca nada"],
    ["Te dice qué quiere hacer", "y por qué; queda en pendiente.json"],
    ["Contestás «dale»", "y recién ahí corre con permisos"],
  ] as const;
  return (
    <figure className="my-8">
      <ol
        className="grid gap-px bg-espuma/10 sm:grid-cols-2 lg:grid-cols-4"
        role="img"
        aria-label="Le pedís algo; el bot corre de solo lectura; te dice qué quiere hacer y por qué; contestás dale y recién ahí corre con permisos."
      >
        {pasos.map(([titulo, texto], i) => (
          <li key={titulo} className={`p-5 ${i === 3 ? "bg-espuma text-lienzo" : "bg-lienzo"}`}>
            <p className={`text-[15px] ${i === 3 ? "font-medium" : "text-espuma"}`}>{titulo}</p>
            <p className={`mt-1 text-[13px] leading-snug ${i === 3 ? "text-lienzo/75" : "text-tinta/70"}`}>{texto}</p>
          </li>
        ))}
      </ol>
      <Pie numero={numero}>El permiso «preguntar», de punta a punta: hasta tu «dale» el bot no escribe ni ejecuta nada.</Pie>
    </figure>
  );
}

export function Diagrama({ cual, numero }: { cual: "portón" | "equipo" | "permiso"; numero?: number }) {
  if (cual === "portón") return <Porton {...(numero !== undefined ? { numero } : {})} />;
  if (cual === "equipo") return <Equipo {...(numero !== undefined ? { numero } : {})} />;
  return <Permiso {...(numero !== undefined ? { numero } : {})} />;
}
