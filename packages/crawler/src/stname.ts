/**
 * 国家地名信息库 stname/listPub 地名查询客户端（坐标采集）。
 *
 * 与 dmfw.ts 的 xzqh/getList（行政区划树，无坐标）互补：stname 返回地名记录带坐标、
 * 下探村级。本模块只负责抓取 + 稳定化 + 口径过滤，产出 StnameRow[]；join 进项目
 * 12 位码体系与分片输出由上层（build-coords.ts）负责（见规格 §6/§7）。
 *
 * 接口契约（2026-07-18 浏览器实测确认）：
 *   POST https://dmfw.mca.gov.cn/stname/listPub  （无 9095 前缀，与 xzqh/getList 同级）
 *   必备 header: User-Agent / X-Requested-With: XMLHttpRequest / Referer
 *   code 是 6 位码（非 12/9 位，填错返回 total=0）；size 上限 100
 *   存在非确定性抖动（同参数随机 total=0）。
 *
 * 稳定化思路复用 dmfw.ts unionChildren 的「多抓取、不注入基线」，但算法不同：
 * stname 抖动表现为 total=0，故策略是「重试直到非空」而非「取并集」。
 */
import got from 'got';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import {
  type StnameRow,
  type StnameResponse,
  KEEP_TYPES,
  StnameError,
} from './stname-types.js';

/** 接口端点（2026-07-18 实测：无 9095 前缀，与 xzqh/getList 同级） */
const STNAME_ENDPOINT = 'https://dmfw.mca.gov.cn/stname/listPub';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** 单页最大 size（实测上限 100） */
export const STNAME_PAGE_SIZE = 100;

/** 抖动重试上限：total=0 时的指数退避重试次数 */
export const STNAME_JITTER_RETRY = 3;

/** 按上级码枚举下级地名时的固定参数（照搬前端 search.html 实测值） */
const ENUM_PARAMS = {
  stName: '',
  year: 0,
  searchType: '模糊匹配',
} as const;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 固定并发数地 map 一组任务（与 crawl-all.ts 的 mapPool 一致，未来可提取共享） */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/**
 * 探针：请求一个县一页，返回原始 status + body（不解析、不缓存）。
 *
 * 用 throwHttpErrors:false 拿到 4xx/5xx 的响应体（403/404 都是首跑要诊断的关键信号）。
 * 仅网络层错误抛出（由调用方 catch）。用于首跑 --probe 验证接口契约。
 */
