// Packages the WordPress plugin: copies the freshly built bundle into the
// plugin folder and zips it ready for upload on the Plugins screen.
// Run via `npm run build:wp` (which builds first).
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = resolve(root, 'dist/sorcery-puzzle.js')
const pluginDir = resolve(root, 'wordpress/sorcery-puzzle')
const zip = resolve(root, 'sorcery-puzzle.zip')

if (!existsSync(bundle)) {
  console.error('dist/sorcery-puzzle.js not found — run `npm run build` first.')
  process.exit(1)
}

mkdirSync(resolve(pluginDir, 'dist'), { recursive: true })
copyFileSync(bundle, resolve(pluginDir, 'dist/sorcery-puzzle.js'))
console.log('Copied bundle into wordpress/sorcery-puzzle/dist/')

if (existsSync(zip)) rmSync(zip)
try {
  if (process.platform === 'win32') {
    // Not Compress-Archive or .NET ZipFile: under Windows PowerShell both
    // write backslash entry names, which break extraction on the Linux
    // hosts WordPress usually runs on. Windows 10+ ships bsdtar, which
    // writes spec-compliant zips (-a picks the format from the extension).
    // Windows' built-in bsdtar writes spec-compliant zips. Called by full
    // path because a GNU tar earlier in PATH (e.g. Git Bash) can't write
    // zip and would silently produce a tar file. Relative paths only:
    // bsdtar reads "D:" in an absolute path as a remote hostname.
    const bsdtar = resolve(
      process.env.SystemRoot || 'C:\\Windows',
      'System32/tar.exe'
    )
    execSync(
      `"${bsdtar}" -a -c -f sorcery-puzzle.zip -C wordpress sorcery-puzzle`,
      { cwd: root, stdio: 'inherit' }
    )
  } else {
    execSync(`zip -rq '${zip}' sorcery-puzzle`, {
      cwd: resolve(root, 'wordpress'),
      stdio: 'inherit',
    })
  }
  console.log('Created sorcery-puzzle.zip — upload it on the WordPress Plugins screen.')
} catch {
  console.warn(
    'Could not create the zip automatically; zip wordpress/sorcery-puzzle/ yourself or copy the folder into wp-content/plugins/.'
  )
}
