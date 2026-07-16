/**
 * 省级民政厅半年度乡级代码 · 监控注册表 + 解析器 PoC（2.4）。
 *
 * 依据：民政部令第79号第十六条第二款——省级民政部门每年 1 月和 7 月通过官网发布
 * 「截至上月末本地区乡级行政区划代码」。此渠道独立于 dmfw 年更，粒度到乡级（9 位码）、
 * 频次半年，可作乡镇级半年度**权威校验点**交叉印证 dmfw 年更。
 *
 * 现状（2026-07）：各省官网异构、无统一 API，且直连有反爬（四川 shtml 对非搜索引擎 UA 返 403/404）。
 * 故本模块提供：
 *   1. PROVINCE_TOWNSHIP_REGISTRY —— 省→栏目/最新期 URL + 数据形态，供半年节律轮询。
 *   2. parseTownshipHtmlTable —— 从已获取的 HTML 表格抽取「9 位码 + 名称」（format-tolerant）。
 *   3. townshipRowsToDivisions —— 9 位乡级码归一到 12 位 Division（尾补 000，parent=前6位+000000）。
 * 拿到字节后即可 `解析 → 归一 → diffToPatch(levels=[4]) → validatePatch` 产出增量。
 *
 * 边界（Occam）：不内置活体抓取（异构反爬，逐省适配另议）；解析器只认「9 位码 + 名称」两列，
 * 其余列忽略；不处理村级（level5 已永久冻结，见 docs/history/spike-village-level5）。
 */
import { load } from 'cheerio';
import { SOURCE_TYPE, type Division } from '@cndiv/core';

/** 数据形态：栏目页数据以何种载体呈现。 */
export type TownshipFormat = 'html-table' | 'xlsx' | 'unknown';

/** 履约状态：该省是否已按 79 号令半年发布乡级代码。 */
export type RegistryStatus = 'confirmed' | 'candidate' | 'none';

export interface ProvinceTownshipSource {
  /** 省级 2 位码 */
  provinceCode: string;
  name: string;
  /** 栏目列表页（半年轮询入口） */
  columnUrl: string;
  /** 已知最新一期详情页/附件 URL（截至日期见 note） */
  latestUrl?: string;
  format: TownshipFormat;
  status: RegistryStatus;
  note: string;
}

/**
 * 监控注册表（种子）。抽查自 2026-01 首个法定周期，URL 均为公开可检索页。
 * 轮询节律建议：每年 2 月/8 月（各留 1 月缓冲，四川 1 月版 1-28 才发）对 columnUrl 做内容差分。
 */
export const PROVINCE_TOWNSHIP_REGISTRY: readonly ProvinceTownshipSource[] = [
  {
    provinceCode: '51',
    name: '四川省',
    columnUrl: 'https://mzt.sc.gov.cn/scmzt/quhuaxinxi/',
    latestUrl:
      'https://mzt.sc.gov.cn/scmzt/quhuaxinxi/2026/1/28/fccc0ed4b8fe4655a3b946c6d8e9e1ed.shtml',
    format: 'html-table',
    status: 'confirmed',
    note: '《四川省行政区划代码信息表（截至2025-12-31）》2026-01-28 发布，乡级约 3101 个；栏目 URL 稳定，上年度同栏目亦在。直连有反爬（403/404），须搜索引擎/浏览器形态获取。',
  },
  {
    provinceCode: '37',
    name: '山东省',
    columnUrl: 'http://mzt.shandong.gov.cn/',
    format: 'unknown',
    status: 'candidate',
    note: '2026-01-02 媒体报道公布最新行政区划代码；官网栏目形态待补证。',
  },
  {
    provinceCode: '33',
    name: '浙江省',
    columnUrl: 'https://mzt.zj.gov.cn/col/col1632784/index.html',
    latestUrl:
      'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3600/site/attach/0/db3e458856b24294af40d94f5b5734b3.xlsx',
    format: 'xlsx',
    status: 'candidate',
    note: '省厅「行政区划」栏目（col1632784）+ 政务 OSS 存结构化 xlsx 附件；半年更/乡级粒度待确认。',
  },
  {
    provinceCode: '44',
    name: '广东省',
    columnUrl: 'http://smzt.gd.gov.cn/',
    format: 'unknown',
    status: 'none',
    note: '反例：依申请公开答复仍指向纸质《乡镇行政区划简册2024》（2023 底数据），未承诺官网定期发布（该答复或早于 2025-09 生效日）。',
  },
];

/** 从注册表按省码取源。 */
export function townshipSourceOf(
  provinceCode: string
): ProvinceTownshipSource | undefined {
  return PROVINCE_TOWNSHIP_REGISTRY.find(
    (s) => s.provinceCode === provinceCode
  );
}

/** 解析出的一行乡级记录（原始 9 位码 + 名称）。 */
export interface TownshipRow {
  code9: string;
  name: string;
}

const NINE_DIGIT = /^\d{9}$/;

/**
 * 从 HTML 表格抽取乡级「9 位码 + 名称」。format-tolerant：
 * 逐 <tr> 收集单元格文本，取首个匹配 /^\d{9}$/ 的单元格为码，同行首个非空非纯数字文本为名。
 * 忽略表头/合计行/非 9 位码行。省份表内混入省市县（更短有效位但同样补零到 12 位）时，
 * 只认 9 位显著位（即乡级）——上级层由 dmfw 年更覆盖，此校验点专注乡级。
 */
export function parseTownshipHtmlTable(html: string): TownshipRow[] {
  const $ = load(html);
  const rows: TownshipRow[] = [];
  const seen = new Set<string>();
  $('tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, td) => $(td).text().replace(/\s+/g, '').trim())
      .get();
    const code9 = cells.find((c) => NINE_DIGIT.test(c));
    if (!code9 || seen.has(code9)) return;
    const name = cells.find((c) => c && !/^\d+$/.test(c) && c !== code9);
    if (!name) return;
    seen.add(code9);
    rows.push({ code9, name });
  });
  return rows;
}

/**
 * 9 位乡级码归一到 12 位 Division。
 * 码：9 位显著位尾补 '000' → 12 位；parent：前 6 位（县级）+ '000000'；level 恒 4。
 * @throws code9 非 9 位数字。
 */
export function townshipRowToDivision(
  row: TownshipRow,
  year: number
): Division {
  if (!NINE_DIGIT.test(row.code9)) {
    throw new Error(`非法乡级码（须 9 位数字）：${row.code9}`);
  }
  return {
    code: `${row.code9}000`,
    name: row.name,
    level: 4,
    parent_code: `${row.code9.slice(0, 6)}000000`,
    year,
    source_type: SOURCE_TYPE.MCA_DECREE, // 省厅法定发布，权威度高于 dmfw 全量差分
    confidence_score: 95,
  };
}

/** 批量归一；跨省混入时按 provinceCode 前缀过滤（可选）。 */
export function townshipRowsToDivisions(
  rows: TownshipRow[],
  year: number,
  provinceCode?: string
): Division[] {
  const out: Division[] = [];
  for (const r of rows) {
    if (provinceCode && !r.code9.startsWith(provinceCode)) continue;
    out.push(townshipRowToDivision(r, year));
  }
  return out;
}
