import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Docs-only CI skips some media owners; check index paths because GitHub cannot render uncommitted docs-site/feature-wall assets.
const TRANSLATED_README_DIR = path.join('docs', 'readme')
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i
const HTML_ATTRIBUTE = /\b(src|srcset|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const MARKDOWN_LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function readmeFiles(root) {
  const translatedDir = path.join(root, TRANSLATED_README_DIR)
  // Why: la foto pública no lleva docs/readme (operación interna, ver scripts/publico/excluir.txt);
  // sin esa carpeta queda el README.md de la raíz, que sí hay que vigilar.
  if (!existsSync(translatedDir)) {
    return ['README.md']
  }
  const translated = readdirSync(translatedDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.posix.join('docs', 'readme', name))
  return ['README.md', ...translated]
}

// Bound ls-files to referenced pathspecs; full-tree output overflows the child buffer.
function trackedFiles(root, candidates) {
  if (candidates.length === 0) {
    return new Set()
  }
  const stdout = execFileSync(
    'git',
    ['--literal-pathspecs', 'ls-files', '-z', '--', ...candidates],
    { cwd: root, encoding: 'utf8' }
  )
  return new Set(stdout.split('\0').filter(Boolean))
}

function* srcsetTargets(value) {
  let position = 0
  while (position < value.length) {
    while (position < value.length && /[\t\n\f\r ,]/.test(value[position])) {
      position++
    }
    if (position === value.length) {
      return
    }
    const start = position
    while (position < value.length && !/[\t\n\f\r ]/.test(value[position])) {
      position++
    }
    let end = position
    while (value[end - 1] === ',') {
      end--
    }
    // HTML URL tokens can contain commas; trailing commas end a URL-only candidate.
    yield value.slice(start, end)
    if (end < position) {
      continue
    }
    let inParentheses = false
    while (position < value.length) {
      const character = value[position++]
      if (character === '(') {
        inParentheses = true
      } else if (character === ')') {
        inParentheses = false
      } else if (character === ',' && !inParentheses) {
        break
      }
    }
  }
}

function* localTargets(markdown) {
  for (const [, attribute, doubleQuoted, singleQuoted] of markdown.matchAll(HTML_ATTRIBUTE)) {
    const value = doubleQuoted ?? singleQuoted
    // Only srcset lists candidates; each begins with its URL. src/href hold one whole URL.
    const targets = attribute.toLowerCase() === 'srcset' ? srcsetTargets(value) : [value.trim()]
    for (const target of targets) {
      if (target) {
        yield target
      }
    }
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    yield match[1].replace(/^<|>$/g, '')
  }
}

// Why: escritorio/ es una carpeta del repo, no su raíz; su README enlaza al RELEASE.md de arriba.
// Un `../` vale mientras no salga del repo de git.
function depthInsideRepository(root) {
  const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  return prefix ? prefix.replace(/\/$/, '').split('/').length : 0
}

function resolveTarget(readme, target, depth) {
  const bare = target.split(/[?#]/)[0]
  if (!bare) {
    return null
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(readme), decodeURIComponent(bare))
  )
  const parents = resolved.match(/^(?:\.\.\/)*/)[0].length / 3
  return parents > depth ? null : resolved
}

function collectLinks(root) {
  const links = []
  const depth = depthInsideRepository(root)
  for (const readme of readmeFiles(root)) {
    const markdown = readFileSync(path.join(root, readme), 'utf8')
    for (const target of new Set(localTargets(markdown))) {
      if (EXTERNAL_TARGET.test(target)) {
        continue
      }
      links.push({ readme, target, resolved: resolveTarget(readme, target, depth) })
    }
  }
  return links
}

export function findBrokenReadmeLinks(root) {
  const links = collectLinks(root)
  const candidates = [...new Set(links.map((link) => link.resolved).filter(Boolean))]
  const tracked = trackedFiles(root, candidates)
  return links.filter(({ resolved }) => resolved === null || !tracked.has(resolved))
}

export function main(root = process.cwd()) {
  const broken = findBrokenReadmeLinks(root)
  if (broken.length > 0) {
    console.error(`README local link check failed with ${broken.length} broken link(s):`)
    for (const { readme, target, resolved } of broken) {
      console.error(
        `- ${readme}: ${target} -> ${resolved ?? 'outside the repository'} is not tracked`
      )
    }
    return 1
  }
  console.log('README local link check passed.')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
