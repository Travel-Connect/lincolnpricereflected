import { defineConfig } from "playwright/test";

export default defineConfig({
  use: {
    headless: false, // 2FA 対応のため headful がデフォルト
    browserName: "chromium",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
