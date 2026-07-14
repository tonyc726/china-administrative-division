import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 多平台部署：GitHub Pages 是项目页，需要 /<repo>/ 前缀；Cloudflare/Vercel 用根路径 /。
// 与 docs-site 的 DOCS_BASE 同一套约定，部署时用 WEB_BASE 覆盖。
const base = process.env.WEB_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { target: 'es2020' },
});
