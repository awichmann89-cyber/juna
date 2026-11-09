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

  // --- Phase 2: Aktionen / Reihen ---------------------------------------
  const seriesA = "aaaaaaaa-1111-0000-0000-000000000001";
  const seriesB = "bbbbbbbb-1111-0000-0000-000000000001";
  const actionA = "aaaaaaaa-2222-0000-0000-000000000001";
  const actionB = "bbbbbbbb-2222-0000-0000-000000000001";
  beforeAll(async () => {
    await db.query(
      `insert into public.action_series (id, org_id, name) values ($1, $2, 'Kuchenverkauf'), ($3, $4, 'Kuchenverkauf')`,
      [seriesA, ids.orgA, seriesB, ids.orgB],
    );
    await db.query(
      `insert into public.actions (id, org_id, series_id, title, date) values
        ($1, $2, $3, 'Kuchenverkauf Ostern', '2027-04-04'),
        ($4, $5, $6, 'Geheime Aktion B', '2027-05-01')`,
      [actionA, ids.orgA, seriesA, actionB, ids.orgB, seriesB],
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

  it("Aktionen und Reihen: nur die der eigenen Organisation sichtbar", async () => {
    const actions = await asUser(ids.memberA, async (c) => (await c.query("select id from public.actions")).rows);
    expect(actions.map((r) => r.id)).toEqual([actionA]);
    const series = await asUser(ids.memberA, async (c) => (await c.query("select id from public.action_series")).rows);
    expect(series.map((r) => r.id)).toEqual([seriesA]);
    const direct = await asUser(ids.memberA, async (c) =>
      (await c.query("select * from public.actions where id = $1", [actionB])).rows,
    );
    expect(direct).toHaveLength(0);
  });

  it("Mitglied legt Aktionen nur in der eigenen Organisation an (created_by automatisch)", async () => {
    const row = await asUser(ids.memberA, async (c) =>
      (await c.query(
        `insert into public.actions (org_id, title, date) values ($1, 'Waffelessen', '2027-02-14') returning created_by`,
        [ids.orgA],
      )).rows[0],
    );
    expect(row.created_by).toBe(ids.memberA);
    await asUser(ids.memberA, async (c) => {
      await expectDenied(
        c.query(`insert into public.actions (org_id, title, date) values ($1, 'Fremd', '2027-02-14')`, [ids.orgB]),
      );
    });
  });

  it("Aktion kann nicht mit einer Reihe einer fremden Organisation verknüpft werden", async () => {
    await asUser(ids.memberA, async (c) => {
      await expect(
        c.query(`insert into public.actions (org_id, series_id, title, date) values ($1, $2, 'Fremde Reihe', '2027-01-01')`, [
          ids.orgA,
          seriesB,
        ]),
      ).rejects.toThrow(/foreign key|permission denied/);
    });
  });

  it("Mitglied bearbeitet Aktionen der eigenen Org, aber nicht org_id oder fremde", async () => {
    const own = await asUser(ids.memberA, async (c) =>
      (await c.query(`update public.actions set title = 'Kuchenverkauf Ostern 2027' where id = $1 returning updated_by`, [actionA])).rows,
    );
    expect(own).toHaveLength(1);
    expect(own[0].updated_by).toBe(ids.memberA);
    const foreign = await asUser(ids.memberA, async (c) =>
      (await c.query(`update public.actions set title = 'Hack' where id = $1`, [actionB])).rowCount,
    );
    expect(foreign).toBe(0);
    await asUser(ids.memberA, async (c) => {
      await expectDenied(c.query(`update public.actions set org_id = $2 where id = $1`, [actionA, ids.orgB]));
    });
  });

  it("nur Admins löschen Aktionen und Reihen", async () => {
    const member = await asUser(ids.memberA, async (c) =>
      (await c.query(`delete from public.actions where id = $1`, [actionA])).rowCount,
    );
    expect(member).toBe(0);
    const admin = await asUser(ids.adminA, async (c) =>
      (await c.query(`delete from public.actions where id = $1`, [actionA])).rowCount,
    );
    expect(admin).toBe(1);
    const foreign = await asUser(ids.adminA, async (c) =>
      (await c.query(`delete from public.actions where id = $1`, [actionB])).rowCount,
    );
    expect(foreign).toBe(0);
  });

  it("Löschen einer Reihe behält die Aktionen (series_id wird null)", async () => {
    const remaining = await asUser(ids.adminA, async (c) => {
      await c.query(`delete from public.action_series where id = $1`, [seriesA]);
      return (await c.query(`select series_id from public.actions where id = $1`, [actionA])).rows;
    });
    expect(remaining).toEqual([{ series_id: null }]);
  });

  it("Aktion ohne Datum nur als Idee", async () => {
    await asUser(ids.memberA, async (c) => {
      await expect(
        c.query(`insert into public.actions (org_id, title, status) values ($1, 'Ohne Datum', 'geplant')`, [ids.orgA]),
      ).rejects.toThrow(/actions_date_required/);
    });
    const idea = await asUser(ids.memberA, async (c) =>
      (await c.query(`insert into public.actions (org_id, title, status) values ($1, 'Kinderdisco?', 'idee')`, [ids.orgA])).rowCount,
    );
    expect(idea).toBe(1);
  });

  // --- Phase 3: Planung --------------------------------------------------
  it("Planung: Zeitplan, Teilnahme, Aufgaben, Feedback nur innerhalb der Organisation", async () => {
    // Fixture als Owner: Aktion in A (ohne Reihe), Aktion B existiert schon
    const actA = "aaaaaaaa-3333-0000-0000-000000000001";
    await db.query(`insert into public.actions (id, org_id, title, date) values ($1, $2, 'Zeltlager', '2027-07-10')`, [actA, ids.orgA]);
    try {
      // Mitglied A legt Slot, Teilnahme, Aufgabe, Feedback an
      const res = await asUser(ids.memberA, async (c) => {
        const slot = (await c.query(
          `insert into public.action_slots (org_id, action_id, title, starts_at, ends_at) values ($1, $2, 'Aufbau', '2027-07-10 09:00', '2027-07-10 11:00') returning id`,
          [ids.orgA, actA],
        )).rows[0].id;
        await c.query(`insert into public.action_participants (org_id, action_id, user_id, status) values ($1, $2, $3, 'dabei')`, [ids.orgA, actA, ids.adminA]);
        await c.query(`update public.action_participants set status = 'vielleicht' where action_id = $1 and user_id = $2`, [actA, ids.adminA]);
        const task = (await c.query(
          `insert into public.tasks (org_id, action_id, title, due_days_before) values ($1, $2, 'Plakat drucken', 14) returning id, created_by`,
          [ids.orgA, actA],
        )).rows[0];
        await c.query(`insert into public.task_assignees (org_id, task_id, user_id) values ($1, $2, $3)`, [ids.orgA, task.id, ids.memberA]);
        const fb = (await c.query(
          `insert into public.feedback (org_id, action_id, kind, text) values ($1, $2, 'naechstes_mal', 'Mehr Kuchen') returning author_id`,
          [ids.orgA, actA],
        )).rows[0];
        const hist = (await c.query(
          `select old_status, new_status, changed_by from public.participation_history where action_id = $1 order by id`,
          [actA],
        )).rows;
        return { slot, task, fb, hist };
      });
      expect(res.task.created_by).toBe(ids.memberA);
      expect(res.fb.author_id).toBe(ids.memberA);
      expect(res.hist).toEqual([
        { old_status: null, new_status: "dabei", changed_by: ids.memberA },
        { old_status: "dabei", new_status: "vielleicht", changed_by: ids.memberA },
      ]);

      // Fremde Organisation: weder sehen noch verknüpfen
      await db.query(`insert into public.action_slots (org_id, action_id, title, starts_at, ends_at) values ($1, $2, 'Slot A', '2027-07-10 12:00', '2027-07-10 13:00')`, [ids.orgA, actA]);
      const seen = await asUser(ids.memberB, async (c) => ({
        slots: (await c.query(`select * from public.action_slots where action_id = $1`, [actA])).rows,
        hist: (await c.query(`select * from public.participation_history where action_id = $1`, [actA])).rows,
      }));
      expect(seen.slots).toHaveLength(0);
      expect(seen.hist).toHaveLength(0);
      // B kann sich nicht in eine Aktion von A eintragen (RLS bzw. org-sicherer Fremdschlüssel)
      await asUser(ids.memberB, async (c) => {
        await expect(
          c.query(`insert into public.action_participants (org_id, action_id, user_id, status) values ($1, $2, $3, 'dabei')`, [ids.orgB, actA, ids.memberB]),
        ).rejects.toThrow(/foreign key|permission denied|row-level security/);
      });
      await asUser(ids.memberB, async (c) => {
        await expectDenied(
          c.query(`insert into public.action_participants (org_id, action_id, user_id, status) values ($1, $2, $3, 'dabei')`, [ids.orgA, actA, ids.memberB]),
        );
      });
      // Org A kann kein Mitglied aus B eintragen (FK user/org)
      await asUser(ids.memberA, async (c) => {
        await expect(
          c.query(`insert into public.action_participants (org_id, action_id, user_id, status) values ($1, $2, $3, 'dabei')`, [ids.orgA, actA, ids.memberB]),
        ).rejects.toThrow(/foreign key/);
      });
      // Historie ist nur lesbar
      await asUser(ids.memberA, async (c) => {
        await expectDenied(c.query(`delete from public.participation_history where action_id = $1`, [actA]));
      });
    } finally {
      // Kaskade inkl. Teilnahmen/Historie darf beim Löschen der Aktion nicht scheitern
      await db.query(`delete from public.actions where id = $1`, [actA]);
    }
  });

  it("Feedback: nur Autor*in oder Admin ändern/löschen; Autor nicht fälschbar", async () => {
    const actA = "aaaaaaaa-3333-0000-0000-000000000002";
    await db.query(`insert into public.actions (id, org_id, title, date) values ($1, $2, 'Kinderkino', '2027-03-01')`, [actA, ids.orgA]);
    const fbId = (await db.query(
      `insert into public.feedback (org_id, action_id, kind, text, author_id) values ($1, $2, 'gut', 'Toller Film', $3) returning id`,
      [ids.orgA, actA, ids.adminA],
    )).rows[0].id;
    try {
      const byMember = await asUser(ids.memberA, async (c) => (await c.query(`delete from public.feedback where id = $1`, [fbId])).rowCount);
      expect(byMember).toBe(0);
      await asUser(ids.memberA, async (c) => {
        await expectDenied(
          c.query(`insert into public.feedback (org_id, action_id, kind, text, author_id) values ($1, $2, 'gut', 'Fake', $3)`, [ids.orgA, actA, ids.adminA]),
        );
      });
      const byAdmin = await asUser(ids.adminA, async (c) => (await c.query(`update public.feedback set text = 'Sehr toller Film' where id = $1`, [fbId])).rowCount);
      expect(byAdmin).toBe(1);
    } finally {
      await db.query(`delete from public.actions where id = $1`, [actA]);
    }
  });
});
