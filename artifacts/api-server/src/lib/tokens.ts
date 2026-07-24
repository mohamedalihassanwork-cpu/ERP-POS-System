import crypto from "node:crypto";

// Refresh tokens are JWTs, but we additionally persist only a SHA-256 hash of
// each issued token so a database leak never exposes usable tokens. Lookups
// compare hashes.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
