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