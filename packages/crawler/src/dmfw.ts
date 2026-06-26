/**
 * 国家地名信息库（民政部）客户端
 *
 * 后统计局时代唯一的官方"活"数据源。接口：
 *   GET https://dmfw.mca.gov.cn/9095/xzqh/getList?code=<12位或空>&maxLevel=1
 *   → { data: { code, name, level, type, children: [...] } }
 * 码已是 12 位定长；level: 1省 2市 3县 4乡镇街道（直辖市跳 level2，无村级 level5）。
 */
import got from 'got';
import { SOURCE_TYPE, type Division, type DivisionLevel } from '@cndiv/core';

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

/**
 * 拉取某节点的直接子节点（maxLevel=1）。带超时与重试；失败抛 DmfwError。
 * code 为空字符串时返回省级。
 */
export async function fetchChildren(code: string): Promise<DmfwNode[]> {
  try {
    const res = await got(DMFW_GETLIST, {
      searchParams: { code, maxLevel: 1 },
      headers: { 'User-Agent': UA, Referer: 'https://dmfw.mca.gov.cn/' },
      timeout: { request: 20000 },
      retry: { limit: 3, methods: ['GET'] },
    }).json<DmfwResponse>();
    return res.data?.children ?? [];
  } catch (err) {
    throw new DmfwError(code, err instanceof Error ? err.message : String(err));
  }
}

export interface CrawlOptions {
  /** 数据年份（写入 Division.year） */
  year: number;
  /** 最深抓到的层级（1省…4乡镇街道），默认 4 */
  maxLevel?: number;
  /** 每次请求间隔毫秒（限速，避免触发反爬），默认 80 */
  delayMs?: number;
  /** 进度回调 */
  onProgress?: (count: number, lastCode: string) => void;
}

export interface CrawlResult {
  divisions: Division[];
  /** 抓取失败的节点 code（部分容错，不阻塞整体） */
  failures: string[];
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 从 rootCode（空字符串=全国）递归抓取行政区划树，展开为扁平 Division[]。
 * 单节点抓取失败仅记入 failures、不中断整体（FMEA：部分可用优于全盘失败）。
 */
export async function crawl(rootCode: string, options: CrawlOptions): Promise<CrawlResult> {
  const { year, maxLevel = 4, delayMs = 80 } = options;
  const divisions: Division[] = [];
  const failures: string[] = [];

  const walk = async (code: string, parentCode: string | null): Promise<void> => {
    let children: DmfwNode[];
    try {
      children = await fetchChildren(code);
    } catch {
      failures.push(code);
      return;
    }

    for (const node of children) {
      divisions.push({
        code: node.code,
        name: node.name ?? '',
        level: node.level as DivisionLevel,
        parent_code: parentCode,
        year,
        source_type: SOURCE_TYPE.MCA_DECREE,
        confidence_score: 90,
      });
      options.onProgress?.(divisions.length, node.code);

      if (node.level < maxLevel) {
        await delay(delayMs);
        await walk(node.code, node.code);
      }
    }
  };

  await walk(rootCode, rootCode === '' ? null : rootCode);
  return { divisions, failures };
}