export async function probeStname(
  code: string,
  placeTypeCode = '21610'
): Promise<{ status: number; body: string }> {
  const res = await got(STNAME_ENDPOINT, {
    method: 'POST',
    form: { ...ENUM_PARAMS, code, placeTypeCode, page: 1, size: STNAME_PAGE_SIZE },
    headers: {
      'User-Agent': UA,
      Referer: 'https://dmfw.mca.gov.cn/search.html',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: { request: 20000 },
    retry: { limit: 0 },
    throwHttpErrors: false,
  });
  return { status: res.statusCode, body: res.body };
}

/**
 * 单页请求原语：POST stname/listPub 查某 code 下指定 placeTypeCode 的第 page 页。
 *
 * code 为 6 位行政区划码；page 从 1 起；size 固定 100。
 * 失败（网络/非 2xx）抛 StnameError；total=0 不抛（可能是抖动，由上层稳定化判定）。
 */
export async function fetchStnamePage(
  code: string,
  placeTypeCode: string,
  page: number,
  options?: { timeoutMs?: number }
): Promise<StnameResponse> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  try {
    const res = await got(STNAME_ENDPOINT, {
      method: 'POST',
      form: { ...ENUM_PARAMS, code, placeTypeCode, page, size: STNAME_PAGE_SIZE },
      headers: {
        'User-Agent': UA,
        Referer: 'https://dmfw.mca.gov.cn/search.html',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: { request: timeoutMs },
      retry: { limit: 2, methods: ['POST'] },
    }).json<StnameResponse>();
    return res;
  } catch (err) {
    throw new StnameError(
      code,
      placeTypeCode,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * 稳定化抓取：对抗 stname 的 total=0 抖动，自动翻页取全量。
 *
 * 首页重试直到非空（指数退避 delayMs/2·delayMs/4·delayMs），或耗尽 jitterRetry 仍空
 * -> 返回 []（可能是真无此类型地名，也可能是持续抖动；上层靠「该县其他 type 与基线」判定）。
 * 非空后按 total 翻页取全部分页。每次真实请求后等 delayMs（礼貌限速）。
 *
 * 不注入任何基线（与 dmfw.ts unionChildren 注释一致，防幽灵复活）。
 */
export async function fetchStnameStable(
  code: string,
  placeTypeCode: string,
  options?: {
    jitterRetry?: number;
    delayMs?: number;
    onJitter?: () => void;
  }
): Promise<StnameRow[]> {
  const maxRetry = options?.jitterRetry ?? STNAME_JITTER_RETRY;
  const delayMs = options?.delayMs ?? 800;

  // 首页：重试直到非空（或耗尽）
  let first: StnameResponse | null = null;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    const res = await fetchStnamePage(code, placeTypeCode, 1);
    if (delayMs > 0) await delay(delayMs);
    if (res.total > 0) {
      first = res;
      break;
    }
    // total=0：抖动候选，退避重试
    options?.onJitter?.();
    if (attempt < maxRetry) await delay(delayMs * 2 ** attempt);
  }
  if (!first || first.total === 0) return [];

  // 翻页取全量
  const all: StnameRow[] = [...first.records];
  const pages = Math.ceil(first.total / STNAME_PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    const res = await fetchStnamePage(code, placeTypeCode, page);
    if (delayMs > 0) await delay(delayMs);
    all.push(...res.records);
  }
  return all;
}

/**
 * 口径过滤：仅保留 KEEP_TYPES（21610/21620），排除 27xxx 双重登记。
 *
 * 即便上游某次只返回 27xxx，也不保留--宁可漏（留空）也不双计。
 * 漏项由上层 disclaimer 兜底。详见规格 §4。
 */
export function filterByKeptTypes(rows: StnameRow[]): StnameRow[] {
  return rows.filter((r) => KEEP_TYPES.has(r.place_type_code));
}

/**
 * 抓取单个县级码下的全部保留类型地名（行政村 + 社区），已口径过滤。
 *
 * 返回该县下所有 21610+21620 记录（带坐标）。坐标缺失（gdm=null）的记录保留，
 * 由上层决定是否剔除。本函数不带缓存，缓存由运行层（run-stname）在 (code,type)
 * 粒度管理。
 */
export async function fetchCountyCoords(
  countyCode6: string,
  options?: {
    jitterRetry?: number;
    delayMs?: number;
    onJitter?: () => void;
  }
): Promise<StnameRow[]> {
  const out: StnameRow[] = [];
  for (const type of KEEP_TYPES) {
    const rows = await fetchStnameStable(countyCode6, type, options);
    out.push(...rows);
  }
  return filterByKeptTypes(out);
}

/**
 * 轻量文件缓存：按 (code, placeTypeCode) 存原始 StnameRow[]，断点续爬。
 *
 * 与 cache.ts 的 FsCache 模式一致（${code}@${type}.json），但不复用其类--FsCache
 * 当前绑定 DmfwNode[] 类型，泛型化会触动 dmfw 管线。首跑用独立实现隔离风险；
 * 未来可把 FsCache 泛型化后统一。
 *
 * 毒缓存防线（吸取 crawl-all.ts 教训）：空结果**不落缓存**。stname 的 total=0 抖动
 * 一旦被缓存，断点续爬就把抖动永久固化为「该县无此类型」--且缓存里它和「真无」
 * 长得一模一样。故 set 只在 rows.length>0 时由调用方调用。
 */
export class StnameCache {
  constructor(private readonly dir: string) {}

  private file(code: string, type: string): string {
    return path.join(this.dir, `${code}@${type}.json`);
  }

  async get(code: string, type: string): Promise<StnameRow[] | null> {
    try {
      return JSON.parse(
        await readFile(this.file(code, type), 'utf-8')
      ) as StnameRow[];
    } catch {
      return null;
    }
  }

  async set(code: string, type: string, rows: StnameRow[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(code, type), JSON.stringify(rows));
  }
}
