/**
 * Mandantentrennung & Rechte – RLS-Tests direkt gegen Postgres.
 *
 * Voraussetzung: TEST_DATABASE_URL zeigt auf eine LEERE Test-Datenbank (z. B. eigener Neon-Branch
 * oder lokales Postgres). Die Tests spielen alle Migrationen selbst ein. Niemals gegen Produktion!
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/juna_test npm run test:db
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const root = join(__dirname, "..", "..");

const ids = {
  orgA: "aaaaaaaa-0000-0000-0000-000000000001",
  orgB: "bbbbbbbb-0000-0000-0000-000000000001",
  adminA: "aaaaaaaa-0000-0000-0000-0000000000a1",
  memberA: "aaaaaaaa-0000-0000-0000-0000000000b1",
  deactivatedA: "aaaaaaaa-0000-0000-0000-0000000000c1",
  memberB: "bbbbbbbb-0000-0000-0000-0000000000b1",
  superadmin: "99999999-0000-0000-0000-000000000001",
};

let db: Client;

/** Führt fn wie die App aus (src/db → withUser): app.user_id + Rolle juna_app, danach Rollback. */
async function asUser<T>(userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (userId) await db.query("select set_config('app.user_id', $1, true)", [userId]);
    await db.query("set local role juna_app");
    return await fn(db);
  } finally {
    await db.query("rollback");
  }
}

/** Erwartet, dass die Abfrage mit einem Rechtefehler scheitert. */
async function expectDenied(p: Promise<unknown>) {
  await expect(p).rejects.toThrow(/permission denied|row-level security/i);
}

