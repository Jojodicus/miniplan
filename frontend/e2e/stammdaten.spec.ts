import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

test('Nutzer kann Gruppe, Mini und Dienst-Typ mit Gruppen-Mindestanzahl anlegen', async ({
  page,
}) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Neue Gruppe').fill('Obermini')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Obermini', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('Max Muster')
  await miniForm.getByLabel('Schüler', { exact: true }).click({ force: true })
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('Max Muster')).toBeVisible()

  await page.getByRole('button', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('Weihrauch')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'Obermini' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× Obermini')).toBeVisible()
})

test('Nutzer kann Verfügbarkeits-Blocker für einen Filtertag anlegen', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Verfügbarkeit' }).click()
  const blockerForm = page.locator('form').filter({ hasText: 'Blocker anlegen' })
  await blockerForm.getByLabel('Filtertag').selectOption('schueler')
  await blockerForm.getByLabel('Wochentag').selectOption('0')
  await blockerForm.getByLabel('Startzeit').fill('08:00')
  await blockerForm.getByLabel('Endzeit').fill('13:00')
  await blockerForm.getByRole('button', { name: 'Blocker anlegen' }).click()
  await expect(page.getByText('Montag, 08:00–13:00 Uhr')).toBeVisible()
})

test('Nutzer kann Bundesland wählen und Ferienkalender aktualisieren', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Ferien' }).click()
  await expect(page.getByLabel('Bundesland')).toHaveValue('BY')
  await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click()
  await expect(page.getByText('Ferienkalender aktualisiert.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Schuljahr \d{4}\/\d{4}/).first()).toBeVisible()
})

test('Nutzer kann Feiertags-Einstellung für Fronleichnam umschalten', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Feiertage' }).click()
  await expect(page.getByText('Fronleichnam', { exact: false })).toBeVisible()
  const arbeiterFreiCheckbox = page.locator('#feiertag-fronleichnam-arbeiterfrei')
  await expect(arbeiterFreiCheckbox).not.toBeChecked()
  await arbeiterFreiCheckbox.click({ force: true })
  await expect(arbeiterFreiCheckbox).toBeChecked()
})
