const MAX_ARGUMENTOS = 2_048

function jsonEstable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? String(valor)
  }
  if (Array.isArray(valor)) {
    return `[${valor.map((elemento) => jsonEstable(elemento)).join(',')}]`
  }
  const entradas = Object.entries(valor)
  return `{${entradas
    .sort(([claveA], [claveB]) => (claveA < claveB ? -1 : claveA > claveB ? 1 : 0))
    .map(([clave, elemento]) => `${JSON.stringify(clave)}:${jsonEstable(elemento)}`)
    .join(',')}}`
}

export function argumentosNormalizados(argumentos: unknown): { texto: string; presentes: boolean } {
  if (argumentos === undefined || argumentos === null || argumentos === '') {
    return { texto: '', presentes: false }
  }
  if (typeof argumentos === 'string') {
    const recortado = argumentos.trim()
    if (!recortado) {
      return { texto: '', presentes: false }
    }
    try {
      return { texto: jsonEstable(JSON.parse(recortado)).slice(0, MAX_ARGUMENTOS), presentes: true }
    } catch {
      return { texto: recortado.slice(0, MAX_ARGUMENTOS), presentes: true }
    }
  }
  return { texto: jsonEstable(argumentos).slice(0, MAX_ARGUMENTOS), presentes: true }
}

export function huellaDeHerramienta(nombre: string, argumentos?: unknown): string {
  const normalizados = argumentosNormalizados(argumentos)
  return normalizados.presentes ? `${nombre}:${normalizados.texto}` : nombre
}
