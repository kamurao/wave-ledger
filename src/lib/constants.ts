export type Kind = "feature" | "design" | "question" | "bug" | "task" | "art" | "audio";
export type Status = "backlog" | "todo" | "in_progress" | "review" | "done";
export type Priority = "p0" | "p1" | "p2" | "p3";
export type Estimate = "XS" | "S" | "M" | "L" | "XL";
export type EpicStatus = "active" | "paused" | "done" | "archived";
export type MilestoneStatus = "upcoming" | "active" | "done";

export const PEOPLE = [
  { id: "kamurao", name: "Ken", color: "var(--p-kamurao)" },
  { id: "Romaium", name: "Romaium", color: "var(--p-romaium)" },
  { id: "sunnyisabot123", name: "sunnyisabot123", color: "var(--p-sunny)" },
] as const;

/**
 * The flow. `todo` and `in_progress` and `done` keep their original ids so every
 * agent that learned the old three-column contract still works; the two new
 * stages sit either side of them.
 */
export const STATUSES = [
  { id: "backlog", label: "Backlog", hint: "Ideas and open questions. Not yet scoped." },
  { id: "todo", label: "Ready", hint: "Scoped, unblocked, next in line." },
  { id: "in_progress", label: "In progress", hint: "Someone has claimed it." },
  { id: "review", label: "Review", hint: "Built or drafted. Needs a playtest or a sign-off." },
  { id: "done", label: "Done", hint: "Shipped, or the question is decided." },
] as const;

export const KINDS = [
  { id: "feature", label: "Feature", hint: "Something to build" },
  { id: "design", label: "Design", hint: "A spec, system or rule set to write down" },
  { id: "question", label: "Question", hint: "A decision to make" },
  { id: "bug", label: "Bug", hint: "Something broken or off-balance" },
  { id: "task", label: "Task", hint: "Chores, tooling, research" },
  { id: "art", label: "Art", hint: "Visual asset or art direction" },
  { id: "audio", label: "Audio", hint: "Music, SFX, voice" },
] as const;

export const PRIORITIES = [
  { id: "p0", label: "P0", name: "Critical", hint: "Blocks everything. Drop what you're doing." },
  { id: "p1", label: "P1", name: "High", hint: "Needed for the current milestone." },
  { id: "p2", label: "P2", name: "Medium", hint: "Should happen this milestone." },
  { id: "p3", label: "P3", name: "Low", hint: "Nice to have. Cut first." },
] as const;

export const ESTIMATES: Estimate[] = ["XS", "S", "M", "L", "XL"];

export const EPIC_STATUSES: EpicStatus[] = ["active", "paused", "done", "archived"];
export const MILESTONE_STATUSES: MilestoneStatus[] = ["upcoming", "active", "done"];

/** Eight palette slots; the CSS defines --e1 .. --e8 for light and dark. */
export const EPIC_COLORS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"] as const;

export const DEFAULT_HANDLE = "kamurao";

export function personFor(handle: string | null | undefined) {
  if (!handle) return undefined;
  return PEOPLE.find((p) => p.id.toLowerCase() === handle.toLowerCase());
}

export function statusLabel(status: string) {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function kindLabel(kind: string) {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function isStatus(v: unknown): v is Status {
  return STATUSES.some((s) => s.id === v);
}

export function isKind(v: unknown): v is Kind {
  return KINDS.some((k) => k.id === v);
}

export function isPriority(v: unknown): v is Priority {
  return PRIORITIES.some((p) => p.id === v);
}

export function isEstimate(v: unknown): v is Estimate {
  return ESTIMATES.includes(v as Estimate);
}

export function isEpicStatus(v: unknown): v is EpicStatus {
  return EPIC_STATUSES.includes(v as EpicStatus);
}

export function isMilestoneStatus(v: unknown): v is MilestoneStatus {
  return MILESTONE_STATUSES.includes(v as MilestoneStatus);
}

export function isEpicColor(v: unknown): v is (typeof EPIC_COLORS)[number] {
  return EPIC_COLORS.includes(v as (typeof EPIC_COLORS)[number]);
}

/** Resolves any casing of a known handle to its canonical spelling. */
export function canonicalHandle(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return personFor(v.trim())?.id ?? null;
}

/** What an agent needs to know to write a valid ticket, served at /api/meta. */
export const META = {
  statuses: STATUSES.map(({ id, label, hint }) => ({ id, label, hint })),
  kinds: KINDS.map(({ id, label, hint }) => ({ id, label, hint })),
  priorities: PRIORITIES.map(({ id, name, hint }) => ({ id, name, hint })),
  estimates: ESTIMATES,
  epic_statuses: EPIC_STATUSES,
  milestone_statuses: MILESTONE_STATUSES,
  epic_colors: EPIC_COLORS,
  people: PEOPLE.map(({ id, name }) => ({ id, name })),
};
