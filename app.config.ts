import type { ConfigContext, ExpoConfig } from "expo/config";

// Source de vérité runtime : constants/app.ts. Ce fichier est chargé
// par le CLI Expo en CJS (sans résolution .ts) → on duplique les
// littéraux ici plutôt qu'importer.
const APP_SLUG = "grimolia";
const APP_NAME = "Grimolia";
const APP_BUNDLE_ID_BASE = "com.corentin.grimolia";

const IS_DEV = process.env.APP_VARIANT === "development";
const SUFFIX = IS_DEV ? ".dev" : "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? `${APP_NAME} 🐛` : (config.name ?? APP_NAME),
  slug: config.slug ?? APP_SLUG,
  ios: {
    ...config.ios,
    bundleIdentifier: `${APP_BUNDLE_ID_BASE}${SUFFIX}`,
  },
  android: {
    ...config.android,
    package: `${APP_BUNDLE_ID_BASE}${SUFFIX}`,
  },
});
