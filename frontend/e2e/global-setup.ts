import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const compose = 'docker compose -p miniplan-e2e -f docker-compose.e2e.yml'
const baseUrl = 'http://localhost:8100'

async function waitUntilReady(url: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server noch nicht erreichbar, weiter warten
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Server unter ${url} war nach ${timeoutMs}ms nicht erreichbar`)
}

export default async function globalSetup(): Promise<void> {
  execSync(`${compose} down --volumes --remove-orphans`, { cwd: repoRoot, stdio: 'ignore' })
  try {
    execSync(`${compose} up -d --build`, { cwd: repoRoot, stdio: 'inherit' })
    await waitUntilReady(`${baseUrl}/docs`)
  } catch (err) {
    execSync(`${compose} down --volumes --remove-orphans`, { cwd: repoRoot, stdio: 'ignore' })
    throw err
  }
}