describe.skipIf(!url)("RLS / Mandantentrennung", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const migDir = join(root, "db/migrations");
    for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(join(migDir, f), "utf8"));
    }

    const users = [ids.adminA, ids.memberA, ids.deactivatedA, ids.memberB, ids.superadmin];
    for (const id of users) {
      await db.query(`insert into auth."user" (id, name, email) values ($1, $1, $1 || '@test.de')`, [id]);
    }

    await db.query(
      `insert into public.organizations (id, name) values ($1, 'Leiterrunde A'), ($2, 'Leiterrunde B')`,
      [ids.orgA, ids.orgB],
    );
    await db.query(
      `insert into public.profiles (id, org_id, role, status, display_name, email, is_superadmin) values
        ($1, $5, 'admin',  'active',      'Admin A',   'admin-a@test.de',  false),
        ($2, $5, 'member', 'active',      'Mitglied A','member-a@test.de', false),
        ($3, $5, 'member', 'deactivated', 'Ehemalig A','old-a@test.de',    false),
        ($4, $6, 'member', 'active',      'Mitglied B','member-b@test.de', false),
        ($7, null, 'member', 'active',    'Plattform', 'apps@test.de',     true)`,
      [ids.adminA, ids.memberA, ids.deactivatedA, ids.memberB, ids.orgA, ids.orgB, ids.superadmin],
    );
    await db.query(
      `insert into public.organization_applications (org_name, contact_name, contact_email)
       values ('Neue Runde', 'Max Muster', 'max@test.de')`,
    );
    await db.query(
      `insert into public.module_permissions (org_id, user_id, module, can_read) values ($1, $2, 'kasse', true)`,
      [ids.orgB, ids.memberB],
    );
  });

  afterAll(async () => {
    await db?.end();
  });

  it("ohne User-Kontext sieht juna_app nichts", async () => {
    for (const table of ["organizations", "profiles", "organization_applications", "platform_settings"]) {
      const rows = await asUser(null, async (c) => (await c.query(`select * from public.${table}`)).rows);
      expect(rows).toHaveLength(0);
    }
  });

  it("Mitglied sieht nur die eigene Organisation", async () => {
    const rows = await asUser(ids.memberA, async (c) => (await c.query("select id from public.organizations")).rows);
    expect(rows.map((r) => r.id)).toEqual([ids.orgA]);
  });

  it("Mitglied sieht nur Profile der eigenen Organisation", async () => {
    const rows = await asUser(ids.memberA, async (c) => (await c.query("select id from public.profiles")).rows);
    const seen = rows.map((r) => r.id).sort();
    expect(seen).toEqual([ids.adminA, ids.memberA, ids.deactivatedA].sort());
    expect(seen).not.toContain(ids.memberB);
    expect(seen).not.toContain(ids.superadmin);
  });

  it("gezielter Zugriff auf fremde Organisation liefert nichts", async () => {
    const rows = await asUser(ids.memberA, async (c) =>
      (await c.query("select * from public.profiles where org_id = $1", [ids.orgB])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("Modulberechtigungen fremder Organisationen sind unsichtbar", async () => {
    const rows = await asUser(ids.memberA, async (c) => (await c.query("select * from public.module_permissions")).rows);
    expect(rows).toHaveLength(0);
  });

  it("deaktivierter User sieht keine Organisationsdaten mehr", async () => {
    const orgs = await asUser(ids.deactivatedA, async (c) => (await c.query("select id from public.organizations")).rows);
    const profiles = await asUser(ids.deactivatedA, async (c) => (await c.query("select id from public.profiles")).rows);
    expect(orgs).toHaveLength(0);
    expect(profiles.map((r) => r.id)).toEqual([ids.deactivatedA]);
  });

  it("User kann eigene Rolle, Org oder Superadmin-Flag nicht ändern", async () => {
    await asUser(ids.memberA, async (c) => {
      await expectDenied(c.query("update public.profiles set role = 'admin' where id = $1", [ids.memberA]));
    });
    await asUser(ids.memberA, async (c) => {
      await expectDenied(c.query("update public.profiles set is_superadmin = true where id = $1", [ids.memberA]));
    });
    await asUser(ids.memberA, async (c) => {
      await expectDenied(c.query("update public.profiles set org_id = $2 where id = $1", [ids.memberA, ids.orgB]));
    });
    await asUser(ids.memberA, async (c) => {
      await expectDenied(c.query("update public.profiles set status = 'active' where id = $1", [ids.memberA]));
    });
  });

  it("User kann eigene Einstellungen ändern, aber keine fremden Profile", async () => {
    const own = await asUser(ids.memberA, async (c) =>
      (await c.query("update public.profiles set display_name = 'Neu', reminder_time = '19:30' where id = $1", [ids.memberA])).rowCount,
    );
    expect(own).toBe(1);
    const sameOrg = await asUser(ids.memberA, async (c) =>
      (await c.query("update public.profiles set display_name = 'Hack' where id = $1", [ids.adminA])).rowCount,
    );
    expect(sameOrg).toBe(0);
    const otherOrg = await asUser(ids.memberA, async (c) =>
      (await c.query("update public.profiles set display_name = 'Hack' where id = $1", [ids.memberB])).rowCount,
    );
    expect(otherOrg).toBe(0);
  });

  it("Erinnerungszeit nur in 15-Minuten-Schritten", async () => {
    await asUser(ids.memberA, async (c) => {
      await expect(
        c.query("update public.profiles set reminder_time = '19:07' where id = $1", [ids.memberA]),
      ).rejects.toThrow(/profiles_reminder_quarter_hour/);
    });
  });

  it("nur Admins bearbeiten die Organisation – und nur die eigene", async () => {
    const member = await asUser(ids.memberA, async (c) =>
      (await c.query("update public.organizations set name = 'X' where id = $1", [ids.orgA])).rowCount,
    );
    expect(member).toBe(0);
    const admin = await asUser(ids.adminA, async (c) =>
      (await c.query("update public.organizations set name = 'Leiterrunde A+' where id = $1", [ids.orgA])).rowCount,
    );
    expect(admin).toBe(1);
    const foreign = await asUser(ids.adminA, async (c) =>
      (await c.query("update public.organizations set name = 'X' where id = $1", [ids.orgB])).rowCount,
    );
    expect(foreign).toBe(0);
    await asUser(ids.adminA, async (c) => {
      await expectDenied(c.query("update public.organizations set status = 'suspended' where id = $1", [ids.orgA]));
    });
  });

  it("niemand außer Service-Role legt Organisationen oder Profile an", async () => {
    await asUser(ids.adminA, async (c) => {
      await expectDenied(c.query("insert into public.organizations (name) values ('Fake')"));
    });
    await asUser(ids.adminA, async (c) => {
      await expectDenied(
        c.query(
          "insert into public.profiles (id, org_id, display_name, email) values (gen_random_uuid(), $1, 'x', 'x@x.de')",
          [ids.orgA],
        ),
      );
    });
  });

  it("Anträge und Plattform-Einstellungen nur für Superadmin", async () => {
    const memberApps = await asUser(ids.adminA, async (c) =>
      (await c.query("select * from public.organization_applications")).rows,
    );
    expect(memberApps).toHaveLength(0);
    const superApps = await asUser(ids.superadmin, async (c) =>
      (await c.query("select * from public.organization_applications")).rows,
    );
    expect(superApps).toHaveLength(1);

    const memberSettings = await asUser(ids.adminA, async (c) =>
      (await c.query("select * from public.platform_settings")).rows,
    );
    expect(memberSettings).toHaveLength(0);
    await asUser(ids.adminA, async (c) => {
      await expectDenied(c.query(`insert into public.platform_settings (key, value) values ('x', '{}')`));
    });
  });

  it("juna_app hat keinen Zugriff auf Auth-Tabellen (Passwort-Hashes, Sessions)", async () => {
    for (const table of ['auth."user"', "auth.session", "auth.account", "auth.verification"]) {
      await asUser(ids.superadmin, async (c) => {
        await expectDenied(c.query(`select * from ${table}`));
      });
    }
  });

  it("Modulberechtigung kann nicht org-fremd verknüpft werden", async () => {
    await expect(
      db.query(`insert into public.module_permissions (org_id, user_id, module, can_read) values ($1, $2, 'mitgliederliste', true)`, [
        ids.orgA,
        ids.memberB,
      ]),
    ).rejects.toThrow(/foreign key/);
  });
});
