import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Lets `npm run dev` reach the gateway-backed endpoint when served via `vercel dev`.
      // Vite-only dev (no serverless) falls back to the BFS bot automatically.
    },
  },
});
