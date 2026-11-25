import { CAPTURAS } from "./capturas";
import { type Celda, Grilla } from "./Grilla";
import { PAISAJES } from "./Lamina";

/**
 * «Nuevo en la 1.7» (18/11/2026): lo que trajo la versión, con capturas reales de la app sacadas de
 * sus fixtures (`DelfinesPage:conBots`, `LlevarAlServidor:listo`, `CartelDeMemoriaBaja:conServidor`,
 * `CuadritoDeEdicion:cambio`;
 * cómo regenerarlas, en `public/capturas/app-12-11/LEEME.md`). Delegar desde el chat no tiene una
 * pantalla propia —se ve en los agentes que aparecen trabajando—, así que va dicho en la bajada.
 *
 * Cuando salga la próxima versión, esta sección se reemplaza por la suya o se va: no es un archivo
 * de novedades, para eso está /novedades.
 */
const CELDAS: readonly Celda[] = [
  {
    titulo: "Delfines: tus bots, a la vista",
    linea: "Cada bot con su estado, cuándo le toca, cuánto gastó este mes contra su tope y qué dijo la última vez. Les hablás desde ahí.",
    pieza: { captura: CAPTURAS.delfines, ancho: 620 },
    paisaje: PAISAJES.desfiladero,
    foco: "50% 40%",
    ancha: true,
  },
  {
    titulo: "Correr en tu servidor",
    linea: "El bot pasa a tu VPS como un servicio que sigue andando con la compu apagada. Antes revisa que el servidor tenga lo necesario.",
    pieza: { captura: CAPTURAS.llevarAlServidor, ancho: 300 },
    paisaje: PAISAJES.delaware,
    foco: "40% 50%",
  },
  {
    titulo: "Avisa antes de quedarse sin RAM",
    linea: "Te dice qué espacio pesa más y ofrece seguirlo en tu servidor. Mientras tanto, los chats quietos se duermen antes.",
    pieza: { captura: CAPTURAS.pocaRam, ancho: 340 },
    paisaje: PAISAJES.merced,
    foco: "70% 50%",
  },
  {
    titulo: "Ctrl+K, con el cambio a la vista",
    linea: "Seleccionás, decís qué cambiar o qué querés saber. Las respuestas vuelven con formato y los cambios como diff antes de aplicarlos.",
    pieza: { captura: CAPTURAS.ctrlK, ancho: 560 },
    paisaje: PAISAJES.lago,
    foco: "30% 60%",
    ancha: true,
  },
];

export function Nuevo() {
  return (
    <section id="nuevo" aria-labelledby="nuevo-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center text-center">
        <h2 id="nuevo-titulo" className="titulo-seccion">
          Nuevo en la 1.7
        </h2>
        <p className="bajada mt-4 max-w-[52ch]">
          Pedile a Claude «delegá las tareas» y reparte el trabajo entre agentes que ves trabajar en la app. Conectá tu servidor en un
          paso y, si algo falla, un agente lo arregla.{" "}
          <a href="/novedades" className="text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma">
            Todo lo que cambió
          </a>
        </p>
      </div>
      <div className="mx-auto w-full max-w-[1200px] text-left">
        <Grilla celdas={CELDAS} />
      </div>
    </section>
  );
}
