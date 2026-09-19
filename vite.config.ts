import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sert le projet depuis /gewicht-mania/, en local depuis la racine.
  base: process.env.GITHUB_ACTIONS ? '/gewicht-mania/' : '/',
  // Host on 0.0.0.0 so you can also open the dev build from a phone on the same wifi.
  server: { host: true, port: 5173 },
});
