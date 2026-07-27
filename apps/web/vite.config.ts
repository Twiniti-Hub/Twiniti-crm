import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  // VITE_API_URL defaults to empty so the SPA uses same-origin + Vite proxy in dev.
  server: {
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/mcp": { target: "http://localhost:4000", changeOrigin: true },
      "/health": { target: "http://localhost:4000", changeOrigin: true }
    }
  }
});
