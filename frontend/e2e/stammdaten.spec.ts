import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

test('Nutzer kann Gruppe, Mini und Dienst-Typ anlegen', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  const gruppenSection = page.locator('section', { has: page.getByRole('heading', { name: 'Gruppen' }) })
  await gruppenSection.getByLabel('Neue Gruppe').fill('Obermini')
  await gruppenSection.getByRole('button', { name: 'Gruppe anlegen' }).click()
  await expect(gruppenSection.locator('li span', { hasText: 'Obermini' })).toBeVisible()

  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('Max Muster')
  await miniForm.getByLabel('Schüler', { exact: true }).check()
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('Max Muster (Obermini) – Schüler')).toBeVisible()

  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('Weihrauch')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByLabel('Obermini').check()
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('Weihrauch (2, nur Obermini)')).toBeVisible()
})
