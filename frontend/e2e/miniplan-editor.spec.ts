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

// Das Datum-Feld ist ein Kalender-Popover (Button + <=Portal-Overlay>) statt eines nativen
// <input type="date">, daher hier gezielt den Trigger-Button öffnen und den Tag im
// Monatsraster anklicken statt `.fill()` zu verwenden. Da `jahr`/`monat` des Miniplans an
// DateInput durchgereicht werden, öffnet sich der Kalender direkt im richtigen Monat.
async function waehleDatum(
  page: import('@playwright/test').Page,
  form: import('@playwright/test').Locator,
  tag: number,
) {
  await form.getByLabel('Datum').click()
  await page.getByRole('button', { name: String(tag), exact: true }).click()
}

test('Nutzer kann Miniplan mit Gottesdienst und Dienstbedarf befüllen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('MP-Obermini')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  // Großzügigere Timeouts für Assertions direkt nach einem Backend-Roundtrip: die e2e-Umgebung
  // teilt einen einzelnen Docker-Container/eine einzelne SQLite-DB über alle parallel laufenden
  // Playwright-Worker hinweg, wodurch Anfragen unter Last spürbar langsamer werden können.
  await expect(page.getByText('MP-Obermini', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('MP-Mini')
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt und
  // ändert sich laufend - ohne Auswahl wählt das Formular per Default einfach die erste Gruppe der
  // (fremdbestimmten) Liste, was zu einer Race Condition führen kann, falls diese Default-Gruppe
  // gerade von einem anderen Test gelöscht wird. Daher hier bewusst die selbst angelegte
  // "MP-Obermini" explizit auswählen.
  await miniForm.getByLabel('MP-Obermini', { exact: true }).click({ force: true })
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('MP-Mini')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('MP-Weihrauch')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'MP-Obermini' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× MP-Obermini')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Minipläne' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)

  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('7')
  await miniplanForm.getByLabel('Jahr').fill('2031')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan Juli 2031' })).toBeVisible()

  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await waehleDatum(page, gottesdienstForm, 6)
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Sonntagsmesse')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Sonntagsmesse')

  // Dienst-Typen werden per One-Click-Button hinzugefügt (statt Select + "Hinzufügen").
  await page.getByRole('button', { name: 'MP-Weihrauch', exact: true }).click()
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })

  const anzahlFelder = page.locator('input[type="number"]')
  await anzahlFelder.first().fill('3')

  await page.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await page.getByLabel('Name des Dienstes').fill('Alle Ministranten')

  // Details-Bereich (Filtertags/Gruppen-Mindestanzahl/manuelle Zuweisung/Plan-Anzeige) ist
  // standardmäßig eingeklappt - vor der Mini-Zuweisung öffnen.
  await page.getByRole('button', { name: 'Details' }).last().click()

  // Kein expliziter Speichern-Button mehr: Änderungen werden debounced automatisch gespeichert
  // (Item 13). Da der Default-Status der Anzeige ebenfalls "Gespeichert" lautet (Ruhezustand vor
  // der allerersten Änderung), auf die tatsächliche Autosave-Anfrage warten statt auf den Text -
  // sonst könnte ein nachfolgender Reload dem Debounce (800ms) zuvorkommen und ungespeicherte
  // Änderungen wirkten fälschlich verloren.
  const autosaveAbgeschlossen = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
  await page.getByLabel('MP-Mini').first().click({ force: true })
  await autosaveAbgeschlossen
  await expect(page.getByLabel('Name des Dienstes')).toHaveValue('Alle Ministranten')

  // Die PDF-Vorschau rendert seit dem Frontend-Redesign direkt über react-pdf/<canvas> statt über
  // ein <iframe> mit Object-URL - hier daher auf das gerenderte <canvas> statt auf ein iframe-`src`
  // prüfen.
  const vorschauCanvas = page.locator('canvas').first()
  await expect(vorschauCanvas).toBeVisible({ timeout: 10_000 })

  await page.reload()
  // Anders als direkt nach dem Anlegen (Item 14: automatisch aufgeklappt) ist die Gottesdienst-
  // Karte nach einem vollständigen Neuladen wieder eingeklappt - vor den weiteren Prüfungen daher
  // erst über die Kopfzeile aufklappen.
  await page.getByRole('button', { name: /Sonntagsmesse/ }).click()
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByLabel('Name des Dienstes')).toHaveValue('Alle Ministranten')
  const weihrauchAnzahl = page.locator('input[type="number"]').first()
  await expect(weihrauchAnzahl).toHaveValue('3')
  // Details-Bereich ist nach dem Neuladen wieder eingeklappt (progressive disclosure, Item 12).
  await page.getByRole('button', { name: 'Details' }).last().click()
  await expect(page.getByLabel('MP-Mini').first()).toBeChecked()

  const freitextGespeichert = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/miniplaene\/\d+$/.test(resp.url()),
  )
  const vorschauAktualisiert = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && /\/vorschau$/.test(resp.url()),
  )
  await page.getByLabel('Veranstaltungen').fill('Pfarrfest am 20.07.')
  await page.getByLabel('Ankündigungen').fill('Bitte pünktlich erscheinen')
  await freitextGespeichert
  await vorschauAktualisiert
  await expect(vorschauCanvas).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Veranstaltungen')).toHaveValue('Pfarrfest am 20.07.')
  await expect(page.getByLabel('Ankündigungen')).toHaveValue('Bitte pünktlich erscheinen')
})
