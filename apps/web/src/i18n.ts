/**
 * 中英双轨文案。
 *
 * 两套叙事共存但调性不同：
 * - zh：情感钩子（家乡/村庄），投公众号、小红书
 * - en：技术侦探故事（官方源已死，我重建了管线），投 HN / Product Hunt / GitHub
 *
 * 不引 i18next —— 两种语言、几十条文案，一个字典足矣（Occam's Razor）。
 */
export type Lang = 'zh' | 'en';

interface Copy {
  brand: string;
  tagline: string;
  heroKicker: string;
  heroNumber: (n: number) => string;
  /** 紧跟巨型数字，与之连读成句 —— 不重复数字本身 */
  heroSuffix: string;
  heroLead: (lost: number, district: number, city: number) => string;
  heroNote: string;

  chartTitle: string;
  chartSub: (from: number, to: number) => string;
  legendCounty: string;
  legendDistrict: string;
  legendCity: string;
  /** 事实核对：「区」从未超过「县」，只是差距收窄——不可写成「交叉/反超」 */
  gapNote: (from: string, to: string) => string;
  caveatBadge: string;

  explorerTitle: string;
  explorerSub: (villages: string) => string;
  searchPlaceholder: string;
  searchHint: string;
  noResult: string;
  loading: string;
  pickTown: string;
  pickVillage: string;
  backToSearch: string;

  cardTitle: string;
  cardCode: string;
  cardChain: string;
  download: string;
  copyCode: string;
  copied: string;

  statsTitle: string;
  levelNames: string[];

  devTitle: string;
  devLead: string;
  devInstall: string;
  devDocs: string;
  devRepo: string;

  sourceNote: string;
  footer: string;
}

const zh: Copy = {
  brand: '中国行政区划时光机',
  tagline: '40 年，641 个县消失了',
  heroKicker: '1980 → 2020',
  heroNumber: (n) => `${n}`,
  heroSuffix: '个县，消失了',
  heroLead: (lost, district, city) =>
    `40 年间，${lost} 个「县」从中国的行政区划表上消失了。它们并没有不见——${district} 个变成了「区」，${city} 个变成了「市」。这是城市化在行政编码上留下的印记。`,
  heroNote: '数据来自国家统计局与民政部公开数据，逐年比对得出。',

  chartTitle: '县 · 区 · 市 的 42 年',
  chartSub: (from, to) => `${from}–${to} 年，全国县级行政单位构成变化`,
  legendCounty: '县',
  legendDistrict: '区（市辖区）',
  legendCity: '市（县级市）',
  gapNote: (from, to) =>
    `1980 年，「县」的数量是「区」的 ${from} 倍；到 2020 年，只剩 ${to} 倍。差距还在收窄。`,
  caveatBadge: '口径变化',

  explorerTitle: '找到你的村',
  explorerSub: (v) => `${v} 个村级单位，五级下钻，找到你家那一个。`,
  searchPlaceholder: '搜索省 / 市 / 县，例如：余姚',
  searchHint: '先定位到县，再逐级找到你的乡镇和村',
  noResult: '没有找到匹配的地名',
  loading: '加载中…',
  pickTown: '选择乡镇 / 街道',
  pickVillage: '选择村 / 社区',
  backToSearch: '← 重新搜索',

  cardTitle: '你的坐标',
  cardCode: '区划代码',
  cardChain: '完整链路',
  download: '下载分享卡片',
  copyCode: '复制区划代码',
  copied: '已复制',

  statsTitle: '2023 年全景',
  levelNames: ['', '省级', '地级', '县级', '乡镇级', '村级'],

  devTitle: '数据是开源的',
  devLead:
    '本站的每一个数字都来自 npm 上的开源数据包。五级行政区划、42 年历史、邮编区号，全部可直接安装使用。',
  devInstall: '安装数据包',
  devDocs: '阅读文档',
  devRepo: 'GitHub 仓库',

  sourceNote:
    '数据来源：国家统计局 2023 年快照、GB/T 2260 历史编码（1980–2020）、民政部国家地名信息库增量。',
  footer: '数据开放，欢迎自由使用与转载。',
};

const en: Copy = {
  brand: 'China Division Time Machine',
  tagline: '641 counties vanished in 40 years',
  heroKicker: '1980 → 2020',
  heroNumber: (n) => `${n}`,
  heroSuffix: 'counties vanished',
  heroLead: (lost, district, city) =>
    `Over 40 years, ${lost} "counties" disappeared from China's administrative registry. They were not erased — ${district} became urban "districts" and ${city} became county-level "cities". This is what urbanization looks like, written in administrative codes.`,
  heroNote: 'Derived by diffing official year-by-year records from 1980 to 2020.',

  chartTitle: 'Counties vs. Districts, 42 years',
  chartSub: (from, to) =>
    `Composition of China's county-level divisions, ${from}–${to}`,
  legendCounty: 'County (县)',
  legendDistrict: 'Urban district (区)',
  legendCity: 'County-level city (市)',
  gapNote: (from, to) =>
    `In 1980 there were ${from}× as many counties as urban districts. By 2020, only ${to}×. The gap keeps closing.`,
  caveatBadge: 'coding change',

  explorerTitle: 'Find your village',
  explorerSub: (v) =>
    `${v} village-level divisions. Drill down five levels to the one you are looking for.`,
  searchPlaceholder: 'Search a province / city / county',
  searchHint: 'Find the county first, then drill into townships and villages',
  noResult: 'No match found',
  loading: 'Loading…',
  pickTown: 'Pick a township',
  pickVillage: 'Pick a village',
  backToSearch: '← Search again',

  cardTitle: 'Your coordinates',
  cardCode: 'Division code',
  cardChain: 'Full lineage',
  download: 'Download share card',
  copyCode: 'Copy division code',
  copied: 'Copied',

  statsTitle: 'The 2023 snapshot',
  levelNames: ['', 'Provinces', 'Prefectures', 'Counties', 'Townships', 'Villages'],

  devTitle: 'The data is open source',
  devLead:
    "China's official statistics portal went dark — the pages that published this data now 404, frozen at 2023. So the whole pipeline was rebuilt: five levels, 42 years of history, shipped as npm packages you can install right now.",
  devInstall: 'Install the data',
  devDocs: 'Read the docs',
  devRepo: 'GitHub repo',

  sourceNote:
    'Sources: NBS 2023 snapshot, GB/T 2260 historical codes (1980–2020), and incremental patches from the Ministry of Civil Affairs.',
  footer: 'Open data. Free to use and redistribute.',
};

export const COPY: Record<Lang, Copy> = { zh, en };
