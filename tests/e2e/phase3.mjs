/**
 * End-to-End Phase 3: Zeitplan, Teilnahme (inkl. Fenster & Historie), Planungsteam, Aufgaben,
 * Datumsverschiebung, Feedback, „Aus dem letzten Mal“, „Von früherer Durchführung übernehmen“.
 * Läuft NACH flow.mjs und phase2.mjs auf derselben Datenbank.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import pg from 'pg';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const MAIL_LOG = process.env.E2E_MAIL_LOG ?? '/tmp/juna.log';
const SHOTS = process.env.E2E_SCREENSHOTS;
const DB = process.env.DATABASE_URL; // optional: zusätzliche Prüfungen direkt in der DB
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
async function actionIdByTitle(page, title) {
  await page.goto(BASE + '/aktionen');
  const href = await page.getByRole('link', { name: new RegExp(title) }).first().getAttribute('href');
  return href.split('/').pop();
}
async function addSlot(page, title, start, end, min) {
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Zum Zeitplan hinzufügen' }) });
  await form.locator('input[name=title]').fill(title);
  await form.locator('input[name=start]').fill(start);
  await form.locator('input[name=end]').fill(end);
  if (min) await form.locator('input[name=minPeople]').fill(String(min));
  await form.getByRole('button', { name: 'Zum Zeitplan hinzufügen' }).click();
  await page.getByText(`„${title}“ hinzugefügt.`).waitFor();
}
function memberRow(page, name) {
  return page.locator('li', { has: page.locator('span.font-bold', { hasText: new RegExp(`^${name}$`) }) }).first();
}

(async () => {
  const b = await chromium.launch();
  const lena = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login(lena, 'lena@test.de', 'Lena-Neu-456789');

  // Zweites aktives Mitglied: Tim
  await lena.goto(BASE + '/einstellungen/mitglieder');
  await lena.fill('#displayName', 'Tim Teamer');
  await lena.fill('#email', 'tim@test.de');
  await lena.getByRole('button', { name: 'Einladung senden' }).click();
  await lena.getByText('Tim Teamer wurde eingeladen.').waitFor();
  const timCtx = await b.newContext({ ...devices['iPhone 13'] });
  const tim = await timCtx.newPage();
  await tim.goto(lastLink('tim@test.de'));
  await tim.fill('#password', 'Tim-Passwort-1');
  await tim.fill('#confirm', 'Tim-Passwort-1');
  await Promise.all([tim.waitForURL('**/uebersicht'), tim.click('button[type=submit]')]);
  log('Tim eingeladen und aktiv');

  const ostern = await actionIdByTitle(lena, 'Kuchenverkauf Ostern');
  const pfingsten = await actionIdByTitle(lena, 'Kuchenverkauf Pfingsten');

  // Zeitplan
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=zeitplan`);
  await addSlot(lena, 'Aufbau', '08:00', '10:00', 2);
  await addSlot(lena, 'Verkauf', '10:00', '13:00');
  await addSlot(lena, 'Abbau', '13:00', '14:00', 2);
  log('Zeitplan mit 3 Slots angelegt');

  // Teilnahme: Lena selbst, Tim durch Lena (Protokollführer), Tim geht früher
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=team`);
  const meCard = lena.locator('div.rounded-2xl', { has: lena.getByText('Meine Teilnahme') }).first();
  await meCard.getByRole('button', { name: 'Dabei', exact: true }).click();
  await meCard.getByRole('button', { name: 'Dabei', exact: true, pressed: true }).waitFor();
  const timRow = memberRow(lena, 'Tim Teamer');
  await timRow.getByRole('button', { name: 'Dabei', exact: true }).click();
  await memberRow(lena, 'Tim Teamer').getByText('eingetragen von Lena Krämer').waitFor();
  await memberRow(lena, 'Tim Teamer').getByText(/Zeiten.*anpassen/).click();
  const timWindow = memberRow(lena, 'Tim Teamer').locator('form', { has: lena.locator('input[name=untilTime]') });
  await timWindow.locator('input[name=untilTime]').fill('13:00');
  await timWindow.getByRole('button', { name: /Speichern/ }).click();
  await memberRow(lena, 'Tim Teamer').getByText('geht um 13:00 Uhr').waitFor();
  log('Teilnahme: Lena selbst, Tim durch Lena eingetragen, Tim geht um 13:00');

  await lena.goto(`${BASE}/aktionen/${ostern}?tab=zeitplan`);
  const slotCard = (title) => lena.locator('li', { has: lena.locator('div.font-bold', { hasText: new RegExp(`^${title}$`) }) }).first();
  await slotCard('Aufbau').getByText('2 dabei / mind. 2').waitFor();
  await slotCard('Abbau').getByText('1 dabei / mind. 2').waitFor();
  await slotCard('Abbau').getByText('unterbesetzt').waitFor();
  if (await slotCard('Abbau').getByText('Tim Teamer').count()) throw new Error('Tim fälschlich im Abbau');
  await shot(lena, 'p3-zeitplan-desktop');
  log('Zeitplan leitet Besetzung aus dem Fenster ab, Abbau unterbesetzt');

  // Tim ändert selbst auf „vielleicht“ → Historie
  await tim.goto(`${BASE}/aktionen/${ostern}?tab=team`);
  const timMe = tim.locator('div.rounded-2xl', { has: tim.getByText('Meine Teilnahme') }).first();
  await timMe.getByRole('button', { name: 'Dabei', exact: true, pressed: true }).waitFor();
  await timMe.getByRole('button', { name: 'Vielleicht', exact: true }).click();
  await timMe.getByRole('button', { name: 'Vielleicht', exact: true, pressed: true }).waitFor();
  await shot(tim, 'p3-team-mobil');
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=team`);
  await lena.getByText(/Änderungsverlauf/).click();
  await lena.getByText('Dabei → Vielleicht').waitFor();
  log('Tim ändert selbst auf „vielleicht“, Verlauf zeigt die Änderung');

  // Planungsteam
  const plannerForm = lena.locator('form', { has: lena.getByRole('button', { name: 'Planungsteam speichern' }) });
  await plannerForm.getByText('Lena Krämer', { exact: true }).click();
  await plannerForm.getByText('Tim Teamer', { exact: true }).click();
  await plannerForm.getByRole('button', { name: 'Planungsteam speichern' }).click();
  await lena.getByText('Planungsteam gespeichert.').waitFor();
  if ((await lena.getByText('Planungsteam', { exact: true }).count()) < 2) throw new Error('Planungsteam-Badges fehlen');
  await shot(lena, 'p3-team-desktop');
  log('Planungsteam gespeichert');

  // Aufgaben
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=aufgaben`);
  const newTask = () => lena.locator('form', { has: lena.getByRole('button', { name: 'Aufgabe anlegen' }) });
  await newTask().locator('input[name=title]').fill('Plakat drucken');
  await newTask().locator('input[name=dueDaysBefore]').fill('14');
  await newTask().getByText('Tim Teamer', { exact: true }).click();
  await newTask().getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await lena.getByText('Aufgabe „Plakat drucken“ angelegt.').waitFor();
  await newTask().locator('input[name=title]').fill('Waffeleisen leihen');
  await newTask().getByText('Festes Datum').click();
  await newTask().locator('input[name=dueDate]').fill('2027-03-30');
  await newTask().getByText('Lena Krämer', { exact: true }).click();
  await newTask().getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await lena.getByText('Aufgabe „Waffeleisen leihen“ angelegt.').waitFor();
  await lena.getByText('So., 21. März').waitFor(); // 04.04. − 14 Tage
  log('Aufgaben mit relativer und fester Deadline angelegt');

  await tim.goto(BASE + '/aufgaben');
  await tim.getByText('Plakat drucken').waitFor();
  await tim.getByRole('link', { name: /Kuchenverkauf Ostern/ }).first().waitFor();
  await shot(tim, 'p3-aufgaben-mobil');
  await tim.getByRole('button', { name: '„Plakat drucken“ erledigt' }).click();
  await tim.getByText('Alles erledigt!').waitFor();
  log('Tim sieht seine Aufgabe in „Meine Aufgaben“ und hakt sie ab');

  // Datum verschieben → Zeitplan & relative Deadline wandern mit
  await lena.goto(`${BASE}/aktionen/${ostern}/bearbeiten`);
  await lena.fill('#date', '2027-04-11');
  await Promise.all([lena.waitForURL(new RegExp(`/aktionen/${ostern}$`)), lena.getByRole('button', { name: 'Speichern' }).click()]);
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=aufgaben`);
  await lena.getByText('erledigt von Tim Teamer').waitFor({ state: 'attached' });
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=zeitplan`);
  await slotCard('Aufbau').getByText('08:00–10:00').waitFor();
  if (DB) {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    const { rows } = await c.query(`select to_char(starts_at, 'YYYY-MM-DD HH24:MI') s from action_slots where action_id = $1 order by starts_at`, [ostern]);
    const w = await c.query(`select to_char(present_until, 'YYYY-MM-DD HH24:MI') u from action_participants where action_id = $1 and present_until is not null`, [ostern]);
    await c.end();
    if (rows[0].s !== '2027-04-11 08:00' || w.rows[0].u !== '2027-04-11 13:00') throw new Error('Verschiebung falsch: ' + JSON.stringify([rows, w.rows]));
  }
  log('Datum verschoben: Zeitslots und Anwesenheitsfenster wandern mit');

  // Feedback
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=feedback`);
  const fb = lena.locator('form', { has: lena.getByRole('button', { name: 'Feedback hinzufügen' }) });
  await fb.getByText('Fürs nächste Mal').click();
  await fb.locator('textarea[name=text]').fill('Mehr Kaffee einplanen');
  await fb.getByRole('button', { name: 'Feedback hinzufügen' }).click();
  await lena.getByText('Danke für dein Feedback!').waitFor();
  await fb.getByText('Lief gut').click();
  await fb.locator('textarea[name=text]').fill('Viele Besucher');
  await fb.getByRole('button', { name: 'Feedback hinzufügen' }).click();
  await lena.locator('li', { hasText: 'Viele Besucher' }).waitFor();
  log('Feedback erfasst');

  // Pfingsten: „Aus dem letzten Mal“ → Aufgabe; Übernehmen
  await lena.goto(`${BASE}/aktionen/${pfingsten}`);
  await lena.getByText('Aus dem letzten Mal').waitFor();
  const item = lena.locator('li', { hasText: 'Mehr Kaffee einplanen' });
  await item.getByRole('button', { name: 'Als Aufgabe' }).click();
  await lena.getByText('als Aufgabe übernommen').waitFor();
  log('„Fürs nächste Mal“ erscheint bei Pfingsten und wird zur Aufgabe');

  const copy = lena.locator('form', { has: lena.getByRole('button', { name: 'Übernehmen' }) });
  if (!(await copy.isVisible())) await lena.getByRole('button', { name: /Von früherer Durchführung übernehmen/ }).click();
  const osternOption = await copy.locator('option', { hasText: 'Kuchenverkauf Ostern' }).getAttribute('value');
  await copy.locator('select[name=sourceId]').selectOption(osternOption);
  await copy.getByRole('button', { name: 'Übernehmen' }).click();
  await lena.getByText(/Übernommen: 3 Zeitslots, 2 Aufgaben .*Planungsteam/).waitFor();
  await lena.goto(`${BASE}/aktionen/${pfingsten}?tab=zeitplan`);
  await slotCard('Aufbau').getByText('08:00–10:00').waitFor();
  await lena.goto(`${BASE}/aktionen/${pfingsten}?tab=aufgaben`);
  for (const t of ['Plakat drucken', 'Waffeleisen leihen', 'Mehr Kaffee einplanen']) await lena.getByText(t, { exact: true }).first().waitFor();
  await lena.getByText('So., 2. Mai').first().waitFor(); // 16.05. − 14 Tage (relativ übernommen)
  log('Von Ostern übernommen: Zeitplan, Aufgaben (relativ), Planungsteam');

  // Fremde Organisation
  const nora = await (await b.newContext()).newPage();
  await login(nora, 'nora@test.de', 'Nora-Passwort-1');
  for (const tab of ['team', 'zeitplan', 'aufgaben', 'feedback']) {
    await nora.goto(`${BASE}/aktionen/${ostern}?tab=${tab}`);
    await nora.getByText('Seite nicht gefunden').waitFor();
  }
  log('Andere Organisation: alle Planungs-Tabs nicht erreichbar');

  await b.close();
  console.log('E2E PHASE 3 OK');
})().catch((e) => {
  console.error('E2E FEHLER:', e.message);
  process.exit(1);
});
