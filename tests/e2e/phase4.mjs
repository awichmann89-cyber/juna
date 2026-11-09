/**
 * End-to-End Phase 4: Dateien (Upload, Anzeige, Download, Löschen, Isolation) und Leiterrunden-Modus
 * (Treffen mit Agenda-Vorschlag, Anwesenheit, Ablauf mit „Erledigt & weiter“, Protokoll, Abschluss).
 * Läuft NACH flow.mjs, phase2.mjs und phase3.mjs. Erwartet JUNA_LOCAL_STORAGE_DIR am Server und DATABASE_URL hier.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.E2E_SCREENSHOTS;
const DB = process.env.DATABASE_URL;
const log = (...a) => console.log('•', ...a);

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
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'juna-e2e-'));
  // 1×1-PNG und eine kleine PDF
  const png = path.join(tmp, 'plakat.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const pdf = path.join(tmp, 'Einkaufsliste.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const evil = path.join(tmp, 'evil.html');
  fs.writeFileSync(evil, '<script>alert(1)</script>');

  const b = await chromium.launch();
  const lena = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
  await login(lena, 'lena@test.de', 'Lena-Neu-456789');
  const timCtx = await b.newContext({ ...devices['iPhone 13'] });
  const tim = await timCtx.newPage();
  await login(tim, 'tim@test.de', 'Tim-Passwort-1');

  const ostern = await actionIdByTitle(lena, 'Kuchenverkauf Ostern');

  // ---------------------------------------------------------------- Dateien
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=dateien`);
  await lena.setInputFiles('input[type=file]', [png, pdf]);
  await lena.fill('input[name=groupLabel]', 'Plakat');
  await lena.getByRole('button', { name: 'Hochladen' }).click();
  await lena.getByRole('link', { name: 'Einkaufsliste.pdf' }).waitFor();
  await lena.getByRole('link', { name: 'plakat.png' }).first().waitFor();
  log('2 Dateien hochgeladen (Gruppe „Plakat“)');

  // Nicht erlaubter Typ wird abgelehnt (accept umgehen)
  await lena.setInputFiles('input[type=file]', [evil]);
  await lena.getByRole('button', { name: 'Hochladen' }).click();
  await lena.getByText(/nicht erlaubt|Dateityp/i).first().waitFor();
  log('HTML-Upload abgelehnt');

  // Download mit Session: Inhalt und Header prüfen
  const fileHref = await lena.getByRole('link', { name: 'Einkaufsliste.pdf' }).getAttribute('href');
  const res = await lena.request.get(BASE + fileHref + '?download=1');
  assert(res.status() === 200, 'Download fehlgeschlagen: ' + res.status());
  assert((await res.text()).startsWith('%PDF'), 'Falscher Inhalt');
  assert(/attachment/.test(res.headers()['content-disposition'] ?? ''), 'kein attachment');
  assert(res.headers()['x-content-type-options'] === 'nosniff', 'nosniff fehlt');
  // Ohne Session: kein Zugriff
  const anon = await (await b.newContext()).request.get(BASE + fileHref);
  assert(anon.status() === 401 || anon.status() === 404 || anon.url().includes('/login'), 'anonymer Zugriff möglich: ' + anon.status());
  log('Download nur mit Anmeldung, Header korrekt');

  // Tim sieht die Dateien, darf fremde aber nicht löschen
  await tim.goto(`${BASE}/aktionen/${ostern}?tab=dateien`);
  await tim.getByRole('link', { name: 'Einkaufsliste.pdf' }).waitFor();
  assert((await tim.getByRole('button', { name: 'Einkaufsliste.pdf löschen' }).count()) === 0, 'Tim darf fremde Datei löschen');
  await shot(tim, 'dateien-mobil');
  log('Tim sieht Dateien, ohne Löschen-Button');

  // Isolation: Datei/Treffen einer fremden Organisation sind nicht erreichbar
  if (DB) {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    const { rows: [org] } = await c.query(
      `insert into public.organizations (name, status) values ('Fremde Org', 'active') returning id`,
    );
    const { rows: [act] } = await c.query(
      `insert into public.actions (org_id, title, status, date) values ($1, 'Geheime Aktion', 'geplant', '2027-01-01') returning id`,
      [org.id],
    );
    const { rows: [file] } = await c.query(
      `insert into public.action_files (org_id, action_id, storage_key, filename, content_type, size_bytes)
       values ($1, $2, $3, 'geheim.pdf', 'application/pdf', 10) returning id`,
      [org.id, act.id, `orgs/${org.id}/actions/${act.id}/x-geheim.pdf`],
    );
    const { rows: [meet] } = await c.query(
      `insert into public.meetings (org_id, title, date) values ($1, 'Geheimes Treffen', '2027-01-01') returning id`,
      [org.id],
    );
    await c.end();
    const r1 = await lena.request.get(`${BASE}/api/dateien/${file.id}`);
    assert(r1.status() === 404, 'fremde Datei erreichbar: ' + r1.status());
    await lena.goto(`${BASE}/leiterrunde/${meet.id}`);
    await lena.getByText(/nicht gefunden|404/i).first().waitFor();
    assert((await lena.getByText('Geheimes Treffen').count()) === 0, 'fremdes Treffen sichtbar');
    log('Fremde Datei und fremdes Treffen nicht erreichbar');
  }

  // Löschen durch die Hochladende
  await lena.goto(`${BASE}/aktionen/${ostern}?tab=dateien`);
  lena.once('dialog', (d) => d.accept());
  await lena.getByRole('button', { name: 'Einkaufsliste.pdf löschen' }).click();
  await lena.getByRole('link', { name: 'Einkaufsliste.pdf' }).waitFor({ state: 'detached' });
  const gone = await lena.request.get(BASE + fileHref);
  assert(gone.status() === 404, 'gelöschte Datei noch abrufbar');
  log('Datei gelöscht, Link liefert 404');

  // ---------------------------------------------------------------- Leiterrunde
  await lena.goto(BASE + '/leiterrunde');
  await lena.getByText('Noch keine Treffen').waitFor();
  await lena.selectOption('#m-neu-type', 'monatstreffen');
  await lena.fill('#m-neu-date', '2027-03-15');
  await lena.fill('#m-neu-start', '19:30');
  await lena.fill('#m-neu-location', 'Jugendraum');
  await lena.selectOption('#m-neu-owner', { label: 'Lena K' }).catch(async () => {
    const opts = await lena.locator('#m-neu-owner option').allTextContents();
    await lena.selectOption('#m-neu-owner', { label: opts.find((o) => o.startsWith('Lena')) });
  });
  await Promise.all([lena.waitForURL(/\/leiterrunde\/[0-9a-f-]{36}$/), lena.getByRole('button', { name: 'Treffen anlegen' }).click()]);
  const meetingUrl = lena.url();
  await lena.getByRole('heading', { name: /Monatstreffen März 2027/ }).waitFor();
  // Agenda-Vorschlag: Ostern (in 8 Wochen) ja, Pfingsten (später) nein
  const agenda = lena.locator('ol').first();
  await agenda.getByText('Kuchenverkauf Ostern').waitFor();
  assert((await agenda.getByText('Kuchenverkauf Pfingsten').count()) === 0, 'Pfingsten fälschlich auf der Agenda');
  log('Treffen angelegt, Agenda automatisch vorgeschlagen');

  // Freien Punkt + Pfingsten manuell ergänzen
  await lena.getByText('Punkt hinzufügen').click();
  await lena.getByRole('button', { name: 'Freier Punkt' }).click();
  await lena.fill('input[name=title]', 'Kassenstand');
  await lena.getByRole('button', { name: 'Hinzufügen' }).click();
  await lena.getByText('Zur Agenda hinzugefügt.').waitFor();
  await agenda.getByText('Kassenstand').waitFor();
  await lena.getByRole('button', { name: 'Aktion', exact: true }).click();
  await lena.selectOption('select[name=actionId]', { label: (await lena.locator('select[name=actionId] option', { hasText: 'Pfingsten' }).textContent()).trim() });
  await lena.getByRole('button', { name: 'Hinzufügen' }).click();
  await agenda.getByText('Kuchenverkauf Pfingsten').waitFor();
  // Kassenstand nach oben schieben
  const rowsBefore = await agenda.locator('li').allTextContents();
  const kIdx = rowsBefore.findIndex((t) => t.includes('Kassenstand'));
  await agenda.locator('li').nth(kIdx).getByRole('button', { name: 'Nach oben' }).click();
  await lena.waitForFunction(
    (i) => [...document.querySelectorAll('ol')[0].querySelectorAll('li')][i - 1]?.textContent.includes('Kassenstand'),
    kIdx,
  );
  const items = await agenda.locator('li').count();
  log(`Agenda bearbeitet (${items} Punkte, Reihenfolge geändert)`);

  // Anwesenheit: Tim meldet sich selbst entschuldigt, darf andere nicht ändern
  const meetingPath = new URL(meetingUrl).pathname;
  await tim.goto(BASE + meetingPath);
  await tim.getByRole('button', { name: 'Tim Teamer: Entschuldigt' }).click();
  await tim.getByRole('button', { name: 'Tim Teamer: Entschuldigt', pressed: true }).waitFor();
  assert((await tim.getByRole('button', { name: /^Lena.*: Anwesend$/ }).count()) === 0, 'Tim kann Lenas Anwesenheit ändern');
  await shot(tim, 'treffen-mobil');
  log('Tim: selbst entschuldigt, fremde Einträge gesperrt (Protokoll: Lena)');

  // Lena: übrige als anwesend → Tim bleibt entschuldigt
  await lena.reload();
  await lena.getByRole('button', { name: 'Übrige als anwesend' }).click();
  await lena.getByRole('button', { name: /^Lena.*: Anwesend$/, pressed: true }).waitFor();
  await lena.getByRole('button', { name: 'Tim Teamer: Entschuldigt', pressed: true }).waitFor();
  log('Anwesenheit erfasst');

  // Protokoll schreiben (Autosave)
  const editor = lena.locator('.juna-editor [contenteditable=true]').first();
  await editor.click();
  await lena.keyboard.type('Beschluss: Ostern 3 Bleche Waffeln.');
  await lena.locator('[data-save-state=saved]').filter({ hasText: 'Gespeichert um' }).waitFor({ timeout: 15000 });
  await shot(lena, 'treffen-detail');
  log('Protokoll gespeichert');

  // Treffen starten → Ablauf
  await Promise.all([lena.waitForURL(/\/ablauf/), lena.getByRole('button', { name: 'Treffen starten' }).click()]);
  await lena.getByText(`Punkt 1 von ${items}`).waitFor();
  await lena.getByRole('heading', { name: 'Kassenstand' }).waitFor();
  await Promise.all([lena.waitForURL(/punkt=2/), lena.getByRole('button', { name: /Erledigt & weiter/ }).click()]);
  await lena.getByRole('heading', { name: /Kuchenverkauf Ostern/ }).waitFor();
  // Planungspunkt startet im Bereich Team; Wechsel zu Planung (mit Aufgaben-Blöcken) und Feedback
  await lena.getByRole('link', { name: /^Team/ }).and(lena.locator('[aria-current=page]')).waitFor();
  await lena.getByRole('link', { name: /^Planung/ }).click();
  await lena.waitForURL(/bereich=planung/);
  await lena.locator('[data-task-block]', { hasText: 'Plakat drucken' }).waitFor();
  await lena.getByRole('link', { name: /^Feedback/ }).click();
  await lena.waitForURL(/bereich=feedback/);
  await shot(lena, 'ablauf-desktop');
  await Promise.all([lena.waitForURL(/punkt=3/), lena.getByRole('button', { name: /Erledigt & weiter/ }).click()]);
  log('Ablauf: Punkte durchgeklickt, Bereiche gewechselt');

  // Mobil: Ablauf sichtbar
  await tim.goto(`${BASE}${meetingPath}/ablauf?punkt=2`);
  await tim.getByRole('heading', { name: /Kuchenverkauf Ostern/ }).waitFor();
  await shot(tim, 'ablauf-mobil');

  // Letzten Punkt erledigen → zurück zur Übersicht
  await lena.goto(`${BASE}${meetingPath}/ablauf?punkt=${items}`);
  await Promise.all([lena.waitForURL((u) => u.pathname === meetingPath), lena.getByRole('button', { name: /Erledigt & zur Übersicht/ }).click()]);
  await lena.getByText(`${items - 1}/${items} erledigt`).or(lena.getByText(`${items}/${items} erledigt`)).waitFor();
  await lena.getByRole('button', { name: 'Abschließen' }).click();
  await lena.getByRole('button', { name: 'Wieder öffnen' }).waitFor();
  await lena.goto(BASE + '/leiterrunde');
  await lena.getByText('Abgeschlossen').waitFor();
  await shot(lena, 'leiterrunde-liste');
  log('Treffen abgeschlossen');

  // Löschen nur für Admins: Tim sieht keinen Button
  await tim.goto(BASE + meetingPath);
  await tim.getByText('Treffen bearbeiten').click();
  assert((await tim.getByRole('button', { name: 'Treffen löschen' }).count()) === 0, 'Tim darf Treffen löschen');

  await b.close();
  console.log('PHASE 4 OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
