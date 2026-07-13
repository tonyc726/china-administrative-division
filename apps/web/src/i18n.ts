/**
 * 中英双轨文案。
 *
 * 两套叙事共存但调性不同：
 * - zh：地方志/名册的书卷语气，投公众号、小红书（家乡与记忆）
 * - en：技术侦探故事（官方源已死，我重建了管线），投 HN / Product Hunt / GitHub
 *
 * 不引 i18next —— 两种语言、几十条文案，一个字典足矣（Occam's Razor）。
 */
import type { LineageEvent } from './types';

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

  /** 县级谱系 → 一句人文叙述；events 为空返回 null（不显示，不编造） */
  lineageStory: (events: LineageEvent[], sinceMin: number) => string | null;
  lineageLabel: string;

  cardTitle: string;
  cardCode: string;
  download: string;
  copyCode: string;
  copied: string;

  statsTitle: string;
  statsLead: string;
  levelNames: string[];

  devTitle: string;
  devLead: string;
  devRepo: string;

  sourceNote: string;
  footer: string;
}

const zh: Copy = {
  brand: '中国行政区划时光机',
  tagline: '四十年，641 个县从名册上消失',
  heroKicker: '1980 → 2020',
  heroNumber: (n) => `${n}`,
  heroSuffix: '个县，从名册上消失',
  heroLead: (lost, district, city) =>
    `四十年间，${lost} 个「县」从中国的行政区划名册上消失了。它们并没有真的不见——${district} 个改作了「区」，${city} 个改作了「市」。城市化的四十年，就这样一笔一笔，写进了名册。`,
  heroNote: '依据国家统计局与民政部公开名册，逐年比对得出。',

  chartTitle: '县、区、市的四十年',
  chartSub: (from, to) => `${from}–${to}，全国县级行政单位的构成`,
  legendCounty: '县',
  legendDistrict: '区（市辖区）',
  legendCity: '市（县级市）',
  gapNote: (from, to) =>
    `1980 年，「县」的数目是「区」的 ${from} 倍；到 2020 年，只剩 ${to} 倍。差距仍在收窄。`,
  caveatBadge: '口径变化',

  explorerTitle: '找到你的村庄',
  explorerSub: (v) => `${v} 个村落与社区，沿五级名册逐级翻找，找到属于你的那一行。`,
  searchPlaceholder: '搜索省、市或县，例如：余姚',
  searchHint: '先找到县，再逐级翻到你的乡镇与村庄',
  noResult: '名册里没有找到这个地名',
  loading: '翻找中…',
  pickTown: '选择乡镇 / 街道',
  pickVillage: '选择村 / 社区',
  backToSearch: '← 重新查找',

  lineageStory: (events, sinceMin) => {
    if (events.length === 0) return null;
    const first = events[0];
    if (!first) return null;
    if (events.length === 1)
      return `自 ${Math.max(first[0], sinceMin)} 年起，名册上一直记作「${first[1]}」，未曾更改。`;
    const parts = [`${first[0]} 年的名册里，它记作「${first[1]}」`];
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      if (e) parts.push(`${e[0]} 年起，改记为「${e[1]}」`);
    }
    return `${parts.join('；')}。`;
  },
  lineageLabel: '这个县的四十年',

  cardTitle: '地名档案',
  cardCode: '区划代码',
  download: '收下这张卡片',
  copyCode: '复制区划代码',
  copied: '已复制',

  statsTitle: '名册的全貌',
  statsLead: '2023 年，这本名册一共记着 665,271 行。',
  levelNames: ['', '省级', '地级', '县级', '乡镇级', '村级'],

  devTitle: '这本名册是开源的',
  devLead:
    '本站的每一个数字，都来自 npm 上公开的数据包：五级区划、四十年历史、邮编与区号，皆可直接安装取用。',
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
    `Over forty years, ${lost} counties disappeared from China's administrative registry. They were not erased — ${district} became urban districts, ${city} became county-level cities. Four decades of urbanization, written line by line into the registry.`,
  heroNote: 'Derived by diffing official year-by-year registries, 1980–2020.',

  chartTitle: 'Counties, districts, cities: forty years',
  chartSub: (from, to) =>
    `Composition of China's county-level divisions, ${from}–${to}`,
  legendCounty: 'County (县)',
  legendDistrict: 'Urban district (区)',
  legendCity: 'County-level city (市)',
  gapNote: (from, to) =>
    `In 1980 counties outnumbered districts ${from} to one. By 2020, ${to} to one — and the gap keeps closing.`,
  caveatBadge: 'coding change',

  explorerTitle: 'Find your village',
  explorerSub: (v) =>
    `${v} villages and communities. Leaf through five levels of the registry to the line that is yours.`,
  searchPlaceholder: 'Search a province, city or county',
  searchHint: 'Find the county first, then leaf down to your township and village',
  noResult: 'No such place in the registry',
  loading: 'Leafing through…',
  pickTown: 'Pick a township',
  pickVillage: 'Pick a village',
  backToSearch: '← Search again',

  lineageStory: (events, sinceMin) => {
    if (events.length === 0) return null;
    const first = events[0];
    if (!first) return null;
    if (events.length === 1)
      return `Recorded as “${first[1]}” since ${Math.max(first[0], sinceMin)}, unchanged.`;
    const parts = [`In the ${first[0]} registry it was “${first[1]}”`];
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      if (e) parts.push(`from ${e[0]}, “${e[1]}”`);
    }
    return `${parts.join('; ')}.`;
  },
  lineageLabel: 'This county, over forty years',

  cardTitle: 'Place Archive',
  cardCode: 'Division code',
  download: 'Keep this card',
  copyCode: 'Copy division code',
  copied: 'Copied',

  statsTitle: 'The registry in full',
  statsLead: 'In 2023, the registry held 665,271 lines.',
  levelNames: ['', 'Provinces', 'Prefectures', 'Counties', 'Townships', 'Villages'],

  devTitle: 'The registry is open source',
  devLead:
    "China's official statistics portal went dark — the pages that published this data now 404, frozen at 2023. So the pipeline was rebuilt: five levels, forty years of history, shipped as npm packages you can install today.",
  devRepo: 'GitHub repo',

  sourceNote:
    'Sources: NBS 2023 snapshot, GB/T 2260 historical codes (1980–2020), and incremental patches from the Ministry of Civil Affairs.',
  footer: 'Open data. Free to use and redistribute.',
};

export const COPY: Record<Lang, Copy> = { zh, en };
