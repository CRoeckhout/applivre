import * as Crypto from 'expo-crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId(): string {
  return Crypto.randomUUID();
}

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
