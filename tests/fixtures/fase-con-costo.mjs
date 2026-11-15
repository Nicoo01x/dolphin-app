/**
 * Una fase que declara en qué escalón del portón quiere entrar y qué gastó.
 * Las opciones las pone el test: sirve para las dos mitades de la regla —una
 * fase barata puede informar su plata, una gratis no— y para un costo que no
 * existe.
 */
export default function faseConCosto(opciones) {
  return {
    nombre: "la que paga",
    costo: opciones?.costo,
    async correr() {
      return { paso: true, detalle: "miré el diff con un modelo", gastado: opciones?.gastado };
    },
  };
}
