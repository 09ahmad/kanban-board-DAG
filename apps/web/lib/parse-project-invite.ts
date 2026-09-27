/**
 * Parses a raw project invite string into a positive project ID.
 *
 * Accepts either:
 *  - a bare numeric ID ("147")
 *  - a full invite URL (".../projects/147/invite" or ".../projects/147")
 *
 * Returns null for anything that does not unambiguously name a project:
 * negative numbers, zero, non-numeric strings, partial URLs that embed an
 * ID mid-path, and dangerous schemes such as "javascript:".
 */
export function parseProjectInvite(raw: string): number | null {
  const value = raw.trim();
  // A bare positive integer — nothing else on the string.
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return n > 0 ? n : null;
  }
  // A URL whose path ends with /projects/<id> or /projects/<id>/invite,
  // but only when /projects/ is preceded by a hostname or path component
  // (not by another slash, which would produce //projects/…).
  const match = value.match(/(?<=\w)\/projects\/(\d+)(?:\/invite)?\/?$/);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}
