const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Matches the shape of ids the original board's add button produced. */
export function randomId(len = 20): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** `Fast-Forward` becomes `<prefix>-fast-forward`; `t` for tickets, `e` epics, `m` milestones. */
export function slugWith(prefix: string, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug ? `${prefix}-${slug}` : `${prefix}-${randomId(8)}`;
}

/** `Fast-Forward` becomes `t-fast-forward`, the convention agents write. */
export function slugId(title: string): string {
  return slugWith("t", title);
}
