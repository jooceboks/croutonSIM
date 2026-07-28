import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies the three API paths to the Express server on :3000, so the
// browser talks to the API on the same origin and we never touch CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/events": "http://localhost:3000",
      "/state": "http://localhost:3000",
      "/people": "http://localhost:3000",
    },
  },
});
