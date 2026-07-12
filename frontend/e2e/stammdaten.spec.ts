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
  // "Neu anlegen" öffnet seit dem Redesign ein zentriertes Modal (role=dialog) über den
  // "+ …"-Button in der Kartenkopfzeile statt eines Formulars am Karten-Ende.
  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByRole('button', { name: 'Gruppe', exact: true }).click()
  const gruppeDialog = page.getByRole('dialog')
  await gruppeDialog.getByLabel('Name').fill('Sondergruppe')
  await gruppeDialog.getByRole('button', { name: 'Anlegen' }).click()
  // Großzügigere Timeouts für Assertions direkt nach einem Backend-Roundtrip: die e2e-Umgebung
  // teilt einen einzelnen Docker-Container/eine einzelne SQLite-DB über alle parallel laufenden
  // Playwright-Worker hinweg, wodurch Anfragen unter Last spürbar langsamer werden können.
  await expect(page.getByText('Sondergruppe', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Minis' }).click()
  await page.getByRole('button', { name: 'Mini', exact: true }).click()
  const miniDialog = page.getByRole('dialog')
  await miniDialog.getByLabel('Name').fill('Max Muster')
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt und
  // ändert sich laufend - daher bewusst die selbst angelegte "Sondergruppe" explizit auswählen.
  await miniDialog.getByLabel('Sondergruppe', { exact: true }).click({ force: true })
  await miniDialog.getByLabel('Schüler', { exact: true }).click({ force: true })
  await miniDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Max Muster')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Dienst-Typen' }).click()
  await page.getByRole('button', { name: 'Dienst-Typ', exact: true }).click()
  const dienstTypDialog = page.getByRole('dialog')
  // exact: true, sonst matcht getByLabel('Name') auch die Checkbox "Name auf dem Plan zeigen".
  await dienstTypDialog.getByLabel('Name', { exact: true }).fill('Kreuz tragen')
  // Frühere Beschriftung "Standard-Anzahl" ist jetzt "Übliche Besetzung" (klarer für Erstnutzer).
  await dienstTypDialog.getByLabel('Übliche Besetzung').fill('2')
  await dienstTypDialog.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypDialog.locator('select').selectOption({ label: 'Sondergruppe' })
  // Reihenfolge der Zahlen-Felder: [0] übliche Besetzung, [1] Gruppen-Mindestanzahl.
  await dienstTypDialog.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('mind. 1× Sondergruppe')).toBeVisible({ timeout: 15_000 })
})

test('Nutzer kann Verfügbarkeits-Status anlegen und Zeitfenster hinzufügen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('tab', { name: 'Verfügbarkeits-Status' }).click()

  await page.getByRole('button', { name: 'Status', exact: true }).click()
  const statusDialog = page.getByRole('dialog')
  await statusDialog.getByLabel('Bezeichnung').fill('Azubi')
  await statusDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Azubi', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Die Sperrzeiten-Sektion ist standardmäßig eingeklappt und muss erst über den Toggle in der
  // Zeile des neu angelegten Verfügbarkeits-Status geöffnet werden. Das Wochenraster ist die
  // Hauptansicht (Ziehen zum Anlegen) - für minutengenaue Eingaben bleibt das Text-Formular über
  // einen zusätzlichen Link erreichbar.
  const azubiZeile = page.getByText('Azubi', { exact: true }).locator('xpath=../..')
  await azubiZeile.getByRole('button', { name: 'Sperrzeiten' }).click()

  await page.getByRole('button', { name: 'Stattdessen per Text-Formular hinzufügen' }).click()
  const zeitfensterForm = page.locator('form').filter({ hasText: 'Zeitfenster hinzufügen' }).last()
  await zeitfensterForm.getByLabel('Wochentag').selectOption('5')
  await zeitfensterForm.getByLabel('Startzeit').fill('09:00')
  await zeitfensterForm.getByLabel('Endzeit').fill('11:00')
  await zeitfensterForm.getByRole('button', { name: 'Zeitfenster hinzufügen' }).click()
  // Das neue Zeitfenster erscheint als Block im Wochenraster (Samstag-Spalte), der Zeitraum steht
  // im `title`-Attribut (Tooltip) statt als sichtbarer Text.
  const zeitfensterBlock = page.locator('[title="09:00–11:00 Uhr (bearbeiten)"]')
  await expect(zeitfensterBlock).toBeVisible({ timeout: 15_000 })

  // Klick auf den Block öffnet das Bearbeiten-Popover mit denselben Zeiten vorausgefüllt (auf den
  // Popover-Dialog scopen, da das Text-Formular mit gleich beschrifteten Feldern noch offen ist).
  await zeitfensterBlock.click()
  const bearbeitenPopover = page.getByRole('dialog').filter({ hasText: 'Sperrzeit · Samstag' })
  await expect(bearbeitenPopover.getByLabel('Startzeit')).toHaveValue('09:00')
  await expect(bearbeitenPopover.getByLabel('Endzeit')).toHaveValue('11:00')
})

test('Nutzer kann Bundesland wählen und Ferienkalender aktualisieren', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('tab', { name: 'Ferien' }).click()
  await expect(page.getByLabel('Bundesland')).toHaveValue('BY')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert, Ferienkalender aktualisiert.')).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText(/Schuljahr \d{4}\/\d{4}/).first()).toBeVisible()
})

test('Löschen einer Gruppe erfordert Inline-Bestätigung statt eines Browser-Dialogs', async ({
  page,
}) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByRole('button', { name: 'Gruppe', exact: true }).click()
  const gruppeDialog = page.getByRole('dialog')
  await gruppeDialog.getByLabel('Name').fill('LöschGruppe')
  await gruppeDialog.getByRole('button', { name: 'Anlegen' }).click()
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt -
  // gezielt über den (immer exakt gleich bleibenden) Namens-Text zur umschließenden Zeile
  // navigieren und den Button darin ansteuern.
  const nameSpan = page.getByText('LöschGruppe', { exact: true })
  await expect(nameSpan).toBeVisible({ timeout: 15_000 })
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

  await page.getByRole('tab', { name: 'Verfügbarkeit', exact: true }).click()
  await page.getByRole('tab', { name: 'Feiertage' }).click()
  await expect(page.getByText('Fronleichnam', { exact: false })).toBeVisible()
  const arbeiterFreiCheckbox = page.locator('#feiertag-fronleichnam-arbeiterfrei')
  // Fronleichnam ist ein gesetzlicher, arbeitsfreier Feiertag - ohne explizite Einstellung ist
  // arbeiter_frei daher standardmäßig true (siehe `default_arbeiter_frei`).
  await expect(arbeiterFreiCheckbox).toBeChecked()
  await arbeiterFreiCheckbox.click({ force: true })
  await expect(arbeiterFreiCheckbox).not.toBeChecked()
})
