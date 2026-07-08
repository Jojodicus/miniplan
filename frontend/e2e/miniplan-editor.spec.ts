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

// dnd-kit reagiert auf Pointer-Events (nicht die HTML5-Drag-API), Playwrights `dragTo()` greift
// hier daher nicht - stattdessen Pointer-Bewegung in mehreren Schritten simulieren, damit der
// PointerSensor die Aktivierungs-Distanz überschreitet und den Drag tatsächlich startet.
async function ziehe(
  page: import('@playwright/test').Page,
  quelle: import('@playwright/test').Locator,
  ziel: import('@playwright/test').Locator,
) {
  const quellBox = await quelle.boundingBox()
  const zielBox = await ziel.boundingBox()
  if (!quellBox || !zielBox) throw new Error('Drag-Quelle oder -Ziel nicht sichtbar')
  // Nicht die exakte Mitte der Chips treffen: Chips mit Entfernen-Button ("×") haben den Button
  // rechts außen - ein Klick genau in der Mitte könnte je nach Textlänge auf dem Button statt auf
  // dem (ziehbaren) Chip selbst landen. Ein Punkt im linken Text-Drittel ist sicherer.
  const startX = quellBox.x + quellBox.width * 0.25
  const startY = quellBox.y + quellBox.height / 2
  const endX = zielBox.x + zielBox.width * 0.25
  const endY = zielBox.y + zielBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 15, startY + 15, { steps: 5 })
  await page.mouse.move(endX, endY, { steps: 10 })
  await page.mouse.up()
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
  // MP-Mini ist jetzt fest zugewiesen und erscheint als Chip (nicht mehr als Checkbox in der
  // "Mini hinzufügen"-Liste, aus der bereits zugewiesene Minis herausgefiltert werden).
  await expect(page.getByText('MP-Mini', { exact: true })).toBeVisible()

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

test('Nutzer kann Miniplan abschließen und das finale PDF herunterladen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await page.getByRole('link', { name: 'Minipläne' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)

  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('8')
  await miniplanForm.getByLabel('Jahr').fill('2032')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan August 2032' })).toBeVisible()

  await expect(page.getByText('In Bearbeitung')).toBeVisible()
  await expect(page.getByRole('button', { name: 'PDF herunterladen' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Plan abschließen' }).click()
  await expect(page.getByText('Abgeschlossen', { exact: true })).toBeVisible({ timeout: 10_000 })

  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF herunterladen' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('miniplan-2032-08.pdf')

  await page.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(page.getByText('In Bearbeitung')).toBeVisible({ timeout: 10_000 })
})

test('Füllen-Button teilt Minis automatisch einem Dienstbedarf zu', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('FT-Gruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('FT-Gruppe', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  for (const name of ['FT-Mini-A', 'FT-Mini-B']) {
    await miniForm.getByLabel('Name').fill(name)
    await miniForm.getByLabel('FT-Gruppe', { exact: true }).click({ force: true })
    await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
  }

  await page.getByRole('link', { name: 'Minipläne' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)

  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('9')
  await miniplanForm.getByLabel('Jahr').fill('2033')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan September 2033' })).toBeVisible()

  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await waehleDatum(page, gottesdienstForm, 4)
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Sonntagsmesse')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Sonntagsmesse')

  await page.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await page.getByLabel('Name des Dienstes').fill('Sammeldienst')
  await page.locator('input[type="number"]').first().fill('2')

  // Die geteilte Pfarrei "St. Beispiel" enthält auch Minis anderer, parallel laufender Tests -
  // eine Gruppen-Mindestanzahl "mind. 2 aus FT-Gruppe" macht die Zuteilung deterministisch
  // testbar, da FT-Gruppe nur die beiden hier angelegten Minis enthält.
  await page.getByRole('button', { name: 'Details' }).click()
  await page.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await page.locator('select').selectOption({ label: 'FT-Gruppe' })
  await page.locator('input[type="number"]').nth(1).fill('2')

  const autosaveAbgeschlossen = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
  await autosaveAbgeschlossen

  const fuellenAbgeschlossen = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && /\/fuellen$/.test(resp.url()),
  )
  await page.getByRole('button', { name: 'Füllen' }).click()
  await fuellenAbgeschlossen
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible()

  // Die Karte bleibt nach dem Anlegen (und dem Füllen-bedingten Remount, siehe
  // `zuteilungsRevision` im Editor) automatisch aufgeklappt - nur der "Details"-Bereich
  // (Filtertags/Gruppen/Zuweisungen) ist eingeklappt und muss geöffnet werden.
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByText('Automatisch zugewiesen')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('FT-Mini-A', { exact: true })).toBeVisible()
  await expect(page.getByText('FT-Mini-B', { exact: true })).toBeVisible()
})

