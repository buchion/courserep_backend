import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto';

export const BRIDGE_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Short-lived, single-use token the mobile WebView presents to the public
 * login-bridge endpoint. Format: `<nonce>.<expiresAt>.<hmac>`. The HMAC binds
 * the token to the onboarding session id so it cannot be replayed elsewhere.
 */
export function createBridgeToken(
  sessionId: string,
  secret: string,
): { token: string; tokenHash: string; expiresAt: Date } {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + BRIDGE_TOKEN_TTL_MS);
  const payload = `${nonce}.${expiresAt.getTime()}`;
  const signature = sign(`${sessionId}.${payload}`, secret);
  const token = `${payload}.${signature}`;
  return { token, tokenHash: hashToken(token), expiresAt };
}

export function verifyBridgeToken(
  token: string,
  sessionId: string,
  secret: string,
  storedHash: string | null,
  expiresAt: Date | null,
): boolean {
  if (!storedHash || !expiresAt) return false;
  if (Date.now() > expiresAt.getTime()) return false;
  if (!safeEqual(hashToken(token), storedHash)) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, exp, signature] = parts;
  const expected = sign(`${sessionId}.${nonce}.${exp}`, secret);
  return safeEqual(signature, expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
