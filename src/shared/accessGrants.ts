/**
 * Capability tokens for the alternate delivery route.
 *
 * The share link is a bearer capability handed to a recipient who is not the
 * authenticated user, so it is scoped to a single invoice, expires, is
 * revocable, and is stored only as a SHA-256 digest. The plaintext token is
 * returned exactly once, at issue time.
 */

export const ACCESS_ROUTE_PREFIX = '/api/demo/invoice-access/';
export const ACCESS_GRANT_TTL_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;

function requireCrypto(): Crypto {
  const candidate = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!candidate?.subtle || typeof candidate.getRandomValues !== 'function') {
    throw new Error('A Web Crypto implementation is required to issue access grants.');
  }
  return candidate;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function createAccessToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  requireCrypto().getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashAccessToken(token: string): Promise<string> {
  const digest = await requireCrypto().subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Length-independent, value-independent comparison for two hex digests. */
export function digestsMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function buildAccessUrl(token: string): string {
  return `${ACCESS_ROUTE_PREFIX}${token}`;
}

export type AccessGrantRejection = 'revoked' | 'expired';

export function evaluateGrantUsability(
  grant: { revokedAt?: string; expiresAt: string },
  now = new Date(),
): { usable: boolean; reason?: AccessGrantRejection } {
  if (grant.revokedAt) return { usable: false, reason: 'revoked' };
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) return { usable: false, reason: 'expired' };
  return { usable: true };
}
