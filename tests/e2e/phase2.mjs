/**
 * End-to-End Phase 2: Aktionen, Reihen, Notizen, Kalender, Isolation.
 * Läuft NACH tests/e2e/flow.mjs auf derselben Datenbank (nutzt Lena als Org-Admin und den Superadmin).
 *
 *   E2E_BASE_URL=http://localhost:3000 E2E_MAIL_LOG=/tmp/juna.log node tests/e2e/phase2.mjs
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const MAIL_LOG = process.env.E2E_MAIL_LOG ?? '/tmp/juna.log';
const SHOTS = process.env.E2E_SCREENSHOTS; // optionaler Ordner für Screenshots
const log = (...a) => console.log('•', ...a);

function lastLink(email) {
  const txt = fs.readFileSync(MAIL_LOG, 'utf8');
  const blocks = txt.split('[mail:dev] An: ').filter((b) => b.startsWith(email));
  const m = blocks.at(-1)?.match(/https?:\/\/\S+\/passwort-setzen\?token=[\w-]+/);
  if (!m) throw new Error('kein Link für ' + email);
  return m[0];
}
async function login(page, email, pw) {
  await page.goto(BASE + '/login');
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function createAction(page, { title, series, date, start, end, location, status }) {
  await page.goto(BASE + '/aktionen/neu');
  if (series) await page.selectOption('#seriesId', { label: series });
  await page.fill('#title', title);
  if (date !== undefined) await page.fill('#date', date);
  if (status) await page.selectOption('#status', status);
  if (start) await page.fill('#startTime', start);
  if (end) await page.fill('#endTime', end);
  if (location) await page.fill('#location', location);
  await Promise.all([
    page.waitForURL(/\/aktionen\/[0-9a-f-]{36}$/),
    page.getByRole('button', { name: 'Aktion anlegen' }).click(),
  ]);
  return page.url().split('/').pop();
}
async function waitSaved(page) {
  await page.locator('[data-save-state="saved"]').getByText(/Gespeichert um/).waitFor({ timeout: 10000 });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const lena = await ctx.newPage();
  await login(lena, 'lena@test.de', 'Lena-Neu-456789');
  log('Lena eingeloggt');

  // Reihe anlegen
  await lena.goto(BASE + '/aktionen/reihen');
  await lena.fill('#neu-name', 'Kuchenverkauf');
  await lena.fill('#neu-description', 'Mehrmals im Jahr nach dem Gottesdienst');
  await lena.getByRole('button', { name: 'Reihe anlegen' }).click();
  await lena.getByText('Reihe „Kuchenverkauf“ angelegt').waitFor();
  log('Reihe angelegt');

  // Validierung: geplant ohne Datum
  await lena.goto(BASE + '/aktionen/neu');
  await lena.fill('#title', 'Ohne Datum');
  await lena.getByRole('button', { name: 'Aktion anlegen' }).click();
  await lena.getByText('Ohne Datum ist die Aktion eine Idee').waitFor();
  if ((await lena.inputValue('#title')) !== 'Ohne Datum') throw new Error('Titel nach Fehler verloren');
  log('Validierung „Datum fehlt“ greift, Eingaben bleiben');

  // Erste Durchführung mit Notizen
  const ostern = await createAction(lena, {
    title: 'Kuchenverkauf Ostern', series: 'Kuchenverkauf', date: '2027-04-04', start: '10:00', end: '13:00', location: 'Pfarrheim',
  });
  await lena.getByRole('heading', { name: /Kuchenverkauf Ostern/ }).waitFor();
  await lena.locator('.bn-editor').click();
  await lena.keyboard.type('# Ablauf');
  await lena.keyboard.press('Enter');
  await lena.keyboard.type('- Aufbau ab 9 Uhr');
  await lena.keyboard.press('Enter');
  await lena.keyboard.type('Kasse mitbringen');
  await lena.keyboard.press('Enter');
  await lena.keyboard.press('Enter');
  await lena.keyboard.type('[] Plakat drucken');
  await waitSaved(lena);
  await shot(lena, 'p2-detail-desktop');
  await lena.reload();
  await lena.locator('.bn-editor h1, .bn-editor [data-content-type="heading"]').first().waitFor();
  const text = await lena.locator('.bn-editor').innerText();
  for (const t of ['Ablauf', 'Aufbau ab 9 Uhr', 'Kasse mitbringen', 'Plakat drucken']) {
    if (!text.includes(t)) throw new Error('Notiz fehlt nach Reload: ' + t);
  }
  log('Notizen mit Markdown-Shortcuts gespeichert und nach Reload vorhanden');

  // Neue Durchführung über die Reihe → Historie zeigt Ostern inkl. Notizen
  await lena.getByRole('link', { name: 'Neue Durchführung' }).click();
  await lena.waitForURL('**/aktionen/neu?reihe=*');
  if ((await lena.inputValue('#title')) !== 'Kuchenverkauf Ostern') throw new Error('Titel nicht vorgeschlagen');
  if ((await lena.inputValue('#location')) !== 'Pfarrheim') throw new Error('Ort nicht vorgeschlagen');
  await lena.fill('#title', 'Kuchenverkauf Pfingsten');
  await lena.fill('#date', '2027-05-16');
  await Promise.all([lena.waitForURL(/\/aktionen\/[0-9a-f-]{36}$/), lena.getByRole('button', { name: 'Aktion anlegen' }).click()]);
  // Unter 1536 px steht die Historie im Tab „Historie“, ab 2xl in der Seitenleiste
  await lena.getByRole('link', { name: 'Historie' }).click();
  await lena.waitForURL(/tab=historie/);
  const aside = lena.locator('main li', { hasText: 'Kuchenverkauf Ostern' }).first();
  await aside.getByRole('link', { name: 'Kuchenverkauf Ostern' }).first().waitFor();
  await aside.getByText('ABLAUF').waitFor();
  await aside.getByText('☐ Plakat drucken').waitFor();
  log('Neue Durchführung: Vorschläge übernommen, Historie zeigt Notizen vom letzten Mal');

  // Vergangene Aktion + Idee
  await createAction(lena, { title: 'Kuchenverkauf Herbst', series: 'Kuchenverkauf', date: '2026-10-04', status: 'durchgefuehrt' });
  await createAction(lena, { title: 'Kinderdisco', date: '', status: 'idee' });
  await lena.goto(BASE + '/aktionen');
  await lena.getByRole('link', { name: /Kuchenverkauf Ostern/ }).waitFor();
  if (await lena.getByRole('link', { name: /Kuchenverkauf Herbst/ }).isVisible()) throw new Error('Vergangene Aktion in „Kommend“');
  await lena.goto(BASE + '/aktionen?ansicht=vergangen');
  await lena.getByText('Kuchenverkauf Herbst').waitFor();
  await lena.goto(BASE + '/aktionen?ansicht=ideen');
  await lena.getByText('Kinderdisco').waitFor();
  log('Listen Kommend / Vergangen / Ideen korrekt');

  await lena.goto(BASE + '/aktionen?ansicht=kalender&monat=2027-04');
  await lena.getByRole('heading', { name: 'April 2027' }).waitFor();
  await lena.locator('a[title="Kuchenverkauf Ostern"]').waitFor();
  await shot(lena, 'p2-kalender-desktop');
  log('Kalender April 2027 zeigt Ostern');

  await lena.goto(BASE + '/uebersicht');
  await lena.getByText('Kuchenverkauf Ostern').first().waitFor();
  await lena.getByText('1 Idee ohne Termin').waitFor();
  log('Übersicht zeigt nächste Aktionen und Ideen');

  // Konflikt: zwei Fenster bearbeiten gleichzeitig
  const second = await ctx.newPage();
  await second.goto(`${BASE}/aktionen/${ostern}`);
  await second.locator('.bn-editor').waitFor();
  await lena.goto(`${BASE}/aktionen/${ostern}`);
  await lena.locator('.bn-editor').click();
  await lena.keyboard.press('Control+End');
  await lena.keyboard.press('Enter');
  await lena.keyboard.type('Ergänzung von Fenster A');
  await waitSaved(lena);
  await second.locator('.bn-editor').click();
  await second.keyboard.press('Control+End');
  await second.keyboard.type(' (Fenster B)');
  await second.getByText('Jemand anderes hat die Notizen inzwischen geändert').waitFor({ timeout: 10000 });
  log('Gleichzeitige Bearbeitung erkannt (Konflikt-Hinweis)');
  await second.close();

  // Mobile Ansichten
  const phone = await b.newContext({ ...devices['iPhone 13'] });
  const lenaPhone = await phone.newPage();
  await login(lenaPhone, 'lena@test.de', 'Lena-Neu-456789');
  await lenaPhone.goto(BASE + '/aktionen');
  await lenaPhone.getByText('Kuchenverkauf Pfingsten', { exact: true }).waitFor();
  await shot(lenaPhone, 'p2-liste-mobil');
  await lenaPhone.goto(`${BASE}/aktionen/${ostern}`);
  await lenaPhone.locator('.bn-editor').waitFor();
  await shot(lenaPhone, 'p2-detail-mobil');
  await lenaPhone.goto(`${BASE}/aktionen?ansicht=kalender&monat=2027-04`);
  await lenaPhone.getByText('Kuchenverkauf Ostern', { exact: true }).waitFor();
  if (await lenaPhone.locator('a[title="Kuchenverkauf Ostern"]').isVisible()) throw new Error('Monatsraster auf dem Handy sichtbar');
  log('Mobil: Liste, Detail, Kalender-Liste ok');

  // Isolation: zweite Organisation sieht nichts
  const anon = await (await b.newContext()).newPage();
  await anon.goto(BASE + '/registrieren');
  await anon.fill('#orgName', 'Leiterrunde Nachbarort');
  await anon.fill('#contactName', 'Nora Nachbar');
  await anon.fill('#contactEmail', 'nora@test.de');
  await anon.click('button[type=submit]');
  await anon.getByText('Antrag ist eingegangen').waitFor();
  const sa = await (await b.newContext()).newPage();
  await login(sa, 'apps@alw-mediaworks.de', 'Superadmin-Passwort-1');
  await sa.goto(BASE + '/admin');
  await sa.getByRole('button', { name: 'Freigeben' }).click();
  await sa.getByText('ist freigeschaltet').waitFor();
  const nora = await (await b.newContext()).newPage();
  await nora.goto(lastLink('nora@test.de'));
  await nora.fill('#password', 'Nora-Passwort-1');
  await nora.fill('#confirm', 'Nora-Passwort-1');
  await Promise.all([nora.waitForURL('**/uebersicht'), nora.click('button[type=submit]')]);
  await nora.goto(`${BASE}/aktionen/${ostern}`);
  await nora.getByText('Seite nicht gefunden').waitFor();
  for (const [path, empty] of [
    ['/aktionen?ansicht=vergangen', 'Noch keine vergangenen Aktionen'],
    ['/aktionen', 'Keine anstehenden Aktionen'],
    ['/aktionen/reihen', 'Noch keine Aktionsreihen'],
  ]) {
    await nora.goto(BASE + path);
    await nora.getByText(empty).waitFor();
    for (const name of ['Kuchenverkauf', 'Kuchenverkauf Ostern', 'Kuchenverkauf Herbst']) {
      if (await nora.getByRole('link', { name, exact: true }).count()) throw new Error('Fremde Daten sichtbar: ' + path);
    }
  }
  log('Andere Organisation sieht weder Aktion noch Reihe');

  await b.close();
  console.log('E2E PHASE 2 OK');
})().catch((e) => {
  console.error('E2E FEHLER:', e.message);
  process.exit(1);
});
