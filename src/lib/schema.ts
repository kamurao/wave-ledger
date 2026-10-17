import {
  bigserial,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: text("goal").notNull().default(""),
  targetDate: date("target_date"),
  status: text("status").notNull().default("upcoming"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const epics = pgTable("epics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  color: text("color").notNull().default("e1"),
  status: text("status").notNull().default("active"),
  owner: text("owner"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(),
  /** Short permanent number (#12), from a sequence. Never reused. */
  number: integer("number")
    .notNull()
    .default(sql`nextval('tickets_number_seq')`),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("feature"),
  status: text("status").notNull().default("todo"),
  assignee: text("assignee"),
  epicId: text("epic_id").references(() => epics.id, { onDelete: "set null" }),
  milestoneId: text("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
  priority: text("priority").notNull().default("p2"),
  estimate: text("estimate"),
  labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
  dependsOn: text("depends_on").array().notNull().default(sql`'{}'::text[]`),
  blockedReason: text("blocked_reason").notNull().default(""),
  designDoc: text("design_doc").notNull().default(""),
  criteria: text("criteria").notNull().default(""),
  decision: text("decision").notNull().default(""),
  branch: text("branch").notNull().default(""),
  notes: text("notes").notNull().default(""),
  rank: doublePrecision("rank").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("ticket_events_ticket_id_at_idx").on(t.ticketId, t.at.desc())],
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    author: text("author").notNull(),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("ticket_comments_ticket_id_at_idx").on(t.ticketId, t.at)],
);

export type TicketRow = typeof tickets.$inferSelect;
export type TicketEventRow = typeof ticketEvents.$inferSelect;
export type TicketCommentRow = typeof ticketComments.$inferSelect;
export type EpicRow = typeof epics.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
