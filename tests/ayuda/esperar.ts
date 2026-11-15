/**
 * Esperar a que algo PASE, no a que pase un rato.
 *
 * `await new Promise((r) => setTimeout(r, 30))` funciona en una máquina descansada y falla en la
 * suite entera: con 174 archivos en paralelo, 30 ms de reloj no son 30 ms de CPU y el trabajo que
 * se esperaba todavía no corrió. Eso no es un bug del código: es un test que miente, y mintió dos
 * veces (`atajos`, `bots-telegram`) dando rojo un portón que estaba bien.
 *
 * `esperarA` sondea hasta que la condición se cumple, con un tope generoso: cuando la condición ya
 * se cumplió vuelve enseguida (la suite no se hace más lenta), y cuando de verdad está rota falla
 * con el mismo mensaje de siempre, no con un timeout mudo.
 */
export async function esperarA(condicion: () => boolean | Promise<boolean>, { tope = 3000, paso = 5 }: { tope?: number; paso?: number } = {}): Promise<void> {
  const limite = Date.now() + tope;
  for (;;) {
    if (await condicion()) return;
    if (Date.now() > limite) return; // el expect de quien llama dice qué faltó
    await new Promise((r) => setTimeout(r, paso));
  }
}
