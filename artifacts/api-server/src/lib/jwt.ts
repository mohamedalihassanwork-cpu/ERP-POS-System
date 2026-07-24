import jwt from "jsonwebtoken";
import { config } from "./config";

// Access token payload carried in the Authorization header. StoreId is always
// taken from here, never from the client, to enforce tenant isolation.
export interface AccessTokenPayload {
  sub: string; // user id
  storeId: string;
  roleId: string;
}

// Refresh token payload. `sid` ties the token to a server-side session row so
// it can be revoked and rotated.
export interface RefreshTokenPayload {
  sub: string;
  storeId: string;
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    issuer: config.jwt.issuer,
    expiresIn: config.jwt.accessTtlSeconds,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    issuer: config.jwt.issuer,
    expiresIn: config.jwt.refreshTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret, {
    issuer: config.jwt.issuer,
  });
  return decoded as AccessTokenPayload & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret, {
    issuer: config.jwt.issuer,
  });
  return decoded as RefreshTokenPayload & jwt.JwtPayload;
}
