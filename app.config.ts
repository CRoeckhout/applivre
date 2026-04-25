import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const SUFFIX = IS_DEV ? ".dev" : "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Applivre 🐛" : (config.name ?? "applivre"),
  slug: config.slug ?? "applivre",
  ios: {
    ...config.ios,
    bundleIdentifier: `com.corentin.applivre${SUFFIX}`,
  },
  android: {
    ...config.android,
    package: `com.corentin.applivre${SUFFIX}`,
  },
});
