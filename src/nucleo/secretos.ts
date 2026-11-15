/**
 * Sacarle las credenciales a un texto antes de mandárselo a otro.
 *
 * Vive en el núcleo porque la usan todos los caminos por los que un texto nuestro sale hacia un
 * proveedor distinto del que lo generó: el traspaso de una sesión a Codex (`src/traspaso.ts`), el
 * traspaso de una rama entre motores (`traspaso.ts` de esta carpeta) y los bots.
 *
 * No es cosmética. Lo que se traspasa lleva salidas de comandos y mensajes de error, y una salida
 * de test que imprime un token lo manda sin querer a la empresa del motor que entra. Un filtro no
 * atrapa todo: lo que se puede, no se pone en el texto.
 */
export function limpiarSecretos(texto: string): string {
  return texto
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b/g, "[CLAVE OMITIDA]")
    .replace(/\b(?:ghp|gho|ghs|ghr|github_pat)_[A-Za-z0-9_\-]{8,}\b/g, "[TOKEN GITHUB OMITIDO]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, "[TOKEN OMITIDO]")
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, "[TOKEN TELEGRAM OMITIDO]")
    .replace(/(^|[\s"'`?&])([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*)\s*=\s*[^\s"'`&]+/gim, "$1$2=[SECRETO OMITIDO]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"'`]+/gi, "$1[SECRETO OMITIDO]")
    .replace(/(^|[\s"'`])[^\s"'`]*\.env(?:\.[A-Za-z0-9._-]+)?/gi, "$1[ARCHIVO .env OMITIDO]");
}
