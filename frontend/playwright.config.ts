import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Alle Worker teilen sich einen einzelnen Docker-Container mit einer einzelnen SQLite-DB und
  // einem einzigen (nicht mit --workers skalierten) Uvicorn-Prozess, siehe docker-compose.e2e.yml
  // - Playwrights CPU-Kern-basiertes Default (auf vielkernigen Maschinen oft >10) überlastet
  // diesen einen Prozess dann so, dass Requests unter Last einzelne Timeouts reißen. Ein festes,
  // niedrigeres Limit macht lokale Läufe zuverlässiger auf Kosten etwas längerer Laufzeit.
  workers: 4,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
