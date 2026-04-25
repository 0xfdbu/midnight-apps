export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function padTo32Bytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 32) {
    // If the array is 32 or more, take the last 32 bytes
    return bytes.slice(bytes.length - 32);
  }
  const padded = new Uint8Array(32);
  const start = 32 - bytes.length;
  padded.set(bytes, start);
  return padded;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

export async function deriveKey(masterKey: Uint8Array, purpose: string): Promise<Uint8Array> {
  const data = new Uint8Array(masterKey.length + purpose.length);
  data.set(masterKey);
  data.set(new TextEncoder().encode(purpose), masterKey.length);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

export async function deriveKeyFromPassword(password: string, salt: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derived);
}

export function generateRandomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes));
}

export function validatePassword(password: string): string | null {
  if (password.length < 16) return 'Password must be at least 16 characters';
  const types = [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%^&*(),.?":{}|<>+/=\-_\[\]]/];
  const typeCount = types.filter(t => t.test(password)).length;
  if (typeCount < 3) return 'Password must use at least 3 of: uppercase, lowercase, digits, special characters';
  let consecutive = 1;
  for (let i = 1; i < password.length; i++) {
    if (password[i] === password[i - 1]) {
      consecutive++;
      if (consecutive > 3) return 'Password cannot have more than 3 consecutive identical characters';
    } else {
      consecutive = 1;
    }
  }
  const lower = password.toLowerCase();
  for (let i = 0; i <= lower.length - 4; i++) {
    let asc = 1, desc = 1;
    for (let j = 1; j < 4; j++) {
      if (lower.charCodeAt(i + j) === lower.charCodeAt(i + j - 1) + 1) asc++;
      else asc = 1;
      if (lower.charCodeAt(i + j) === lower.charCodeAt(i + j - 1) - 1) desc++;
      else desc = 1;
    }
    if (asc >= 4 || desc >= 4) return 'Password cannot have sequential patterns (e.g., 1234, abcd)';
  }
  return null;
}