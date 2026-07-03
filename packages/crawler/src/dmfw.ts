/**
 * 国家地名信息库（民政部）客户端
 *
 * 后统计局时代唯一的官方"活"数据源。接口：
 *   GET https://dmfw.mca.gov.cn/9095/xzqh/getList?code=<12位或空>&maxLevel=1
 *   → { data: { code, name, level, type, children: [...] } }
 * 码已是 12 位定长；level: 1省 2市 3县 4乡镇街道（直辖市跳 level2，无村级 level5）。
 */
import got from 'got';

const DMFW_GETLIST = 'https://dmfw.mca.gov.cn/9095/xzqh/getList';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export interface DmfwNode {
  code: string;
  name: string | null;
  level: number;
  type: string;
  children: DmfwNode[];
}

interface DmfwResponse {
  data: DmfwNode | null;
}

/** dmfw 抓取失败（含具体 code），供上层做部分容错 */
export class DmfwError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(`dmfw getList failed for code="${code}": ${message}`);
    this.name = 'DmfwError';
  }
}

/** getList 单次请求支持的 maxLevel 上限（实测 3 会被截断回 2） */
export const DMFW_MAX_LEVEL = 2;

/**
 * 拉取某节点的子树（默认 maxLevel=1 只取直接子节点，向后兼容）。
 *
 * - maxLevel=1：返回的 DmfwNode[] 中每项 children 为空数组。
 * - maxLevel=2：返回的每个直接子节点携带其嵌套 children（孙节点），
 *   即一次请求覆盖两层，供 crawlAll 步长=2 的 BFS 展平。
 *
 * 带超时与重试；失败抛 DmfwError。code 为空字符串时返回省级。
 */
export async function fetchChildren(
  code: string,
  maxLevel = 1
): Promise<DmfwNode[]> {
  try {
    const res = await got(DMFW_GETLIST, {
      searchParams: { code, maxLevel },
      headers: { 'User-Agent': UA, Referer: 'https://dmfw.mca.gov.cn/' },
      timeout: { request: 20000 },
      retry: { limit: 3, methods: ['GET'] },
    }).json<DmfwResponse>();
    return res.data?.children ?? [];
  } catch (err) {
    throw new DmfwError(code, err instanceof Error ? err.message : String(err));
  }
}

// 注：全量抓取请用 crawl-all.ts 的 crawlAll（逐层 BFS + 并发池 + 断点续爬）。
// 早期串行 crawl() 已废弃删除，fetchChildren 是两者共享的唯一抓取原语。
