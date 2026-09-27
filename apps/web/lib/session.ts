/**
 * Deciding when a session needs extending.
 *
 * There is no refresh token, so the access token *is* the session and the server
 * will only reissue while it is still valid. That makes timing the whole problem:
 * ask too late and the session has already lapsed, ask too eagerly and every page
 * load costs a round trip for nothing.
 *
 * The expiry is read without verifying the signature on purpose. This decides
 * *when to ask the server*, and the server is what decides whether the answer is
 * valid — a tampered `exp` here can at worst cause one wasted request, never a
 * granted session.
 */

const MS_PER_SECOND = 1000;

/**
 * How long before expiry to extend. Long enough that a refresh is not triggered
 * on every visit, short enough that a browser left open for a week still has a
 * live session when someone comes back to it.
 */
export const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * MS_PER_SECOND;

function decodeExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(atob(parts[1]!)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True once the token is inside the refresh window, or unreadable. */
export function needsRefresh(token: string, now: number = Date.now()): boolean {
  const expiresAt = decodeExpiry(token);
  // An unreadable token cannot be reasoned about. Asking the server is cheaper
  // than guessing, and a bad token comes back 401 and signs the user out anyway.
  if (expiresAt === null) return true;
  return expiresAt * MS_PER_SECOND - now < REFRESH_WINDOW_MS;
}

/** True when the token cannot be used at all, so there is nothing to extend. */
export function isExpired(token: string, now: number = Date.now()): boolean {
  const expiresAt = decodeExpiry(token);
  if (expiresAt === null) return true;
  return expiresAt * MS_PER_SECOND <= now;
}
