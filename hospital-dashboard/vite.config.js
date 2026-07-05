import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone hospital dashboard. Runs on :5174 (the phone app uses :5173) and
// proxies /api → the FastAPI backend during dev, so both front-ends share one
// backend. For a hosted build, set VITE_API_BASE to the deployed backend URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
