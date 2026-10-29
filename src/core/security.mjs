// Passcodes and the recovery code are stored hashed with a per-farm salt.

export async function hashCode(code, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(code)}`);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt() {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Recovery code shown once at setup: four groups of four, no look-alike characters. */
export function newRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  const s = [...a].map((b) => chars[b % chars.length]).join('');
  return s.match(/.{4}/g).join('-');
}

export const validPasscode = (code) => /^\d{4,8}$/.test(String(code || ''));
