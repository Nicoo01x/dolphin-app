/**
 * El editor de mentira, con una red para los escuchas.
 *
 * Monaco tiene decenas de `onDidAlgo` y el montaje engancha cada vez más (el Tab predictivo, el
 * borde de git, las ayudas). Listarlos a mano en cada prueba convierte cada función nueva del
 * editor en un test roto que no prueba nada: el proxy contesta a cualquier `onX` con un
 * descartable, y lo que cada archivo afirma sigue siendo lo suyo.
 *
 * Why acá y no copiado en cada prueba: estaba igual en dos, y la próxima prueba del montaje lo
 * iba a copiar una tercera vez.
 */
export function conEscuchas<T extends object>(base: T): T {
  return new Proxy(base, {
    get(destino, clave, receptor) {
      if (!(clave in destino) && typeof clave === 'string' && /^on[A-Z]/.test(clave)) {
        return () => ({ dispose: () => {} })
      }
      // Es una trampa de Proxy: `Reflect.get` con el receptor es la única forma de reenviar que
      // respeta los getters del objeto envuelto. Leer por índice perdería el `this` de un getter.
      // oxlint-disable-next-line anti-slop/no-reflect-get -- Proxy `get` trap: only Reflect.get forwards a raw string|symbol key with the proxy receiver.
      return Reflect.get(destino, clave, receptor)
    }
  })
}
