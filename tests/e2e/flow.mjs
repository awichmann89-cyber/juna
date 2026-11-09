/**
 * End-to-End-Durchlauf Phase 1 (gegen eine LEERE Datenbank, Mails ohne RESEND_API_KEY → Konsole).
 *
 *   npm run build && npm start > /tmp/juna.log 2>&1 &
 *   npm run bootstrap:superadmin -- apps@alw-mediaworks.de      # gibt Link aus
 *   E2E_BASE_URL=http://localhost:3000 E2E_MAIL_LOG=/tmp/juna.log node tests/e2e/flow.mjs "<Link>"
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const MAIL_LOG = process.env.E2E_MAIL_LOG ?? '/tmp/juna.log';
const log = (...a) => console.log('•', ...a);
function lastLink(email) {
  const txt = fs.readFileSync(MAIL_LOG, 'utf8');
  const blocks = txt.split('[mail:dev] An: ').filter(b => b.startsWith(email));
  const m = blocks.at(-1)?.match(/https?:\/\/\S+\/passwort-setzen\?token=[\w-]+/);
  if (!m) throw new Error('kein Link für ' + email);
  return m[0];
}
async function setPw(page, url, pw) {
  await page.goto(url);
  await page.fill('#password', pw); await page.fill('#confirm', pw);
  await Promise.all([page.waitForURL(u => !u.toString().includes('passwort-setzen')), page.click('button[type=submit]')]);
}
async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
}
(async () => {
  const b = await chromium.launch();
  const sa = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const superLink = process.argv[2];
  await setPw(sa, superLink, 'Superadmin-Passwort-1');
  if (!sa.url().endsWith('/admin')) throw new Error('Superadmin nicht auf /admin: ' + sa.url());
  log('Superadmin Passwort gesetzt →', sa.url());

  const anon = await (await b.newContext()).newPage();
  await anon.goto(BASE + '/registrieren');
  await anon.fill('#orgName', 'Leiterrunde St. Marien');
  await anon.fill('#contactName', 'Lena Krämer');
  await anon.fill('#contactEmail', 'lena@test.de');
  await anon.fill('#message', 'Wir sind 12 Leiter*innen.');
  await anon.click('button[type=submit]');
  await expectText(anon, 'Antrag ist eingegangen');
  log('Antrag eingereicht');
  await anon.goto(BASE + '/registrieren');
  await anon.fill('#orgName', 'Doppelt'); await anon.fill('#contactName', 'Lena K'); await anon.fill('#contactEmail', 'lena@test.de');
  await anon.click('button[type=submit]');
  await expectText(anon, 'bereits ein offener Antrag');
  log('Doppelter Antrag abgewiesen');

  await sa.goto(BASE + '/admin');
  await expectText(sa, 'Leiterrunde St. Marien');
  await sa.getByRole('button', { name: 'Freigeben' }).click();
  await expectText(sa, 'ist freigeschaltet');
  log('Antrag freigegeben');

  const lenaCtx = await b.newContext({ ...devices['iPhone 13'] });
  const lena = await lenaCtx.newPage();
  await setPw(lena, lastLink('lena@test.de'), 'Lena-Passwort-123');
  await lena.getByText('Das steht bei „Leiterrunde St. Marien“ an.').waitFor();
  log('Lena (Org-Admin) aktiviert →', lena.url());

  await lena.goto(BASE + '/einstellungen/mitglieder');
  await lena.fill('#displayName', 'Max Mustermann');
  await lena.fill('#email', 'max@test.de');
  await lena.click('form button[type=submit]:has-text("Einladung senden")');
  await expectText(lena, 'wurde eingeladen');
  log('Max eingeladen');
  await lena.fill('#displayName', 'Superadmin Klau'); await lena.fill('#email', 'apps@alw-mediaworks.de');
  await lena.click('form button[type=submit]:has-text("Einladung senden")');
  await expectText(lena, 'bereits bei juna registriert');
  log('Einladung vorhandener E-Mail abgewiesen');

  const maxCtx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const max = await maxCtx.newPage();
  await setPw(max, lastLink('max@test.de'), 'Max-Passwort-123');
  await max.getByRole('heading', { name: /Max!/ }).waitFor();
  await expectText(max, '2 Mitglieder');
  log('Max aktiviert, sieht 2 Mitglieder');
  for (const [path, secret] of [['/einstellungen/mitglieder', 'Einladung senden'], ['/admin', 'Offene Anträge']]) {
    await max.goto(BASE + path);
    await max.getByText('Seite nicht gefunden').waitFor();
    if ((await max.locator('body').innerText()).includes(secret)) throw new Error('Max sieht ' + path);
    log('Max →', path, ': nicht gefunden');
  }

  await max.goto(BASE + '/einstellungen');
  await max.selectOption('#reminderTime', '19:30');
  await max.click('button:has-text("Speichern")');
  await expectText(max, 'Gespeichert');
  await max.reload();
  if (await max.inputValue('#reminderTime') !== '19:30') throw new Error('Erinnerungszeit nicht gespeichert');
  log('Max Erinnerungszeit 19:30 gespeichert');

  // Lena deaktiviert Max
  await lena.goto(BASE + '/einstellungen/mitglieder');
  const row = lena.locator('li', { hasText: 'max@test.de' });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Deaktivieren' }).click();
  await expectText(lena, 'Deaktiviert');
  log('Max deaktiviert');
  await max.goto(BASE + '/uebersicht');
  await max.waitForURL('**/login**', { timeout: 8000 }).catch(() => {});
  log('Max nach Deaktivierung →', max.url());
  if (!max.url().includes('/login')) throw new Error('Deaktivierter User nicht ausgesperrt');
  await max.fill('#email', 'max@test.de'); await max.fill('#password', 'Max-Passwort-123');
  await max.click('button[type=submit]');
  await expectText(max, 'deaktiviert');
  log('Login deaktiviert blockiert');

  // Logout/Login Lena, falsches Passwort
  await lena.goto(BASE + '/einstellungen');
  await lena.locator('main button:has-text("Abmelden")').click();
  await lena.waitForURL('**/login');
  await lena.fill('#email', 'lena@test.de'); await lena.fill('#password', 'falsch-falsch');
  await lena.click('button[type=submit]');
  await expectText(lena, 'E-Mail oder Passwort ist falsch');
  await lena.fill('#password', 'Lena-Passwort-123');
  await Promise.all([lena.waitForURL('**/uebersicht'), lena.click('button[type=submit]')]);
  log('Lena Logout/Login ok');

  // Passwort vergessen
  const anon2 = await (await b.newContext()).newPage();
  await anon2.goto(BASE + '/passwort-vergessen');
  await anon2.fill('#email', 'lena@test.de'); await anon2.click('button[type=submit]');
  await expectText(anon2, 'Falls ein Konto');
  const resetLink = lastLink('lena@test.de');
  await setPw(anon2, resetLink, 'Lena-Neu-456789');
  log('Reset → ', anon2.url());
  await anon2.goto(resetLink);
  await expectText(anon2, 'ungültig oder abgelaufen');
  log('Reset-Link nur einmal nutzbar');
  // alte Session von Lena wurde widerrufen
  await lena.goto(BASE + '/uebersicht');
  await lena.waitForURL('**/login**', { timeout: 8000 }).catch(() => {});
  log('Lena alte Session nach Reset →', lena.url());

  // Rate-Limit: max. 3 Reset-Mails pro Adresse und Stunde (1 schon verbraucht)
  for (let i = 0; i < 3; i++) {
    await anon2.goto(BASE + '/passwort-vergessen');
    await anon2.fill('#email', 'lena@test.de'); await anon2.click('button[type=submit]');
    await anon2.locator('[role=status],[role=alert]').first().waitFor();
  }
  await expectText(anon2, 'Zu viele Anfragen');
  log('Rate-Limit Passwort-Reset greift');

  await b.close();
  console.log('E2E OK');
})().catch(e => { console.error('E2E FEHLER:', e.message); process.exit(1); });
