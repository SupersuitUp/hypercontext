// Two text normalizers. Everything that compares a phrase with a name goes through `norm`, so
// "Dana : Freedom", "dana freedom" and "DANA  FREEDOM!" are one string.

/** Lowercase, strip accents, punctuation and emoji, drop a possessive 's, collapse spaces. */
export function norm(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]s(?![\p{L}\p{N}])/gu, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A record id from any text: `norm`, with dashes for spaces. Empty when nothing survives. */
export function slugify(text) {
  return norm(text).replace(/ /g, '-');
}

/** The pattern every record id matches. A path is only ever built from an id that passes it. */
export const ID = /^[a-z0-9][a-z0-9-]*$/;
