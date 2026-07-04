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

  // "St. Beispiel" wird per `create-pfarrei` mit Default-Stammdaten geseedet (Gruppen Neu/
  // Normal/Obermini, DienstTypen Sonntagsmesse/Weihrauch/Wochentagsmesse, Filtertags
  // grundschueler/schueler/arbeiter) - daher hier bewusst andere Namen verwenden.
  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Neue Gruppe').fill('Sondergruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sondergruppe', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('Max Muster')
  await miniForm.getByLabel('Schüler', { exact: true }).click({ force: true })
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('Max Muster')).toBeVisible()

  await page.getByRole('button', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('Kreuz tragen')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'Sondergruppe' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× Sondergruppe')).toBeVisible()
})

test('Nutzer kann Verfügbarkeits-Status anlegen und Zeitfenster hinzufügen', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Verfügbarkeits-Status' }).click()

  const anlegenForm = page.locator('form').filter({ hasText: 'Anlegen' }).last()
  await anlegenForm.getByLabel('Key').fill('azubi')
  await anlegenForm.getByLabel('Bezeichnung').fill('Azubi')
  await anlegenForm.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Azubi', { exact: true })).toBeVisible()

  const zeitfensterForm = page.locator('form').filter({ hasText: 'Zeitfenster hinzufügen' }).last()
  await zeitfensterForm.getByLabel('Wochentag').selectOption('5')
  await zeitfensterForm.getByLabel('Startzeit').fill('09:00')
  await zeitfensterForm.getByLabel('Endzeit').fill('11:00')
  await zeitfensterForm.getByRole('button', { name: 'Zeitfenster hinzufügen' }).click()
  await expect(page.getByText('Samstag, 09:00–11:00 Uhr')).toBeVisible()
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
  // Fronleichnam ist ein gesetzlicher, arbeitsfreier Feiertag - ohne explizite Einstellung ist
  // arbeiter_frei daher standardmäßig true (siehe `default_arbeiter_frei`).
  await expect(arbeiterFreiCheckbox).toBeChecked()
  await arbeiterFreiCheckbox.click({ force: true })
  await expect(arbeiterFreiCheckbox).not.toBeChecked()
})
