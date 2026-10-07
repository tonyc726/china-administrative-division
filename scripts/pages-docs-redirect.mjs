#!/usr/bin/env node
/**
 * 文档站改到 Pages 根路径之后，给旧的 /docs/ 地址各放一份跳转页。
 *
 * dist/guide/getting-started.html
 *   → dist/docs/guide/getting-started.html
 *   → dist/docs/guide/getting-started/index.html
 * 两者都跳到 DOCS_BASE + guide/getting-started。
 *
 * 用法：node scripts/pages-docs-redirect.mjs <dist>
 * 跳过 dist 顶层的 time-machine/（时光机）和已生成的 docs/。
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const docsBase = process.env.DOCS_BASE ?? '/china-administrative-division/';
const prefix = docsBase.endsWith('/') ? docsBase : `${docsBase}/`;
const SKIP_TOP = new Set(['docs', 'time-machine']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === dist && SKIP_TOP.has(entry.name)) continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function pageUrl(relPosix) {
  if (relPosix === 'index.html') return prefix;
  if (relPosix.endsWith('/index.html')) {
    return `${prefix}${relPosix.slice(0, -'index.html'.length)}`;
  }
  return `${prefix}${relPosix.slice(0, -'.html'.length)}`;
}

function redirectHtml(target) {
  const safe = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>文档已搬迁</title>
  <link rel="canonical" href="${safe}">
  <meta http-equiv="refresh" content="0; url=${safe}">
  <script>location.replace(${JSON.stringify(target)}+location.search+location.hash)</script>
</head>
<body>
  <p>这一页已搬到 <a href="${safe}">文档站</a>。</p>
</body>
</html>
`;
}

const files = await walk(dist);
let count = 0;
for (const file of files) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  const html = redirectHtml(pageUrl(rel));
  const htmlOut = path.join(dist, 'docs', rel);
  await mkdir(path.dirname(htmlOut), { recursive: true });
  await writeFile(htmlOut, html);
  count += 1;
  if (rel !== 'index.html' && !rel.endsWith('/index.html')) {
    const slug = rel.slice(0, -'.html'.length);
    const indexOut = path.join(dist, 'docs', slug, 'index.html');
    await mkdir(path.dirname(indexOut), { recursive: true });
    await writeFile(indexOut, html);
    count += 1;
  }
}

console.log(`docs redirects: ${count} html files under ${path.join(dist, 'docs')}`);
