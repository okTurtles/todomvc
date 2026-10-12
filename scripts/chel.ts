import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

// The entry point comes from the package's own `bin` field rather than PATH,
// so this also works when a script is run with plain `node`, where
// node_modules/.bin is not on PATH.
const manifestPath = require.resolve('@chelonia/cli/package.json')
const { bin } = require(manifestPath)
const CHEL_BIN = path.join(
  path.dirname(manifestPath),
  typeof bin === 'string' ? bin : bin.chel
)

export function chel (args: string[]): void {
  const { status, signal } = spawnSync(process.execPath, [CHEL_BIN, ...args], {
    stdio: 'inherit'
  })
  if (status !== 0) {
    throw new Error(`chel ${args.join(' ')} exited with ${status ?? signal}`)
  }
}

// Allow `node scripts/chel.ts <args>` as a drop-in for the `chel` command.
// fileURLToPath, not URL.pathname: pathname is percent-encoded, so a checkout
// path containing a space would never match and this would silently do nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  chel(process.argv.slice(2))
}
