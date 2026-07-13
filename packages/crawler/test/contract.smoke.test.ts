/**
 * 契约 smoke test（活体网络）——T3.2
 *
 * 政府接口无 SLA、路径/结构会漂移（已实锤 dmfw `/server/resource.html`→`/resource.html`）。
 * 本测试活体请求 dmfw getList 与 xzqh 索引，断言字段结构与关键契约，**漂移即红**。
 *
 * 三条护栏，避免污染常规 CI / 杜绝误报：
 * 1. 默认 skip：仅当 `NETWORK_SMOKE=1` 时运行（`pnpm test` 常规跑不触网）。
 * 2. 前置探针：短超时、零重试地判「主机连得上吗」，连不上（如 GitHub 海外 runner 访问不了
 *    中国政府网）→ 用例 skip。探针必须独立于业务客户端：`fetchChildren`/`listYearLinks`
 *    带 20s 超时 × 3 次重试，最坏 80s+，会先撞穿用例 timeout 被判红，让软跳过失效。
 * 3. 软跳过兜底：探针通过但请求仍抛网络错 → warn 后跳过。用例 timeout 取 TEST_TIMEOUT_MS
 *    （> 客户端最坏重试预算），保证 catch 有机会执行。
 *
 * 净效果：只有「连上了但结构变了」才判失败——契约漂移告警与站点可用性彻底解耦。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import got from 'got';
import { fetchChildren } from '../dist/dmfw.js';
import { listYearLinks } from '../dist/xzqh.js';

const RUN = process.env.NETWORK_SMOKE === '1';

/** 探针预算：连不上就快速失败，别把用例拖死 */
const PROBE_TIMEOUT_MS = 8_000;
/** 用例预算：须 > 客户端最坏重试预算（20s × (1 + retry 3) + 退避 ≈ 90s），否则 catch 跑不到 */
const TEST_TIMEOUT_MS = 120_000;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** 网络类错误（不可达/超时）视为跳过，而非契约漂移 */
const isNetworkErr = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNRESET|ENETUNREACH|socket hang up|network/i.test(
    m
  );
};

/**
 * 判活探针：只回答「这台主机连得上吗」，不回答「契约对不对」。
 * HTTP 4xx/5xx 算「连上了」→ 返回 true，判定权交还给下面的契约断言（该红就红）。
 */
async function reachable(label: string, url: string): Promise<boolean> {
  try {
    await got(url, {
      headers: { 'User-Agent': UA },
      timeout: { request: PROBE_TIMEOUT_MS },
      retry: { limit: 0 },
    });
    return true;
  } catch (e) {
    if (isNetworkErr(e)) {
      console.warn(
        `[smoke] ${label} 主机不可达，跳过契约断言：`,
        e instanceof Error ? e.message : e
      );
      return false;
    }
    return true;
  }
}

describe.skipIf(!RUN)('接口契约 smoke（活体网络，NETWORK_SMOKE=1）', () => {
  let dmfwUp = false;
  let xzqhUp = false;

  beforeAll(async () => {
    [dmfwUp, xzqhUp] = await Promise.all([
      reachable(
        'dmfw',
        'https://dmfw.mca.gov.cn/9095/xzqh/getList?code=640000000000&maxLevel=1'
      ),
      // 与 listYearLinks 打的是同一个索引页入口（dcpid=1）
      reachable('xzqh', 'http://xzqh.mca.gov.cn/description?dcpid=1'),
    ]);
  }, 3 * PROBE_TIMEOUT_MS);

  it(
    'dmfw getList：宁夏返回 code/name/level/type/children，maxLevel=2 深度到 L3',
    async (ctx) => {
      if (!dmfwUp) ctx.skip();

      let children;
      try {
        // 宁夏省根，maxLevel=2 → 市(L2) + 其下区县(L3)
        children = await fetchChildren('640000000000', 2);
      } catch (e) {
        if (isNetworkErr(e)) {
          console.warn(
            '[smoke] dmfw 网络不可达，跳过契约断言：',
            e instanceof Error ? e.message : e
          );
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
    },
    TEST_TIMEOUT_MS
  );

  it(
    'xzqh 索引：解析出 ≥1999–2026 年份链接，且 dcpid == year',
    async (ctx) => {
      if (!xzqhUp) ctx.skip();

      let links;
      try {
        links = await listYearLinks();
      } catch (e) {
        if (isNetworkErr(e)) {
          console.warn(
            '[smoke] xzqh 网络不可达，跳过契约断言：',
            e instanceof Error ? e.message : e
          );
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
    },
    TEST_TIMEOUT_MS
  );
});
