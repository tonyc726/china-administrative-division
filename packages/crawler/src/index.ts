/**
 * @cndiv/crawler
 *
 * 后统计局时代的增量采集引擎：从国家地名信息库（dmfw）抓取最新行政区划，
 * 与基线快照差分，产出社区 Patch（apply_after: 2023-baseline）。
 *
 * 用法示例：
 *   import { crawl, diffToPatch } from '@cndiv/crawler';
 *   const { divisions } = await crawl('', { year: 2026, maxLevel: 4 });
 *   const patch = diffToPatch(baseline2023, divisions, { author: 'bot', source_url: 'https://dmfw.mca.gov.cn/' });
 */
export * from './dmfw.js';
export * from './diff.js';
export * from './crawl-all.js';
export * from './cache.js';
export * from './baseline.js';
