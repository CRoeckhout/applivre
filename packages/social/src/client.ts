import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function configure(client: SupabaseClient): void {
  _client = client;
}

export function getClient(): SupabaseClient {
  if (!_client) {
    throw new Error(
      '@grimolia/social: client not configured. Call configure(supabase) at app boot.',
    );
  }
  return _client;
}
