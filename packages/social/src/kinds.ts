import type { KindAdapter } from './types';

const registry = new Map<string, KindAdapter>();

export function registerKind<T>(kind: string, adapter: KindAdapter<T>): void {
  registry.set(kind, adapter as KindAdapter);
}

export function getKind(kind: string): KindAdapter {
  const adapter = registry.get(kind);
  if (!adapter) {
    throw new Error(`@grimolia/social: unregistered kind "${kind}"`);
  }
  return adapter;
}

export function hasKind(kind: string): boolean {
  return registry.has(kind);
}

export function listKinds(): string[] {
  return Array.from(registry.keys());
}
