/**
 * ip138 邮编/区号抓取客户端（现网 UTF-8 版）。
 *
 * 入口 https://www.ip138.com/post/ 列出省级链接 `/<id>/`（id 为 ip138 内部 2 位编号，
 * 非 GB2260），锚文本为省名；省页含邮编/区号表，交由 parseProvincePostal 解析。
 *
 * 数据特性：邮编/区号近静态，无需断点续爬/高并发；顺序限速抓取一轮即可产出 source-postal 包。
 */
import got from 'got';
import { load } from 'cheerio';
import { parseProvincePostal } from './postal.js';
import type { PostalRecord } from '@cndiv/data-protocol';

const IP138_BASE = 'https://www.ip138.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export interface ProvinceLink {
  /** ip138 内部省编号（如 "10"=北京） */
  id: string;
  /** 省名（如 "北京市"） */
  name: string;
}

const fetchText = (url: string): Promise<string> =>
  got(url, {
    headers: { 'User-Agent': UA, Referer: `${IP138_BASE}/post/` },
    timeout: { request: 20000 },
    retry: { limit: 2, methods: ['GET'] },
  }).text();

/** 抓 /post/ 取大陆省级链接（仅 `/<2位数字>/` 形式 + 省/市/自治区 锚文本） */
async function fetchProvinceLinks(): Promise<ProvinceLink[]> {
  const $ = load(await fetchText(`${IP138_BASE}/post/`));
  const links: ProvinceLink[] = [];
  const seen = new Set<string>();
  $('a').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/^\/(\d{2})\/$/);
    const name = $(a).text().trim();
    if (!m || !name || seen.has(m[1])) return;
    if (name.endsWith('省') || name.endsWith('市') || name.endsWith('自治区')) {
      seen.add(m[1]);
      links.push({ id: m[1], name });
    }
  });
  return links;
}

/** 抓某省页并解析为 PostalRecord[] */
async function fetchProvincePostal(link: ProvinceLink): Promise<PostalRecord[]> {
  const html = await fetchText(`${IP138_BASE}/${link.id}/`);
  return parseProvincePostal(html, link.name);
}

export interface FetchAllOptions {
  /** 每省抓取后等待毫秒（限速），默认 150 */
  delayMs?: number;
  /** 每省完成回调 */
  onProvince?: (name: string, count: number) => void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 顺序限速抓取全部大陆省份的邮编/区号 */
export async function fetchAllPostal(options: FetchAllOptions = {}): Promise<PostalRecord[]> {
  const { delayMs = 150, onProvince } = options;
  const links = await fetchProvinceLinks();
  const all: PostalRecord[] = [];
  for (const link of links) {
    const records = await fetchProvincePostal(link);
    all.push(...records);
    onProvince?.(link.name, records.length);
    if (delayMs > 0) await delay(delayMs);
  }
  return all;
}
