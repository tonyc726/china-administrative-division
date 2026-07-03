/**
 * 契约 smoke test（活体网络）——T3.2
 *
 * 政府接口无 SLA、路径/结构会漂移（已实锤 dmfw `/server/resource.html`→`/resource.html`）。
 * 本测试活体请求 dmfw getList 与 xzqh 索引，断言字段结构与关键契约，**漂移即红**。
 *
 * 两条护栏，避免污染常规 CI：
 * 1. 默认 skip：仅当 `NETWORK_SMOKE=1` 时运行（`pnpm test` 常规跑不触网）。
 * 2. 网络不可达（超时/连接失败，如 GitHub 海外 runner 访问不了中国政府网）→ warn 后软跳过，
 *    只有「连上了但结构变了」才判失败——把「契约漂移告警」和「可用性」分开，杜绝误报。
 */
import { describe, it, expect } from 'vitest';
import { fetchChildren } from '../dist/dmfw.js';
import { listYearLinks } from '../dist/xzqh.js';

const RUN = process.env.NETWORK_SMOKE === '1';

/** 网络类错误（不可达/超时）视为跳过，而非契约漂移 */
const isNetworkErr = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|getaddrinfo|ECONNRESET|socket hang up|network/i.test(m);
};

describe.skipIf(!RUN)('接口契约 smoke（活体网络，NETWORK_SMOKE=1）', () => {
  it('dmfw getList：宁夏返回 code/name/level/type/children，maxLevel=2 深度到 L3', async () => {
    let children;
    try {
      // 宁夏省根，maxLevel=2 → 市(L2) + 其下区县(L3)
      children = await fetchChildren('640000000000', 2);
    } catch (e) {
      if (isNetworkErr(e)) {
        console.warn('[smoke] dmfw 网络不可达，跳过契约断言：', e instanceof Error ? e.message : e);
        return;
      }
      throw e;
    }

    expect(children.length).toBeGreaterThan(0);
    const city = children[0];
    // 字段契约
    expect(typeof city.code).toBe('string');
    expect(city.code).toHaveLength(12);
    expect(typeof city.name).toBe('string');
    expect(typeof city.type).toBe('string');
    expect(city.level).toBe(2); // 市
    // maxLevel=2 深度契约：市带孙节点（区县 L3）
    expect(Array.isArray(city.children)).toBe(true);
    expect(city.children.length).toBeGreaterThan(0);
    expect(city.children[0].level).toBe(3);
  }, 30000);

  it('xzqh 索引：解析出 ≥1999–2026 年份链接，且 dcpid == year', async () => {
    let links;
    try {
      links = await listYearLinks();
    } catch (e) {
      if (isNetworkErr(e)) {
        console.warn('[smoke] xzqh 网络不可达，跳过契约断言：', e instanceof Error ? e.message : e);
        return;
      }
      throw e;
    }

    expect(links.length).toBeGreaterThan(20);
    const years = links.map((l) => l.year);
    expect(Math.min(...years)).toBeLessThanOrEqual(1999);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2026);
    // dcpid == year 契约（解析规律的基石）
    for (const l of links) {
      expect(l.dcpid).toBe(l.year);
      expect(l.url).toContain(`dcpid=${l.year}`);
    }
  }, 30000);
});
