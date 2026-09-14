import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Host on 0.0.0.0 so you can also open the dev build from a phone on the same wifi.
  server: { host: true, port: 5173 },
});
