import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

// Der Pfarrei-Name auf dem Dashboard ist selbst kein Link (nur die "Stammdaten"/"Miniplaene"-
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

test('Nutzer kann Miniplan mit Gottesdienst und Dienstbedarf befüllen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Neue Gruppe').fill('MP-Obermini')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  // Großzügigere Timeouts für Assertions direkt nach einem Backend-Roundtrip: die e2e-Umgebung
  // teilt einen einzelnen Docker-Container/eine einzelne SQLite-DB über alle parallel laufenden
  // Playwright-Worker hinweg, wodurch Anfragen unter Last spürbar langsamer werden können.
  await expect(page.getByText('MP-Obermini', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('MP-Mini')
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt und
  // ändert sich laufend - ohne Auswahl wählt das Formular per Default einfach die erste Gruppe der
  // (fremdbestimmten) Liste, was zu einer Race Condition führen kann, falls diese Default-Gruppe
  // gerade von einem anderen Test gelöscht wird. Daher hier bewusst die selbst angelegte
  // "MP-Obermini" explizit auswählen.
  await miniForm.getByLabel('Gruppe').selectOption({ label: 'MP-Obermini' })
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('MP-Mini')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('MP-Weihrauch')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'MP-Obermini' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× MP-Obermini')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Zu den Miniplänen' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)

  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('7')
  await miniplanForm.getByLabel('Jahr').fill('2031')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan 7/2031' })).toBeVisible()

  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await gottesdienstForm.getByLabel('Datum').fill('2031-07-06')
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Sonntagsmesse')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Sonntagsmesse')

  await page.getByLabel('Dienst-Typ hinzufügen').selectOption({ label: 'MP-Weihrauch' })
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })

  const anzahlFelder = page.locator('input[type="number"]')
  await anzahlFelder.first().fill('3')

  await page.getByRole('button', { name: 'Freitext-Dienst hinzufügen' }).click()
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

  const vorschauIframe = page.locator('iframe[title="Miniplan-PDF-Vorschau"]')
  await expect(vorschauIframe).toHaveAttribute('src', /^blob:/, { timeout: 10_000 })
  const ersteVorschauSrc = await vorschauIframe.getAttribute('src')

  await page.reload()
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
  await page.getByLabel('Veranstaltungen').fill('Pfarrfest am 20.07.')
  await page.getByLabel('Ankündigungen').fill('Bitte pünktlich erscheinen')
  await freitextGespeichert

  await expect
    .poll(async () => vorschauIframe.getAttribute('src'), { timeout: 10_000 })
    .not.toBe(ersteVorschauSrc)

  await page.reload()
  await expect(page.getByLabel('Veranstaltungen')).toHaveValue('Pfarrfest am 20.07.')
  await expect(page.getByLabel('Ankündigungen')).toHaveValue('Bitte pünktlich erscheinen')
})
