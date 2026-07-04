import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export default async function globalTeardown(): Promise<void> {
  execSync('docker compose -p miniplan-e2e -f docker-compose.e2e.yml down --volumes --remove-orphans', {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}
