import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for Antidote+.
 * The dev server proxies /api to the FastAPI Gemini proxy so the browser
 * never touches the GEMINI_API_KEY (it stays server-side, see /backend).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
