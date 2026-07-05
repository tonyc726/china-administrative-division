/**
 * 民政部「全国行政区划信息查询平台」——《县级以上行政区划变更情况》抓取器。
 *
 * 权威结构化变更事件源（1999–至今连续发布），用于驱动增量采集，
 * 避开从 dmfw 全量差分反推变更时的层级口径伪变更噪声。
 *
 * 站点事实（经 curl 探测确认，勿臆造）：
 *   - 索引页：http://xzqh.mca.gov.cn/description?dcpid=1，列出各年份 <a href="description?dcpid=YYYY">。
 *   - dcpid ↔ 年份映射规律：dcpid 就是 4 位年份（1999…当前年）；索引页自身 dcpid=1。
 *     2022 年无链接（县级调整冻结期，属正常「无发布」）。
 *   - 年份详情页正文容器：<div class="tz_con">，其内每条变更为一组 <p>：
 *       <p>一、<省>...设立/撤销/更名/调整...</p>   ← 标题（带「一、二、三…」序号）
 *       <p>具体变更描述文字。</p>                    ← 正文（可能多段）
 *       <p>（<批复/公告机关><YYYY>年<M>月<D>日公告）</p> ← 落款：机关 + 日期
 *   - 全站 GBK/GB18030 编码，必须字节流 + iconv 解码，直接取文本会中文乱码。
 */
import got from 'got';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

/** description 页基址（dcpid=1 为年份索引） */
const XZQH_DESCRIPTION = 'http://xzqh.mca.gov.cn/description';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
/** 有效年份下界：民政部该栏目最早发布年 */
const MIN_YEAR = 1999;

/** xzqh 抓取失败（含目标 URL），供上层做部分容错 */
export class XzqhError extends Error {
  constructor(
    public readonly url: string,
    message: string
  ) {
    super(`xzqh fetch failed for "${url}": ${message}`);
    this.name = 'XzqhError';
  }
}

/** 年份索引项：year 由 dcpid 解析而来（二者相等，非硬编码列表） */
export interface YearLink {
  year: number;
  dcpid: number;
  url: string;
}

/** 单条行政区划变更事件（政府页无契约，字段尽力而为解析） */
export interface ChangeEntry {
  /** 落款日期，归一化为 YYYY-MM-DD；缺失则 undefined */
  date?: string;
  /** 变更描述正文（标题 + 具体描述拼接），喂给 extractPatch 的输入 */
  text: string;
  /** 批复/公告机关，如「新疆维吾尔自治区人民政府」；缺失则 undefined */
  org?: string;
}

/** 拉取 URL 并按 GBK/GB18030 解码为 UTF-8 字符串（带超时/重试） */
async function fetchDecoded(url: string): Promise<string> {
  try {
    const buf = await got(url, {
      headers: { 'User-Agent': UA, Referer: 'http://xzqh.mca.gov.cn/' },
      timeout: { request: 20000 },
      retry: { limit: 3, methods: ['GET'] },
    }).buffer();
    return iconv.decode(buf, 'gb18030');
  } catch (err) {
    throw new XzqhError(url, err instanceof Error ? err.message : String(err));
  }
}

/** 构造某年（或 dcpid）详情页 URL */
function descriptionUrl(dcpid: number): string {
  return `${XZQH_DESCRIPTION}?dcpid=${dcpid}`;
}

/**
 * 解析年份索引页 HTML，抽出 1999–至今的年份链接。
 * 纯函数（不联网），便于离线 fixture 测试。
 */
export function parseYearLinks(html: string, baseUrl: string): YearLink[] {
  const $ = cheerio.load(html);
  const seen = new Set<number>();
  const links: YearLink[] = [];

  $('a[href*="dcpid="]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const m = href.match(/dcpid=(\d{4})/);
    if (!m) return; // 跳过索引页自身 dcpid=1 等非年份链接
    const dcpid = Number(m[1]);
    if (dcpid < MIN_YEAR || seen.has(dcpid)) return;
    seen.add(dcpid);
    links.push({ year: dcpid, dcpid, url: new URL(href, baseUrl).toString() });
  });

  return links.sort((a, b) => a.year - b.year);
}

/**
 * 抓取并解析年份索引，返回 { year, dcpid, url } 列表（升序）。
 * dcpid 即年份，映射在解析时从 href 动态提取，非硬编码。
 */
export async function listYearLinks(): Promise<YearLink[]> {
  const indexUrl = descriptionUrl(1);
  const html = await fetchDecoded(indexUrl);
  return parseYearLinks(html, indexUrl);
}

const HEADING_RE = /^[一二三四五六七八九十百]+、/;
/** 落款：（<机关><年>年<月>月<日>日公告/批复） */
const ANNOUNCE_RE = /（(.*?)(\d{4})年(\d{1,2})月(\d{1,2})日(?:公告|批复)?）/;

const pad = (s: string): string => s.padStart(2, '0');

/**
 * 从详情页 HTML 解析变更条目。纯函数，便于离线 fixture 测试。
 *
 * 容错（FMEA）：
 *   - 无 .tz_con 或其内无 <p>（如 2022 冻结期）→ 返回 []（「该年无发布」，不抛错）。
 *   - 落款行仅贡献 org/date，不计入描述文本；无落款则该条 date/org 为 undefined。
 *   - 无序号标题时，全部段落归并为单条，避免漏抓。
 */
export function parseChanges(html: string): ChangeEntry[] {
  const $ = cheerio.load(html);
  const container = $('.tz_con');
  if (container.length === 0) return [];

  const paras = container
    .find('p')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length > 0);
  if (paras.length === 0) return [];

  interface Draft {
    texts: string[];
    org?: string;
    date?: string;
  }
  const entries: ChangeEntry[] = [];
  let cur: Draft | null = null;

  const flush = (): void => {
    if (cur && cur.texts.length > 0) {
      entries.push({ text: cur.texts.join(' '), org: cur.org, date: cur.date });
    }
    cur = null;
  };

  for (const p of paras) {
    const am = p.match(ANNOUNCE_RE);
    if (am) {
      // 落款行：补全当前条目的机关与日期
      if (cur) {
        const org = am[1].replace(/^[\s，,、]+/, '').trim();
        cur.org = org.length > 0 ? org : undefined;
        cur.date = `${am[2]}-${pad(am[3])}-${pad(am[4])}`;
      }
      continue;
    }
    if (HEADING_RE.test(p)) {
      flush();
      cur = { texts: [p.replace(HEADING_RE, '')] };
    } else {
      if (!cur) cur = { texts: [] };
      cur.texts.push(p);
    }
  }
  flush();

  return entries;
}

/**
 * 抓取某年（或 dcpid，二者相等）的变更事件列表。
 * 空结果（该年无发布，如 2022）返回 []，不抛错。
 */
export async function fetchChanges(
  yearOrDcpid: number
): Promise<ChangeEntry[]> {
  const html = await fetchDecoded(descriptionUrl(yearOrDcpid));
  return parseChanges(html);
}
