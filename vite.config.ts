import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/manokshetra/
export default defineConfig({
  base: '/manokshetra/',
  plugins: [react()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
