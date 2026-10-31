import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Built into the Laravel app's public/app folder; in development /api, /sanctum and /storage go to `php artisan serve`.
const api = process.env.API_URL ?? "http://localhost:8000";
export default defineConfig({
  base: "/app/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../backend/public/app", emptyOutDir: true },
  server: { port: 5174, proxy: { "/api": api, "/sanctum": api, "/storage": api } },
});
