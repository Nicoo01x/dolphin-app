import { Marquesina } from "./Marquesina";

/**
 * «Traé tu agente», la sección de la web de la base que lista los agentes que soporta. Los logos pasan en
 * una marquesina de dos filas (`Marquesina`): arriba los diez motores del equipo
 * (`docs/motores.md`), abajo otros que la app abre en su terminal. Va sobre el lienzo claro y no
 * en una caja negra: una docena de logos son negros y ahí se perdían.
 */
export function TraeTuAgente() {
  return (
    <section id="agentes" aria-labelledby="agentes-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center text-center">
        <h2 id="agentes-titulo" className="titulo-seccion">
          Con el agente que ya pagás.
        </h2>
        <p className="bajada mt-4 max-w-[46ch]">
          Dolphin corre el CLI que tenés instalado, con tu sesión. Diez arman equipo; la app abre otros en su terminal.
        </p>
        <div className="mt-10 w-full md:mt-14">
          <Marquesina />
        </div>
      </div>
    </section>
  );
}
