/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injecté par vite.config.ts depuis `app.json > expo.version` au build.
// Utilisé par le form "Quoi de neuf" pour pré-remplir la version courante.
declare const __APP_VERSION__: string;
