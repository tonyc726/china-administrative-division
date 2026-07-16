/**
 * 预渲染脚本 - 构建后执行
 *
 * 读取 dist 中的 JSON 数据，用 ReactDOMServer 渲染 App 组件
 * 将渲染结果和内联数据注入 dist/index.html
 *
 * 这是最简化的 SSG 方案，不依赖 vite-plugin-ssr 等复杂工具
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ReactDOMServer from 'react-dom/server';
import React from 'react';

// @ts-ignore - tsx 可以直接导入 TSX，但类型系统不知道
import { App } from '../src/App.tsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

// 读取预构建数据
const timeline = JSON.parse(fs.readFileSync(path.join(distDir, 'data/timeline.json'), 'utf-8'));
const stats = JSON.parse(fs.readFileSync(path.join(distDir, 'data/stats.json'), 'utf-8'));

// 服务端渲染 App
const prerendered = { timeline, stats };
const appHtml = ReactDOMServer.renderToString(
  React.createElement(App, { prerendered })
);

// 将预渲染数据序列化为安全的 JSON（转义 </script>）
const dataJson = JSON.stringify(prerendered)
  .replace(/<\/script>/g, '<\\/script>');

// SEO 标签和 JSON-LD
const seoTags = generateSeoTags(stats);

// 读取并修改 index.html
let indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');

// 1. 注入预渲染数据脚本
const dataScript = `<script type="application/json" id="__PRERENDERED_DATA__">${dataJson}</script>`;
indexHtml = indexHtml.replace('</head>', `${dataScript}\n    ${seoTags}\n  </head>`);

// 2. 注入渲染后的 HTML 到 #root 中
indexHtml = indexHtml.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

// 写回文件
fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf-8');

console.log('✅ 预渲染完成');
console.log(`   注入后 HTML 大小: ${(indexHtml.length / 1024).toFixed(1)} KB`);

function generateSeoTags(statsData: { levels: Record<string, number> }) {
  const SITE_URL = 'https://tonyc726.github.io/china-administrative-division';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '中国行政区划时光机',
    description: '1980–2026，652 个「县」从中国的行政区划名册上消失',
    url: SITE_URL,
    dataset: {
      '@type': 'Dataset',
      name: '中国行政区划历史数据',
      description: '1980 年至 2026 年中国五级行政区划变迁数据',
      variableMeasured: [
        { '@type': 'PropertyValue', name: '省级', value: statsData.levels['1'] ?? 0 },
        { '@type': 'PropertyValue', name: '地级', value: statsData.levels['2'] ?? 0 },
        { '@type': 'PropertyValue', name: '县级', value: statsData.levels['3'] ?? 0 },
        { '@type': 'PropertyValue', name: '乡级', value: statsData.levels['4'] ?? 0 },
        { '@type': 'PropertyValue', name: '村级', value: statsData.levels['5'] ?? 0 },
      ],
    },
  };

  return [
    `<meta property="og:image" content="${SITE_URL}/og-preview.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${SITE_URL}" />`,
    `<link rel="canonical" href="${SITE_URL}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\/script>/g, '<\\/script>')}</script>`,
  ].join('\n    ');
}
