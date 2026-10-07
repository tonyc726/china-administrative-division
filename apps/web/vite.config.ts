import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 多平台部署：Cloudflare/Vercel 用根路径 /。
// GitHub Pages 上文档站占 /<repo>/，本应用在 /<repo>/time-machine/，由 WEB_BASE 覆盖。
const base = process.env.WEB_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { target: 'es2020' },
});
