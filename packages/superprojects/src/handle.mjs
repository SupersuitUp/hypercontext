export const HANDLE_RE = /^[a-z][a-z0-9]{1,23}$/;

export const undatedSlug = (name) =>
  String(name).replace(/^\d{4}-\d{2}-\d{2}-/, "");
export const NICKNAME_MAX = 16;

export function validNickname(s) {
  if (typeof s !== "string") return null;
  const t = s
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (t.length < 2 || t.length > NICKNAME_MAX) return null;
  if (/[/\\:\n]/.test(t) || t.split(/\s+/).length > 2) return null;
  return t;
}
