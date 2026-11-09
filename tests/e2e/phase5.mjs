/**
 * End-to-End Phase 5: Kalender-Abos (ICS).
 * Läuft NACH flow.mjs … phase4.mjs auf derselben Datenbank.
 */
import { chromium, devices } from 'playwright';
import ICAL from 'ical.js';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.E2E_SCREENSHOTS;
const log = (...a) => console.log('•', ...a);
const assert = (c, m) => { if (!c) throw new Error(m); };

async function login(page, email, pw) {
  await page.goto(BASE + '/login');
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function feedLinks(page) {
  await page.goto(BASE + '/einstellungen');
  const create = page.getByRole('button', { name: 'Kalender-Links erzeugen' });
  await create.or(page.locator('[data-feed=personal] input')).first().waitFor();
  if (await create.count()) {
    await create.click();
    await page.locator('[data-feed=personal] input').waitFor();
  }
  return {
    personal: await page.locator('[data-feed=personal] input').inputValue(),
    org: await page.locator('[data-feed=org] input').inputValue(),
    webcal: await page.locator('[data-feed=personal] a', { hasText: 'Abonnieren' }).getAttribute('href'),
  };
}
async function fetchCal(request, url) {
  const res = await request.get(url);
  assert(res.status() === 200, `${url} → ${res.status()}`);
  assert(res.headers()['content-type'].startsWith('text/calendar'), 'falscher Content-Type');
  const text = await res.text();
  const comp = new ICAL.Component(ICAL.parse(text));
  return { text, events: comp.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v)) };
}

(async () => {
  const b = await chromium.launch();
  const lena = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login(lena, 'lena@test.de', 'Lena-Neu-456789');
  const anon = (await b.newContext()).request; // Kalender-Apps haben keine Session

  const links = await feedLinks(lena);
  assert(/\/cal\/[0-9a-f]{64}\/personal\.ics$/.test(links.personal), 'Link-Format: ' + links.personal);
  assert(links.webcal.startsWith('webcal://'), 'webcal-Link fehlt');
  await shot(lena, 'einstellungen-kalender');
  log('Abo-Links erzeugt');

  // Org-Kalender
  const org = await fetchCal(anon, links.org);
  const ostern = org.events.find((e) => e.summary === 'Kuchenverkauf Ostern');
  assert(ostern, 'Ostern fehlt im Org-Kalender');
  assert(ostern.startDate.isDate && ostern.startDate.toString() === '2027-04-11', 'Ostern nicht ganztägig am 11.04.: ' + ostern.startDate);
  assert(ostern.endDate.toString() === '2027-04-12', 'DTEND nicht exklusiv');
  assert(ostern.location === 'Pfarrheim', 'Ort fehlt');
  assert(/ZEITPLAN[\s\S]*Aufbau/.test(ostern.description), 'Zeitplan fehlt in der Beschreibung');
  assert(/Dabei: .*Lena/.test(ostern.description), 'Team fehlt in der Beschreibung');
  assert(ostern.description.includes('/aktionen/'), 'Link fehlt');
  const meeting = org.events.find((e) => e.summary.startsWith('Leiterrunde: Monatstreffen März 2027'));
  assert(meeting, 'Treffen fehlt');
  assert(meeting.startDate.toJSDate().toISOString() === '2027-03-15T18:30:00.000Z', 'Treffen-Zeit falsch: ' + meeting.startDate.toJSDate().toISOString());
  assert(/AGENDA[\s\S]*Kassenstand/.test(meeting.description), 'Agenda fehlt');
  assert(!org.text.includes('Geheime Aktion') && !org.text.includes('Geheimes Treffen'), 'Fremde Org im Kalender!');
  assert(!org.events.some((e) => e.summary === 'Ohne Datum'), 'Idee ohne Datum im Kalender');
  log(`Org-Kalender: ${org.events.length} Termine, Ostern ganztägig, Treffen 19:30 Uhr, keine fremden Daten`);

  // Persönlicher Kalender (Lena: dabei bei Ostern mit Zeitplan)
  const mine = await fetchCal(anon, links.personal);
  const aufbau = mine.events.find((e) => e.summary === 'Aufbau · Kuchenverkauf Ostern');
  assert(aufbau, 'Slot „Aufbau“ fehlt: ' + mine.events.map((e) => e.summary).join(' | '));
  // 11.04.2027 08:00 Sommerzeit → 06:00Z
  assert(aufbau.startDate.toJSDate().toISOString() === '2027-04-11T06:00:00.000Z', 'Slot-Zeit falsch: ' + aufbau.startDate.toJSDate().toISOString());
  assert(!mine.events.some((e) => e.summary.startsWith('Leiterrunde')), 'Treffen gehört nicht in den persönlichen Kalender');
  log(`Persönlicher Kalender: ${mine.events.length} Termine (${mine.events.map((e) => e.summary).join(' | ')})`);

  // Tim (mobil, „vielleicht“): eigene Links, vorläufige Termine
  const timCtx = await b.newContext({ ...devices['iPhone 13'] });
  const tim = await timCtx.newPage();
  await login(tim, 'tim@test.de', 'Tim-Passwort-1');
  const timLinks = await feedLinks(tim);
  assert(timLinks.personal !== links.personal, 'Tim hat Lenas Link');
  await shot(tim, 'einstellungen-kalender-mobil');
  const timCal = await fetchCal(anon, timLinks.personal);
  const tentative = timCal.events.filter((e) => e.component.getFirstPropertyValue('status') === 'TENTATIVE');
  assert(tentative.length > 0 && tentative.every((e) => e.summary.startsWith('(?) ')), 'Vielleicht-Termine nicht vorläufig');
  log(`Tim: ${timCal.events.length} Termine, davon ${tentative.length} vorläufig („vielleicht“)`);

  // Manipuliertes Token, falscher Feed-Name
  const bad = links.personal.replace(/[0-9a-f](?=\/personal\.ics$)/, (c) => (c === '0' ? '1' : '0'));
  assert((await anon.get(bad)).status() === 404, 'manipuliertes Token akzeptiert');
  assert((await anon.get(links.personal.replace('personal.ics', 'alles.ics'))).status() === 404, 'unbekannter Feed akzeptiert');

  // Zurücksetzen: alter Link tot, neuer funktioniert
  lena.once('dialog', (d) => d.accept());
  await lena.getByRole('button', { name: 'Links zurücksetzen' }).click();
  await lena.waitForFunction((old) => document.querySelector('[data-feed=personal] input')?.value !== old, links.personal);
  const renewed = await feedLinks(lena);
  assert((await anon.get(links.personal)).status() === 404, 'alter Link funktioniert noch');
  await fetchCal(anon, renewed.org);
  await lena.reload();
  await lena.getByText(/Zuletzt abgerufen/).waitFor();
  log('Zurücksetzen macht alte Links ungültig');

  await b.close();
  console.log('PHASE 5 OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
