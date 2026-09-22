import { bigserial, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("feature"),
  status: text("status").notNull().default("todo"),
  assignee: text("assignee"),
  section: text("section").notNull().default("Unsorted"),
  branch: text("branch").notNull().default(""),
  notes: text("notes").notNull().default(""),
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

export type TicketRow = typeof tickets.$inferSelect;
export type TicketEventRow = typeof ticketEvents.$inferSelect;
