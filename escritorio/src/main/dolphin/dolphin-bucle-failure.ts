export function salidaIndicaFallo(salida: unknown): boolean {
  if (typeof salida !== 'object' || salida === null || Array.isArray(salida)) {
    return false
  }
  const entradas = Object.entries(salida)
  const valorDe = (clave: string): unknown => entradas.find(([nombre]) => nombre === clave)?.[1]
  const codigo = valorDe('exitCode') ?? valorDe('exit_code') ?? valorDe('code')
  return (
    (typeof codigo === 'number' && codigo !== 0) ||
    valorDe('success') === false ||
    valorDe('ok') === false ||
    valorDe('isError') === true ||
    valorDe('is_error') === true
  )
}
