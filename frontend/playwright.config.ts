import { defineConfig } from "@playwright/test";

// The real stack: Laravel (serving the built app from public/app) on a freshly seeded PostgreSQL database.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8097",
    viewport: { width: 1280, height: 860 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: "php artisan migrate:fresh --seed --force && php artisan serve --host=127.0.0.1 --port=8097",
    cwd: "../backend",
    url: "http://127.0.0.1:8097/up",
    env: {
      DB_DATABASE: process.env.E2E_DB_DATABASE ?? "ujian_e2e", DB_HOST: process.env.E2E_DB_HOST ?? "127.0.0.1", DB_PORT: process.env.E2E_DB_PORT ?? "5590",
      SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:8097", APP_URL: "http://127.0.0.1:8097", PHP_CLI_SERVER_WORKERS: "4",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
