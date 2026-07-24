import crypto from "node:crypto";

// All authentication signing material is derived deterministically from the
// existing SESSION_SECRET so no additional secret needs to be provisioned.
// Two independent keys (access / refresh) are derived via HKDF-like HMAC so a
// leak of one signing context never reveals the other.

const sessionSecret = process.env["SESSION_SECRET"];

if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET environment variable is required but was not provided.",
  );
}

function deriveKey(label: string): string {
  return crypto
    .createHmac("sha256", sessionSecret as string)
    .update(label)
    .digest("hex");
}

export const config = {
  jwt: {
    accessSecret: deriveKey("pos:jwt:access"),
    refreshSecret: deriveKey("pos:jwt:refresh"),
    accessTtlSeconds: 15 * 60, // 15 minutes
    refreshTtlSeconds: 7 * 24 * 60 * 60, // 7 days
    issuer: "pos-api",
  },
  auth: {
    bcryptRounds: 12,
    maxFailedAttempts: 5,
    lockoutMinutes: 15,
  },
  cookies: {
    refreshName: "pos_refresh",
    // The web client and API share an origin through the Replit proxy, so a
    // strict same-site cookie is sufficient and safest.
    sameSite: "strict" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/api/auth",
  },
} as const;
