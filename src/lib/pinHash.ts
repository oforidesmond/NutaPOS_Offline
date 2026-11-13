function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${saltHex}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

export async function verifyPin(pin: string, saltHex: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPin(pin, saltHex);
  if (actual.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i += 1) {
    mismatch |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return mismatch === 0;
}
