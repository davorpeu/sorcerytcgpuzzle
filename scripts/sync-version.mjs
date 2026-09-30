// Copies the version from package.json into every other place that states it,
// so package.json stays the single source. Runs from the "version" npm hook
// (see package.json): `npm version patch|minor|major` bumps package.json, runs
// this, and commits and tags everything together.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

// WordPress compares this header to detect plugin updates.
const plugin = resolve(root, 'wordpress/sorcery-puzzle/sorcery-puzzle.php')
const header = /^( \* Version:[ \t]*)\S+/m
const php = readFileSync(plugin, 'utf8')
if (!header.test(php)) {
  console.error(`No " * Version:" header line in ${plugin}; version not synced.`)
  console.error('Undo the bump with: git checkout package.json package-lock.json')
  process.exit(1)
}
writeFileSync(plugin, php.replace(header, `$1${version}`))
console.log(`Plugin header set to ${version}`)
