export type Kind = "feature" | "question";
export type Status = "todo" | "in_progress" | "done";
export type Section = "KEN" | "FRANCO" | "SHAUN" | "Unsorted";

export const PEOPLE = [
  { id: "kamurao", name: "Ken", color: "var(--p-kamurao)" },
  { id: "Romaium", name: "Romaium", color: "var(--p-romaium)" },
  { id: "sunnyisabot123", name: "sunnyisabot123", color: "var(--p-sunny)" },
] as const;

export const STATUSES = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Complete" },
] as const;

export const KINDS: Kind[] = ["feature", "question"];
export const SECTIONS: Section[] = ["KEN", "FRANCO", "SHAUN", "Unsorted"];

export const DEFAULT_HANDLE = "kamurao";

export function personFor(handle: string | null | undefined) {
  if (!handle) return undefined;
  return PEOPLE.find((p) => p.id.toLowerCase() === handle.toLowerCase());
}

export function statusLabel(status: string) {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function isStatus(v: unknown): v is Status {
  return v === "todo" || v === "in_progress" || v === "done";
}

export function isKind(v: unknown): v is Kind {
  return v === "feature" || v === "question";
}

export function isSection(v: unknown): v is Section {
  return SECTIONS.includes(v as Section);
}

/** Resolves any casing of a known handle to its canonical spelling. */
export function canonicalHandle(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return personFor(v.trim())?.id ?? null;
}
