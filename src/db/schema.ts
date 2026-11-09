/**
 * Drizzle-Schema (nur für typisierte Abfragen). Quelle der Wahrheit sind die SQL-Migrationen
 * in db/migrations – Änderungen immer dort UND hier nachziehen.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  foreignKey,
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

// --- Phase 2: Aktionen ----------------------------------------------------
export const actionStatus = pgEnum("action_status", ["idee", "geplant", "in_planung", "durchgefuehrt", "abgeschlossen"]);

export const seriesColors = ["orange", "red", "pink", "purple", "blue", "teal", "green", "yellow", "gray"] as const;

export const actionSeries = pgTable("action_series", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color", { enum: seriesColors }).notNull().default("orange"),
  archived: boolean("archived").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id"),
    title: text("title").notNull(),
    status: actionStatus("status").notNull().default("geplant"),
    date: date("date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    location: text("location"),
    notes: jsonb("notes").$type<unknown[]>(),
    notesText: text("notes_text").notNull().default(""),
    notesVersion: integer("notes_version").notNull().default(0),
    notesUpdatedAt: ts("notes_updated_at"),
    notesUpdatedBy: text("notes_updated_by"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.seriesId, t.orgId], foreignColumns: [actionSeries.id, actionSeries.orgId] }),
  ],
);

// --- Phase 3: Planung --------------------------------------------------------
export const participationStatus = pgEnum("participation_status", ["dabei", "vielleicht", "nicht_dabei"]);
export const taskStatus = pgEnum("task_status", ["offen", "erledigt"]);
export const feedbackKind = pgEnum("feedback_kind", ["gut", "verbessern", "naechstes_mal"]);
export const followupResolution = pgEnum("followup_resolution", ["aufgabe", "beruecksichtigt"]);

const localTs = (name: string) => timestamp(name, { mode: "string" });

export const actionSlots = pgTable("action_slots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  actionId: uuid("action_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: localTs("starts_at").notNull(),
  endsAt: localTs("ends_at").notNull(),
  minPeople: integer("min_people"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const actionParticipants = pgTable(
  "action_participants",
  {
    orgId: uuid("org_id").notNull(),
    actionId: uuid("action_id").notNull(),
    userId: text("user_id").notNull(),
    status: participationStatus("status").notNull(),
    presentFrom: localTs("present_from"),
    presentUntil: localTs("present_until"),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.actionId, t.userId] })],
);

export const slotOverrides = pgTable(
  "slot_overrides",
  {
    orgId: uuid("org_id").notNull(),
    slotId: uuid("slot_id").notNull(),
    userId: text("user_id").notNull(),
    present: boolean("present").notNull(),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.userId] })],
);

export const participationHistory = pgTable("participation_history", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  orgId: uuid("org_id").notNull(),
  actionId: uuid("action_id").notNull(),
  userId: text("user_id").notNull(),
  changedBy: text("changed_by"),
  oldStatus: participationStatus("old_status"),
  newStatus: participationStatus("new_status"),
  oldFrom: localTs("old_from"),
  newFrom: localTs("new_from"),
  oldUntil: localTs("old_until"),
  newUntil: localTs("new_until"),
  changedAt: ts("changed_at").notNull().defaultNow(),
});

export const actionPlanners = pgTable(
  "action_planners",
  {
    orgId: uuid("org_id").notNull(),
    actionId: uuid("action_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.actionId, t.userId] })],
);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  actionId: uuid("action_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatus("status").notNull().default("offen"),
  dueDaysBefore: integer("due_days_before"),
  dueDate: date("due_date", { mode: "string" }),
  doneAt: ts("done_at"),
  doneBy: text("done_by"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const taskAssignees = pgTable(
  "task_assignees",
  {
    orgId: uuid("org_id").notNull(),
    taskId: uuid("task_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  actionId: uuid("action_id").notNull(),
  kind: feedbackKind("kind").notNull(),
  text: text("text").notNull(),
  authorId: text("author_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const feedbackFollowups = pgTable(
  "feedback_followups",
  {
    orgId: uuid("org_id").notNull(),
    feedbackId: uuid("feedback_id").notNull(),
    actionId: uuid("action_id").notNull(),
    resolution: followupResolution("resolution").notNull(),
    taskId: uuid("task_id"),
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.feedbackId, t.actionId] })],
);

// --- Phase 4: Treffen & Dateien ----------------------------------------------
export const meetingType = pgEnum("meeting_type", ["jahresplanung", "monatstreffen", "sonstiges"]);
export const meetingStatus = pgEnum("meeting_status", ["geplant", "laufend", "abgeschlossen"]);
export const agendaKind = pgEnum("agenda_kind", ["feedback", "planung", "sonstiges"]);
export const attendanceStatus = pgEnum("attendance_status", ["anwesend", "entschuldigt", "fehlt"]);

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  type: meetingType("type").notNull().default("monatstreffen"),
  title: text("title").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: time("start_time"),
  location: text("location"),
  status: meetingStatus("status").notNull().default("geplant"),
  protocolOwner: text("protocol_owner"),
  notes: jsonb("notes").$type<unknown[]>(),
  notesText: text("notes_text").notNull().default(""),
  notesVersion: integer("notes_version").notNull().default(0),
  notesUpdatedAt: ts("notes_updated_at"),
  notesUpdatedBy: text("notes_updated_by"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const meetingAgenda = pgTable("meeting_agenda", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  meetingId: uuid("meeting_id").notNull(),
  actionId: uuid("action_id"),
  title: text("title"),
  kind: agendaKind("kind").notNull().default("planung"),
  position: integer("position").notNull().default(0),
  done: boolean("done").notNull().default(false),
});

export const meetingAttendance = pgTable(
  "meeting_attendance",
  {
    orgId: uuid("org_id").notNull(),
    meetingId: uuid("meeting_id").notNull(),
    userId: text("user_id").notNull(),
    status: attendanceStatus("status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] })],
);

export const actionFiles = pgTable("action_files", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  actionId: uuid("action_id").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  groupLabel: text("group_label"),
  uploadedBy: text("uploaded_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const calendarFeeds = pgTable("calendar_feeds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  userId: text("user_id").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastAccessedAt: ts("last_accessed_at"),
});

export type MeetingType = (typeof meetingType.enumValues)[number];
export type MeetingStatus = (typeof meetingStatus.enumValues)[number];
export type AgendaKind = (typeof agendaKind.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatus.enumValues)[number];

export type ParticipationStatus = (typeof participationStatus.enumValues)[number];
export type FeedbackKind = (typeof feedbackKind.enumValues)[number];
export type TaskStatus = (typeof taskStatus.enumValues)[number];

export type ActionStatus = (typeof actionStatus.enumValues)[number];
export type SeriesColor = (typeof seriesColors)[number];

export type OrgRole = (typeof orgRole.enumValues)[number];
export type MemberStatus = (typeof memberStatus.enumValues)[number];
