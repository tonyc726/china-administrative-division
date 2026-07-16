import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Stats, Timeline } from './types';

/**
 * 构建时执行的预渲染数据加载器
 * 读取本地 JSON 文件，内联到 HTML 中
 *
 * 注意：此文件只在 Node.js 环境执行，不在浏览器执行
 */
export async function prerender(): Promise<{
  pageContext: {
    pageProps: {
      prerendered: {
        timeline: Timeline;
        stats: Stats;
      };
    };
  };
}> {
  const dataDir = path.resolve(process.cwd(), 'dist/data');

  // 读取核心数据（SEO 关键路径）
  const [timelineRaw, statsRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'timeline.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'stats.json'), 'utf-8'),
  ]);

  const timeline = JSON.parse(timelineRaw) as Timeline;
  const stats = JSON.parse(statsRaw) as Stats;

  return {
    pageContext: {
      pageProps: {
        prerendered: { timeline, stats },
      },
    },
  };
}
