/** Para las capturas: espera a que cada grabado del cuadro haya pintado su lámina. */
export async function esperarGrabados(cuadro: HTMLElement, topeMs = 8000): Promise<void> {
  const hasta = performance.now() + topeMs
  while (performance.now() < hasta) {
    const lienzos = [...cuadro.querySelectorAll('canvas')]
    if (lienzos.length > 0 && lienzos.every((lienzo) => 'listo' in lienzo.dataset)) {
      return
    }
    await new Promise((listo) => setTimeout(listo, 50))
  }
}
