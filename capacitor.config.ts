import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kuaa.estudante",
  appName: "kuaa Estudante",
  webDir: "dist/public",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
};

export default config;
