import { expect, test } from '@playwright/test'

test('Nutzer kann sich einloggen und wird zum Dashboard weitergeleitet', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()

  await expect(page).toHaveURL('http://localhost:8100/')
  await expect(page.getByText('admin@example.com')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Meine Pfarreien' })).toBeVisible()
})

test('Login mit falschem Passwort zeigt Fehlermeldung', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('falsch')
  await page.getByRole('button', { name: 'Anmelden' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('Pfarrei-Karussell zeigt Karten und lässt sich durchsuchen', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')

  await expect(page.getByText('St. Beispiel', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Stammdaten' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Minipläne' })).toBeVisible()

  await page.getByLabel('Pfarrei suchen').fill('nichts-passt-hier-xyz')
  await expect(page.getByText('Keine Pfarrei gefunden.')).toBeVisible()
  await expect(page.getByText('St. Beispiel', { exact: true })).toHaveCount(0)

  await page.getByLabel('Pfarrei suchen').fill('St. Beispiel')
  await expect(page.getByText('St. Beispiel', { exact: true })).toBeVisible()
})