test('Ziehen eines automatisch zugewiesenen Minis in "Fest zugewiesen" übersteht erneutes Füllen', async ({
  page,
}) => {
  // Großzügige Viewport-Höhe, damit Drag-Quelle und -Ziel gleichzeitig ohne Scrollen sichtbar
  // sind - `boundingBox()` liefert sonst Koordinaten, die durch einen Scroll zwischen den beiden
  // Aufrufen (Quelle/Ziel) veraltet wären.
  await page.setViewportSize({ width: 1280, height: 2200 })
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('DND-Gruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('DND-Gruppe', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  for (const name of ['DND-Mini-A', 'DND-Mini-B']) {
    await miniForm.getByLabel('Name').fill(name)
    await miniForm.getByLabel('DND-Gruppe', { exact: true }).click({ force: true })
    await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
  }

  await page.getByRole('link', { name: 'Minipläne' }).click()
  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('10')
  await miniplanForm.getByLabel('Jahr').fill('2034')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan Oktober 2034' })).toBeVisible()

  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await waehleDatum(page, gottesdienstForm, 1)
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Sonntagsmesse')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Sonntagsmesse')

  await page.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await page.getByLabel('Name des Dienstes').fill('Sammeldienst')
  await page.locator('input[type="number"]').first().fill('2')

  // "mind. 2 aus DND-Gruppe" macht die Zuteilung deterministisch: nur die beiden hier angelegten
  // Minis kommen für die Stelle infrage.
  await page.getByRole('button', { name: 'Details' }).click()
  await page.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await page.locator('select').selectOption({ label: 'DND-Gruppe' })
  await page.locator('input[type="number"]').nth(1).fill('2')

  const autosaveAbgeschlossen = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
  await autosaveAbgeschlossen

  await page.getByRole('button', { name: 'Füllen' }).click()
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Details' }).click()
  const autoContainer = page.getByTestId('zuweisung-container-auto')
  const festContainer = page.getByTestId('zuweisung-container-fest')
  await expect(autoContainer.getByText('DND-Mini-A', { exact: true })).toBeVisible({
    timeout: 10_000,
  })

  await ziehe(page, autoContainer.getByText('DND-Mini-A', { exact: true }), festContainer)
  // Wartet zuverlässig auf den abgeschlossenen Remount (siehe `zuteilungsRevision`): der
  // Netzwerk-Response allein wäre kein sicherer Sync-Punkt, da React den State erst danach in
  // einer eigenen Promise-Kette aktualisiert - ein "Details"-Klick direkt nach der Netzwerk-
  // Antwort könnte noch die alte (offene) Karte treffen und sie fälschlich zuklappen.
  await expect(page.getByText('Zuweisung fixiert')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(
    page.getByTestId('zuweisung-container-fest').getByText('DND-Mini-A', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Füllen' }).click()
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(
    page.getByTestId('zuweisung-container-fest').getByText('DND-Mini-A', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })
})

test('Zwei fest zugewiesene Minis lassen sich über zwei Gottesdienst-Karten hinweg per Drag tauschen', async ({
  page,
}) => {
  // Großzügige Viewport-Höhe: beide Gottesdienst-Karten sollen gleichzeitig ohne Scrollen
  // sichtbar sein (siehe Kommentar im ersten Drag-Test).
  await page.setViewportSize({ width: 1280, height: 4200 })
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByLabel('Name').fill('SWAP-Gruppe')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('SWAP-Gruppe', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('tab', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  for (const name of ['SWAP-Mini-X', 'SWAP-Mini-Y']) {
    await miniForm.getByLabel('Name').fill(name)
    await miniForm.getByLabel('SWAP-Gruppe', { exact: true }).click({ force: true })
    await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
  }

  await page.getByRole('link', { name: 'Minipläne' }).click()
  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('11')
  await miniplanForm.getByLabel('Jahr').fill('2034')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan November 2034' })).toBeVisible()

  // Beide Gottesdienste zuerst anlegen (Seite noch kurz, Datums-Popover gut erreichbar), erst
  // danach Dienst/Zuweisung je Karte ausfüllen - sonst schiebt die bereits ausgefüllte erste
  // Karte das Anlege-Formular für den zweiten Termin weit nach unten.
  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await waehleDatum(page, gottesdienstForm, 5)
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Erster Termin')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Erster Termin')

  await waehleDatum(page, gottesdienstForm, 12)
  await gottesdienstForm.getByLabel('Uhrzeit').fill('11:00')
  await gottesdienstForm.getByLabel('Name').fill('Zweiter Termin')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  // Nicht über `getByLabel('Name').nth(0)` prüfen: die Gottesdienste sind nach Datum sortiert
  // (05.11. vor 12.11.), Erster Termin bleibt also unabhängig von der Anlege-Reihenfolge an
  // Position 0 - stattdessen direkt auf die neue Karte prüfen.
  await expect(
    page.locator('.animate-rise').filter({ hasText: 'Zweiter Termin' }).getByLabel('Name', { exact: true }),
  ).toHaveValue('Zweiter Termin')

  // ".animate-rise" ist die Card-Wurzel jeder Gottesdienst-Karte - im Gegensatz zu einem generischen
  // "div"-Filter matcht das genau eine Karte statt aller (verschachtelten) divs, die den Text
  // ebenfalls enthalten.
  const ersteKarte = page.locator('.animate-rise').filter({ hasText: 'Erster Termin' })
  const zweiteKarte = page.locator('.animate-rise').filter({ hasText: 'Zweiter Termin' })

  // Die erste Karte bleibt offen (das lokale `offen`-Card-State wird nur beim ersten Mounten aus
  // `defaultOffen` übernommen, ein reines Nachladen nach dem Anlegen des zweiten Termins löst
  // keinen Remount aus).
  await ersteKarte.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await ersteKarte.getByLabel('Name des Dienstes').fill('Kreuz')
  await ersteKarte.getByRole('button', { name: 'Details' }).click()
  let autosave = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
  await ersteKarte.getByLabel('SWAP-Mini-X', { exact: true }).click({ force: true })
  await autosave

  await zweiteKarte.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await zweiteKarte.getByLabel('Name des Dienstes').fill('Kreuz')
  await zweiteKarte.getByRole('button', { name: 'Details' }).click()
  autosave = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
  await zweiteKarte.getByLabel('SWAP-Mini-Y', { exact: true }).click({ force: true })
  await autosave

  await expect(
    ersteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-X', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    zweiteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-Y', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })

  await ziehe(
    page,
    ersteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-X', { exact: true }),
    zweiteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-Y', { exact: true }),
  )
  // Wartet auf den Toast statt nur auf die Netzwerk-Antwort: React aktualisiert den State erst
  // danach in einer eigenen Promise-Kette - ein Klick direkt nach der Netzwerk-Antwort könnte
  // sonst noch die alte (offene) Karte treffen und sie fälschlich zuklappen.
  await expect(page.getByText('Zuweisungen getauscht')).toBeVisible({ timeout: 10_000 })

  // Der Tausch löst über `zuteilungsRevision` einen Remount aller Karten aus - danach ist wieder
  // nur die zuletzt angelegte ("Zweiter Termin") automatisch aufgeklappt, "Erster Termin" muss
  // über die Kopfzeile erneut geöffnet werden; die "Details"-Bereiche sind in beiden Karten
  // frisch eingeklappt.
  await ersteKarte.getByRole('button', { name: /Erster Termin/ }).click()
  await ersteKarte.getByRole('button', { name: 'Details' }).click()
  await zweiteKarte.getByRole('button', { name: 'Details' }).click()

  await expect(
    ersteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-Y', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    zweiteKarte.getByTestId('zuweisung-container-fest').getByText('SWAP-Mini-X', { exact: true }),
  ).toBeVisible({ timeout: 10_000 })
})
