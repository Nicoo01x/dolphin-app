# Cómo está armado

```
src/
  dolphin.ts               el comando `dolphin`: sin argumentos abre la terminal; con uno, despacha (tabla COMANDOS)
  *-cli.ts                 un archivo por comando: leen flags y cuentan
  siembra.ts               arma una siembra: el mismo camino para el CLI, la cola y el calendario
  servidor.ts              la consola: API local, eventos en vivo, el modo live
  servidor-bots.ts         la API de los bots para la consola
  nucleo/
    sembrar.ts · porton.ts · elegir.ts     abrir ramas, cruzar el portón, quedarse con la más simple
    taller.ts · entorno.ts · puertos.ts    worktrees con su puerto, su base y sus dependencias
    router.ts · desempeno.ts · cache.ts    quién escribe y quién revisa, con cifras propias
    relevo.ts · traspaso.ts · cupo.ts      si un motor no puede, sigue otro en el mismo worktree
    preview.ts · puerta.ts · tunel.ts      la app de una rama adentro de la consola, y quién entra
    memoria.ts · sueno.ts                  correcciones que se vuelven verificadores, y el sueño
    cola.ts · plan.ts · calendario.ts      varias tareas, el plan, los turnos
    guardian.ts · bandeja.ts · ssh.ts      la rama principal vigilada, los asuntos, el VPS
    entrega.ts · pr.ts · parte.ts          el commit, el merge, el PR y el parte
    config-ejecutable.ts · politica.ts     lo que no corre sin permiso
    escritura.ts                           el estado se escribe de una vez, sin pisarse
  equipo/         el líder, los compañeros, el buzón entre ellos y la integración
  agentes/        Claude, Codex, Antigravity y el de mentira · el revisor · el juez · el planificador
  tester/         las cinco personas, el explorador y Vision
  bots/           los agentes personales: almacén, rutinas, chequeos, servicio, Telegram
  tui/            la app de terminal, dibujada celda por celda
ui/               la consola web: React + Vite + Tailwind, construida a ui/dist
escritorio/       la app de escritorio (Electron)
web/              la web pública con la documentación (Next, export estático)
scripts/          el demo, el smoke, el GIF y lo que construye la consola al instalar
tests/            la suite (Vitest)
```

El núcleo recibe sus dependencias por parámetro —el agente, el taller, el reloj—, así que la suite
corre sin red y sin gastar un token. **Cero dependencias de runtime**: todo lo que importa el núcleo es
`node:*`; Playwright entra por import dinámico y es opcional. Lo que no escribimos nosotros en la
consola (GSAP, Satoshi, Inter) está en `ui/PROCEDENCIA.md` con su versión y su licencia.

**Un solo sistema visual.** La consola y el escritorio son dos superficies del mismo producto, así
que los colores de la base y los de cada estado —qué color tiene «pasó», «murió», «corriendo», una
idea, lo que espera revisión— salen de un solo archivo: `src/nucleo/tokens-visuales.ts`. No genera
los CSS (se editan a mano todo el tiempo): los vigila, y `tests/tokens-visuales.test.ts` falla si
alguna superficie dice otra cosa o si a alguna le falta un token. Lo que queda distinto a propósito
está escrito ahí mismo: el tema claro, que solo tiene el escritorio, y la tipografía, que en el
escritorio se elige.

## Lo que todavía no hace

- El aislamiento llega hasta el puerto, la base, los archivos y la caja: cada siembra lleva la suya y
  cada corrida su contenedor, así que dos ramas a la vez no se pisan (`conCaja` en
  `agentes/ejecutar.ts`, probado en `tests/aislado-paralelo.test.ts`). Lo que **todavía** falta es el
  apagado: un Ctrl+C mata los procesos y deja los contenedores vivos escribiendo en el worktree
  ([aislamiento.md](aislamiento.md)).
- La fila que evita que dos cambios al mismo archivo de estado se pisen es dentro de un proceso: la
  consola y un `dolphin cola` sobre el mismo repo, a la vez, no se coordinan.
- Vision paga un juez por rama: por eso se prende a mano.
- En el modo aislado, la red es todo o nada ([aislamiento.md](aislamiento.md)).
- Los bots hablan solo por Telegram y piensan solo con Claude Code o Codex.
- El túnel al teléfono (`dolphin ui --tunel`) está probado con el proceso inyectado y con el
  servidor contestando a un Host de túnel, pero todavía no contra Cloudflare de verdad: hace falta
  `cloudflared` instalado ([api.md](api.md) cuenta qué protege esa puerta).
