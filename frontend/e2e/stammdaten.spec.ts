import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

// Der Pfarrei-Name auf dem Dashboard ist selbst kein Link (nur die "Stammdaten"/"Minipläne"-
// Kacheln darunter sind Links) - daher hier gezielt die Karte der Pfarrei anhand des Namens
// finden und darin auf "Stammdaten" navigieren.
async function zuStammdaten(page: import('@playwright/test').Page, pfarreiName: string) {
  await page
    .locator('div')
    .filter({ hasText: new RegExp(`^${pfarreiName}$`) })
    .locator('..')
    .getByRole('link', { name: 'Stammdaten' })
    .click()
}

test('Nutzer kann Gruppe, Mini und Dienst-Typ mit Gruppen-Mindestanzahl anlegen', async ({
  page,
}) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  // "St. Beispiel" wird per `create-pfarrei` mit Default-Stammdaten geseedet (Gruppen Neu/
  // Normal/Obermini, DienstTypen Sonntagsmesse/Weihrauch/Wochentagsmesse, Filtertags
  // grundschueler/schueler/arbeiter) - daher hier bewusst andere Namen verwenden.
  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('Sondergruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  // Großzügigere Timeouts für Assertions direkt nach einem Backend-Roundtrip: die e2e-Umgebung
  // teilt einen einzelnen Docker-Container/eine einzelne SQLite-DB über alle parallel laufenden
  // Playwright-Worker hinweg, wodurch Anfragen unter Last spürbar langsamer werden können.
  await expect(page.getByText('Sondergruppe', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('Max Muster')
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt und
  // ändert sich laufend (andere Tests legen Gruppen an/löschen sie) - das Formular wählt ohne
  // Auswahl standardmäßig einfach die erste Gruppe der (fremdbestimmten) Liste, was zu einer Race
  // Condition führen kann, falls diese Default-Gruppe gerade von einem anderen Test gelöscht wird.
  // Daher hier bewusst die selbst angelegte "Sondergruppe" explizit auswählen.
  await miniForm.getByLabel('Gruppe').selectOption({ label: 'Sondergruppe' })
  await miniForm.getByLabel('Schüler', { exact: true }).click({ force: true })
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('Max Muster')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('Kreuz tragen')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'Sondergruppe' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× Sondergruppe')).toBeVisible({ timeout: 15_000 })
})

test('Nutzer kann Verfügbarkeits-Status anlegen und Zeitfenster hinzufügen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('button', { name: 'Verfügbarkeits-Status' }).click()

  const anlegenForm = page.locator('form').filter({ hasText: 'Anlegen' }).last()
  await anlegenForm.getByLabel('Bezeichnung').fill('Azubi')
  await anlegenForm.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Azubi', { exact: true })).toBeVisible({ timeout: 15_000 })

  const zeitfensterForm = page.locator('form').filter({ hasText: 'Zeitfenster hinzufügen' }).last()
  await zeitfensterForm.getByLabel('Wochentag').selectOption('5')
  await zeitfensterForm.getByLabel('Startzeit').fill('09:00')
  await zeitfensterForm.getByLabel('Endzeit').fill('11:00')
  await zeitfensterForm.getByRole('button', { name: 'Zeitfenster hinzufügen' }).click()
  // Der Wochentag steht als eigene Überschrift (<p>) über der Zeitfenster-Gruppe, nicht als
  // Teil des Textes selbst - "Samstag" kommt sonst auch als <option> in jedem Wochentag-Select
  // vor, daher hier gezielt auf das <p>-Element eingrenzen.
  await expect(page.locator('p', { hasText: 'Samstag' })).toBeVisible()
  await expect(page.getByText('09:00–11:00 Uhr')).toBeVisible()
})

test('Nutzer kann Bundesland wählen und Ferienkalender aktualisieren', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('button', { name: 'Ferien' }).click()
  await expect(page.getByLabel('Bundesland')).toHaveValue('BY')
  await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click()
  await expect(page.getByText('Ferienkalender aktualisiert.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Schuljahr \d{4}\/\d{4}/).first()).toBeVisible()
})

test('Löschen einer Gruppe erfordert Inline-Bestätigung statt eines Browser-Dialogs', async ({
  page,
}) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('LöschGruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt -
  // ein globales `.last()` auf den "Löschen"-Button wäre eine Race-Condition, sobald ein anderer
  // Test parallel eine weitere Gruppe anlegt. Stattdessen gezielt über den (immer exakt gleich
  // bleibenden) Namens-Text zur umschließenden Zeile navigieren und den Button darin ansteuern -
  // funktioniert unabhängig davon, ob gerade der Löschen- oder der Bestätigen/Abbrechen-Zustand
  // gerendert wird.
  const nameSpan = page.getByText('LöschGruppe', { exact: true })
  await expect(nameSpan).toBeVisible()
  const zeile = nameSpan.locator('..')

  const loeschenButton = zeile.getByRole('button', { name: 'Löschen' })
  await loeschenButton.click()

  // Statt eines nativen confirm()-Dialogs erscheint inline ein Bestätigen/Abbrechen-Paar.
  await expect(zeile.getByText('Wirklich löschen?')).toBeVisible()

  // Abbrechen verwirft ohne Request - die Gruppe bleibt bestehen.
  await zeile.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(nameSpan).toBeVisible()

  await loeschenButton.click()
  await zeile.getByRole('button', { name: 'Löschen bestätigen' }).click()

  await expect(page.getByText('Gruppe gelöscht')).toBeVisible({ timeout: 15_000 })
  await expect(nameSpan).toHaveCount(0, { timeout: 15_000 })
})

test('Nutzer kann Feiertags-Einstellung für Fronleichnam umschalten', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('button', { name: 'Feiertage' }).click()
  await expect(page.getByText('Fronleichnam', { exact: false })).toBeVisible()
  const arbeiterFreiCheckbox = page.locator('#feiertag-fronleichnam-arbeiterfrei')
  // Fronleichnam ist ein gesetzlicher, arbeitsfreier Feiertag - ohne explizite Einstellung ist
  // arbeiter_frei daher standardmäßig true (siehe `default_arbeiter_frei`).
  await expect(arbeiterFreiCheckbox).toBeChecked()
  await arbeiterFreiCheckbox.click({ force: true })
  await expect(arbeiterFreiCheckbox).not.toBeChecked()
})
