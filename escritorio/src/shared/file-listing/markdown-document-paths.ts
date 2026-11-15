import {
  createMarkdownDocumentListingBudget,
  retainMarkdownDocument
} from './markdown-document-listing-limits'
import { isWindowsAbsolutePathLike } from '../cross-platform-path'
import { normalizeRelativePath } from '../file-search/text-search-paths'
import { basename as pathBasename, extname, isAbsolute, posix, relative, resolve } from 'node:path'
import type { FileDocument, MarkdownDocument } from './file-document'
export function isMarkdownDocumentName(name: string): boolean {
  return isMarkdownExtension(extname(name))
}

function isMarkdownExtension(extension: string): boolean {
  const normalized = extension.toLowerCase()
  return normalized === '.md' || normalized === '.mdx' || normalized === '.markdown'
}

function basenameFromRelativePath(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf('/') + 1)
}

function isSafeRelativePath(relativePath: string): boolean {
  return !relativePath.split('/').includes('..')
}

/**
 * Los separadores que devuelve `path.relative` son los de la máquina, no los del root.
 *
 * `normalizeRelativePath` decide si convertir mirando cómo se ve el root, y eso falla justo en el
 * caso peligroso: en Windows, con un root que parece POSIX —una raíz de WSL o de SSH— la ruta
 * relativa vuelve con `\`, no se convierte, y el control de escape, que parte por `/`, no ve el
 * `..`. Un archivo de afuera de la raíz pasaba como si estuviera adentro.
 *
 * Se convierte sólo en Windows: en POSIX una barra invertida es parte legítima de un nombre.
 */
function conBarrasDeLaRuta(relativePath: string): string {
  return process.platform === 'win32' ? relativePath.replaceAll('\\', '/') : relativePath
}

function rootRelativePath(rootPath: string, filePath: string): string | null {
  const resolvedRoot = resolve(rootPath)
  const resolvedFile = resolve(filePath)
  const relativePath = conBarrasDeLaRuta(relative(resolvedRoot, resolvedFile))
  if (
    !isSafeRelativePath(normalizeRelativePath(relativePath, rootPath)) ||
    isAbsolute(relativePath)
  ) {
    return null
  }
  return normalizeRelativePath(relativePath, rootPath)
}

export function fileDocumentFromFilePath(
  rootPath: string,
  filePath: string,
  options: { outsideRootRelativePath?: 'basename' | 'relative' } = {}
): FileDocument {
  const basename = pathBasename(filePath)
  const extension = extname(basename)
  const relativePath =
    rootRelativePath(rootPath, filePath) ??
    (options.outsideRootRelativePath === 'basename'
      ? basename
      : normalizeRelativePath(relative(rootPath, filePath), rootPath))
  return {
    filePath,
    relativePath,
    basename,
    name: extension ? basename.slice(0, -extension.length) : basename
  }
}

export const markdownDocumentFromFilePath = fileDocumentFromFilePath

export function markdownDocumentFromRelativePath(
  rootPath: string,
  relativePath: string
): MarkdownDocument | null {
  const normalizedRelativePath = normalizeRelativePath(relativePath, rootPath)
  // Reject escaping SSH paths before constructing synthetic renderer absolute paths.
  if (!isSafeRelativePath(normalizedRelativePath)) {
    return null
  }
  const basename = basenameFromRelativePath(normalizedRelativePath)
  // Remote separators are already normalized; a POSIX backslash stays part of the name.
  const extension = posix.extname(basename)
  if (!isMarkdownExtension(extension)) {
    return null
  }
  const normalizedRoot = rootPath.replace(
    isWindowsAbsolutePathLike(rootPath) ? /[\\/]+$/ : /\/+$/,
    ''
  )
  return {
    filePath: `${normalizedRoot}/${normalizedRelativePath}`,
    relativePath: normalizedRelativePath,
    basename,
    name: extension ? basename.slice(0, -extension.length) : basename
  }
}

export function markdownDocumentsFromRelativePaths(
  rootPath: string,
  relativePaths: string[]
): MarkdownDocument[] {
  const budget = createMarkdownDocumentListingBudget()
  const documents: MarkdownDocument[] = []
  for (const path of relativePaths) {
    const document = markdownDocumentFromRelativePath(rootPath, path)
    if (document) {
      retainMarkdownDocument(budget, document)
      documents.push(document)
    }
  }
  return documents.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
