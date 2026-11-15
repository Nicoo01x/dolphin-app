import { Circle, CircleCheck, CircleX } from 'lucide-react'
import { cn } from '@/lib/class-names'

/**
 * La marca de estado de una fila de herramienta: salió, no salió, o está pasando.
 *
 * Why esto y no el glifo de categoría que había: el glifo decía QUÉ clase de herramienta era
 * —archivo, búsqueda, comando—, y eso ya lo dice la palabra de al lado («Read file index.ts»). Lo
 * que no estaba en ningún lado era si esa fila terminó bien, y es lo que se mira al recorrer una
 * lista de veinte. La forma lo dice sola —círculo vacío, tilde, cruz—, y el color lo confirma: el
 * verde y el rojo son los del sistema (`--status-success`, `--destructive`), los mismos que usan
 * el portón y las descargas, así que «salió» se ve igual en toda la app. Lo que sigue sin tener
 * color es la fila entera: pintar el texto de veinte renglones sí ensucia la transcripción.
 *
 * Why va `aria-hidden` y sin etiqueta propia: la fila es un botón cuyo nombre accesible se arma con
 * lo que tiene adentro, así que una etiqueta acá se le pega adelante y la fila pasa a llamarse
 * «Done Edited main.ts». El glifo que esto reemplazó también era decorativo, por lo mismo. El
 * estado de una fila que no salió además ya se dice con palabras cuando se la abre.
 */
export type EstadoDeLaFila = 'corriendo' | 'hecho' | 'fallo'

export function NativeChatMarcaDeEstado({
  estado,
  className
}: {
  readonly estado: EstadoDeLaFila
  readonly className?: string
}): React.JSX.Element {
  const comun = cn('size-3.5 shrink-0', className)
  if (estado === 'fallo') {
    return <CircleX aria-hidden className={cn(comun, 'text-destructive')} />
  }
  if (estado === 'corriendo') {
    // Sin spinner: en una lista larga, veinte cosas girando es ruido. El círculo vacío ya dice que
    // esa fila todavía no cerró, y lo que gira es el indicador del turno, uno solo y abajo de todo.
    return <Circle aria-hidden className={cn(comun, 'text-chat-foreground-faint/60')} />
  }
  return <CircleCheck aria-hidden className={cn(comun, 'text-status-success')} />
}
