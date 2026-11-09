/**
 * Drizzle-Schema (nur für typisierte Abfragen). Quelle der Wahrheit sind die SQL-Migrationen
 * in db/migrations – Änderungen immer dort UND hier nachziehen.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// --- Better Auth (Schema "auth") -------------------------------------------
export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = authSchema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = authSchema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verification = authSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimit = authSchema.table("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// --- juna ------------------------------------------------------------------
export const orgStatus = pgEnum("org_status", ["active", "suspended"]);
export const applicationStatus = pgEnum("application_status", ["pending", "approved", "rejected"]);
export const orgRole = pgEnum("org_role", ["admin", "member"]);
export const memberStatus = pgEnum("member_status", ["invited", "active", "deactivated"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: orgStatus("status").notNull().default("active"),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const organizationApplications = pgTable("organization_applications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: text("org_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  message: text("message"),
  status: applicationStatus("status").notNull().default("pending"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  role: orgRole("role").notNull().default("member"),
  status: memberStatus("status").notNull().default("invited"),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  reminderTime: time("reminder_time").notNull().default("18:00"),
  timezone: text("timezone"),
  notificationPrefs: jsonb("notification_prefs").notNull().default({}),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }).unique(),
  invitedAt: ts("invited_at"),
  activatedAt: ts("activated_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const modulePermissions = pgTable(
  "module_permissions",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    module: text("module", { enum: ["kasse", "mitgliederliste"] }).notNull(),
    canRead: boolean("can_read").notNull().default(false),
    canWrite: boolean("can_write").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.module] })],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export type OrgRole = (typeof orgRole.enumValues)[number];
export type MemberStatus = (typeof memberStatus.enumValues)[number];
