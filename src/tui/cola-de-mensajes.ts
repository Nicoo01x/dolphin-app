/**
 * Lo que escribís mientras el agente trabaja.
 *
 * Hasta ahora, escribir con el equipo corriendo largaba otro pedido encima del que estaba: dos
 * agentes pensando al mismo tiempo sobre el mismo repo. Ahora se guarda y sale cuando termina
 * —o cuando vos decís que salga—, que es lo que hacen Claude Code y el chat de escritorio.
 *
 * Todo acá es texto entrando y texto saliendo. Quién decide que está ocupada y quién lo manda de
 * verdad son de la sesión; esto es sólo qué se guarda, en qué orden y cómo se junta.
 */

export interface Encolado {
  readonly texto: string;
  /** Cuándo se escribió: el chat lo usa para el fundido de entrada. */
  readonly t: number;
}

/** Más que esto no se guarda: una cola que crece sin fin es trabajo que nadie recuerda haber pedido. */
export const TOPE_DE_LA_COLA = 20;

export class ColaDeMensajes {
  private cola: Encolado[] = [];

  /** Lo que hay esperando, en el orden en que se escribió. */
  get pendientes(): readonly Encolado[] {
    return this.cola;
  }

  get hay(): boolean {
    return this.cola.length > 0;
  }

  /**
   * Guarda uno. Devuelve false si no entró.
   *
   * Lo vacío no se guarda (un Enter de más no es un pedido) y lo repetido seguido tampoco: un
   * Enter doble por nervios no tiene que mandar la misma cosa dos veces.
   */
  encolar(texto: string, t: number): boolean {
    const limpio = texto.trim();
    if (limpio === "" || this.cola.length >= TOPE_DE_LA_COLA) return false;
    if (this.cola.at(-1)?.texto === limpio) return false;
    this.cola.push({ texto: limpio, t });
    return true;
  }

  /** Saca el de la posición i (el que tachaste antes de que saliera). */
  quitar(i: number): boolean {
    if (i < 0 || i >= this.cola.length) return false;
    this.cola.splice(i, 1);
    return true;
  }

  /** Los saca todos y los devuelve juntos en UN pedido, o null si no había nada. */
  soltar(): string | null {
    if (this.cola.length === 0) return null;
    const texto = this.cola.map((x) => x.texto).join("\n");
    this.cola = [];
    return texto;
  }

  /** Tira lo guardado sin mandarlo (un ctrl+c que corta todo). */
  vaciar(): void {
    this.cola = [];
  }
}

/**
 * Cómo se lee la cola arriba del prompt.
 *
 * Why los últimos y no los primeros: lo que está por salir primero es lo de arriba, pero cuando
 * no entran todos, lo que la persona acaba de escribir es lo que está mirando. Igual se dice
 * cuántos quedaron afuera, porque una cola que esconde trabajo sin decirlo es peor que ninguna.
 */
export function renglonesDeLaCola(
  pendientes: readonly Encolado[],
  cuantosEntran: number,
): { readonly texto: string; readonly t: number }[] {
  if (pendientes.length === 0 || cuantosEntran <= 0) return [];
  if (pendientes.length <= cuantosEntran) {
    return pendientes.map((x) => ({ texto: x.texto, t: x.t }));
  }
  const ocultos = pendientes.length - (cuantosEntran - 1);
  const ultimos = pendientes.slice(pendientes.length - (cuantosEntran - 1));
  return [
    { texto: `+${ocultos} esperando`, t: pendientes[0]!.t },
    ...ultimos.map((x) => ({ texto: x.texto, t: x.t })),
  ];
}
