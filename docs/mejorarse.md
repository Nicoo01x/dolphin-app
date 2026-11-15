# Que Dolphin mejore su propia forma de trabajar

Dolphin no puede cambiar los pesos de Claude, de Codex ni de Gemini. Lo que sí puede cambiar es
**cómo les pide las cosas**, y eso se puede medir.

La unidad de mejora es un **enfoque** (`src/nucleo/enfoques.ts`): la instrucción con que se encara una
tarea —«hacé el cambio más chico», «escribí primero un test que falle»—. Ya existían ocho, el agente
ya los recibe y la cosecha ya los guarda. Lo que faltaba era que Dolphin pudiera proponer uno nuevo y
demostrar que sirve.

El código es `src/nucleo/mejorarse.ts`.

## El ciclo

1. **Dónde falla** (`flaquezas`). Agrupa el historial de `desempeno.json` por tipo de tarea y lo
   ordena por **ramas perdidas**, no por porcentaje: un 0 % sobre dos intentos no duele. Nombra la
   fase culpable solo si mata a **más** de la mitad; con un empate de 2 y 2 no hay culpable, porque
   elegir uno sería echarle la culpa a cara o ceca.
2. **La hipótesis** (`promptDeHipotesis`, `leerHipotesis`). Un modelo lee esas fallas —no el repo— y
   propone una causa y un ángulo nuevo. Lo que contesta se controla: tiene que ser distinto de los
   que ya hay, tener instrucción de verdad, y pasar el guardia de abajo.
3. **El ensayo** (`CorrerEnsayo`, `juzgar`). Se corre el ángulo nuevo contra el de siempre sobre
   tareas históricas, y se adopta solo si gana con holgura.
4. **La propuesta** (`proponer`, `decidir`). Queda en `.dolphin/mejoras.json` esperando tu ok. Nunca
   se adopta sola.
5. **Después de adoptar** (`comoVaLoAdoptado`). Se lo sigue midiendo con ramas de verdad. Si rinde
   peor que el resto, se avisa para retirarlo.

## Las cuatro reglas que lo hacen honesto

**La mitad con que se piensa no es la mitad con que se prueba.** `partirHistorial` parte por una
huella del **texto** de la tarea, no por fecha: lo viejo y lo nuevo no son comparables, y así una
tarea repetida cae siempre del mismo lado y no se filtra al modelo que inventó la hipótesis.

**Nunca aprende a romper su propio portón** (`esSeguro`). Es el riesgo central de un sistema que se
mejora solo: la forma más fácil de «pasar más seguido» es romper lo que mide. Un ángulo que diga
saltear tests, borrarlos, commitear con `--no-verify`, poner `@ts-ignore` o bajar un umbral se
rechaza **antes** de gastar un peso en probarlo. El ensayo no lo agarraría: las ramas tramposas pasan
el portón de verdad.

**Mejorar acá no puede romper allá.** `juzgar` exige tres cosas: suficientes tareas reservadas de
cada lado, una mejora real (no dos puntos), y un **control en otros tipos de tarea** que no empeore.

**Adoptar no es para siempre.** Un ángulo que ganó el ensayo puede rendir peor con el tiempo: cambia
el repo, cambian los modelos. Por eso `desempeno.json` ahora guarda el enfoque de cada rama, y
`comoVaLoAdoptado` compara lo que rinde contra el resto, solo con ramas posteriores a tu ok.

## Lo que cuesta

Probar una estrategia cuesta plata de verdad: cada tarea del ensayo es un agente escribiendo. Por eso
el corredor entra **inyectado** (`CorrerEnsayo`): los tests prueban el ciclo entero sin gastar nada, y
cuando se use de verdad va a ser a mano y con tope. Nada de esto corre solo de noche.

## De dónde salió

Dos trabajos recientes hacen algo parecido, los dos con licencia MIT:

- **Prime Agent** ([arXiv 2608.23552](https://arxiv.org/abs/2608.23552),
  [PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent)): su `/refine`
  actualiza notas, memorias, habilidades y subagentes, **sin tocar nunca el prompt base**, con
  versiones que dicen de dónde salió cada cambio y permiten volver atrás. De ahí tomamos que lo
  aprendido viva aparte y sea auditable. Su propio informe cuenta que un agente guardó como habilidad
  un atajo que hacía trampa, y que les falta «validación independiente del estado»: eso acá es
  `esSeguro` y el ensayo contra la mitad reservada.
- **Continual Harness** ([arXiv 2605.09998](https://arxiv.org/abs/2605.09998),
  [sethkarten/continual-harness](https://github.com/sethkarten/continual-harness)): refina prompt,
  subagentes, habilidades y memoria cada N pasos mirando señales como bucles y herramientas que
  fallan. De ahí tomamos las señales que disparan el ciclo y marcar lo aprendido como tal. Su
  refinador **aplica los cambios sin medirlos y sin poder revertirlos**, que es justo lo que acá no se
  hace.

No se copió código: uno es Rust y el otro Python, y la parte que más importa —el ensayo reservado y
el ok de una persona— no está en ninguno de los dos.

## Lo que falta

- El comando `dolphin mejorar`: encontrar la flaqueza, pedir la hipótesis y correr el ensayo con tope
  en dólares.
- Verlo en la consola: la propuesta con su evidencia, y adoptarla o descartarla desde ahí.
- Hoy casi todo el historial de los repos de prueba salió del agente de mentira, así que todavía no
  hay con qué sacar una conclusión de verdad.
