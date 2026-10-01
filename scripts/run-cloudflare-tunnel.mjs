import { spawn } from 'node:child_process'
import { openSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [binaryPath, tokenPath, logPath] = process.argv.slice(2)
if (!binaryPath || !tokenPath || !logPath || !existsSync(binaryPath) || !existsSync(tokenPath)) {
  process.exit(2)
}

mkdirSync(dirname(logPath), { recursive: true })
const log = openSync(logPath, 'a')
const child = spawn(binaryPath, [
  'tunnel', '--protocol', 'quic', 'run', '--token-file', tokenPath,
], {
  stdio: ['ignore', log, log],
  windowsHide: true,
})

child.on('error', () => process.exit(1))
child.on('exit', (code) => process.exit(code ?? 1))
