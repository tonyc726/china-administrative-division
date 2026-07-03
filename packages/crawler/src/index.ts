/**
 * @cndiv/crawler
 *
 * 后统计局时代的增量采集引擎：从国家地名信息库（dmfw）抓取最新行政区划，
 * 与基线快照差分，产出社区 Patch（apply_after: 2023-baseline）。
 *
 * 用法示例：
 *   import { crawlAll, diffToPatch } from '@cndiv/crawler';
 *   const { divisions } = await crawlAll('', { year: 2026, maxLevel: 4 });
 *   const { patch } = diffToPatch(baseline2023, divisions, { author: 'bot', source_url: 'https://dmfw.mca.gov.cn/' });
 */
export * from './dmfw.js';
export * from './diff.js';
export * from './crawl-all.js';
export * from './cache.js';
export * from './baseline.js';
// xzqh 县级以上变更事件流（权威增量触发源，喂 @cndiv/extractor）
export * from './xzqh.js';
// ip138 邮编/区号采集（产出 @cndiv/source-postal）
export * from './ip138.js';
export * from './postal.js';
