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
  /** 页眉副题：一行说清这本名册的时间跨度与体量 */
  brandSub: string;
  tagline: string;
  heroKicker: string;
  /** 紧跟巨型数字，与之连读成句 —— 不重复数字本身 */
  heroSuffix: string;
  heroLead: (lost: number, district: number, city: number) => string;
  heroNote: string;
  /** 时光机：一本逐年翻页的名册 —— 谁被划掉，谁被写上 */
  heroReplay: string;
  heroPause: string;
  heroResume: string;
  heroDialCounty: string;
  heroDialDistrict: string;
  heroDialCity: string;
  /** canvas 的替代文本 —— 屏幕读不出一张地图，得有人替它说 */
  heroField: string;
  /** 落点只到省，不到县 —— 这一点必须写在图上，不能让人以为那是县的真实坐标 */
  heroGeoNote: string;
  heroScrub: string;
  scrubVol: (n: number) => string;
  scrubHint: string;
  scrubCaveat: string;
  heroSkip: (year: number) => string;

  chartTitle: string;
  chartSub: (from: number, to: number) => string;
  legendCounty: string;
  legendDistrict: string;
  legendCity: string;
  /** hover 读数卡：年份标题 / 三条曲线的短名 / 合计行 */
  tipYear: (year: number) => string;
  tipLabels: [string, string, string];
  tipTotal: string;
  /** 事实核对：「区」从未超过「县」，只是差距收窄——不可写成「交叉/反超」 */
  gapNote: (from: string, to: string) => string;
  caveatBadge: string;
  /** 推演区底纹上的短标签 */
  derivedBand: string;
  /**
   * 图下的来源分层说明。快照 vs 推演的置信度不同，不能混作一谈；
   * 但推演经过独立实测交叉校验，这一点也必须说出来——否则读者会低估它。
   */
  provenanceNote: (snapshotMax: number, yearMax: number) => string;
  /** 已公告设立、官方码尚未发布的政区（不编码、不丢弃、明写出来） */
  pendingNote: (name: string, date: string) => string;

  explorerTitle: string;
  explorerSub: (villages: string) => string;
  searchPlaceholder: string;
  searchHint: string;
  noResult: string;
  loading: string;
  pickTown: string;
  pickVillage: string;
  backToSearch: string;

  /** 五级搜索：结果分组 + 深层（乡镇/村）加载态 */
  groupTop: string;
  groupTown: string;
  groupVillage: string;
  searchingDeep: string;
  deepHint: string;
  jumping: string;
  /** 截断如实告知：命中 778 条只显示 40 条，必须说出来 */
  resultTruncated: (total: number, shown: number) => string;
  /** 多级限定（「辽宁 和平」）里认不出的那个词——不能静默降级成全国搜索 */
  scopeUnresolved: (tokens: string) => string;

  /** 县级谱系 → 一句人文叙述；events 为空返回 null（不显示，不编造） */
  lineageStory: (events: LineageEvent[], sinceMin: number) => string | null;
  lineageLabel: string;

  /** 最常见的村名（排序条形 + 点击联动搜索） */
  namesTitle: string;
  namesSub: (era: number) => string;
  namesLead: (topName: string, topCount: number, eraInTop: number) => string;
  eraBadge: string;
  eraDisclaimer: string;
  axisVillages: string;
  clickToSearch: string;

  /** 姓氏的村庄（棒棒糖图 + 查你自己的姓） */
  surnameTitle: string;
  surnameSub: (total: string) => string;
  surnameYours: string;
  surnameYoursPlaceholder: string;
  surnameFound: (sur: string, count: number, rank: number) => string;
  surnameMissing: (sur: string) => string;

  /** 南塘北屯（通名 × 省份热力图） */
  marksTitle: string;
  marksSub: string;
  marksNorth: string;
  marksSouth: string;
  marksLead: string;
  /** 归一化开关：统计学的核心——原始村数会被省份体量混淆 */
  marksModeRate: string;
  marksModeRaw: string;
  marksModeNote: string;
  marksCell: (prov: string, mark: string, count: number, rate: string) => string;
  marksAxisProv: string;
  marksColorNote: string;

  /** 稀有度 */
  rarityUnique: string;
  rarityShared: (n: number) => string;
  rarityLabel: string;

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
  brandSub: '1980–2026 · 五级名册',
  tagline: '四十年，652 个县从名册上消失',
  heroKicker: '1980 → 2026',
  heroSuffix: '个县，从名册上消失',
  heroLead: (lost, district, city) =>
    `四十年间，${lost} 个「县」从中国的行政区划名册上消失了。它们并没有真的不见——${district} 个改作了「区」，${city} 个改作了「市」。城市化的四十年，就这样一笔一笔，写进了名册。`,
  heroNote: '依据国家统计局与民政部公开名册，逐年比对得出。',
  heroReplay: '再走一遍',
  heroPause: '停一下',
  heroResume: '继续',
  heroDialCounty: '县',
  heroDialDistrict: '区',
  heroDialCity: '市',
  heroField: '中国地图：被取消的县名在它所属的省份上烧成灰飘散，新的名字从同一块土地上长出来',
  heroGeoNote: '名字落在它所属的省内 · 精确到省，不到县',
  heroScrub: '拖动，回到任何一年',
  scrubVol: (n) => (n === 0 ? '这一年，名册没有改动' : `这一年，${n} 个县从名册上消失`),
  scrubHint: '柱高 = 这一年消失的县数 · 拖动或按方向键',
  scrubCaveat: '口径变化，非行政变更',
  heroSkip: (year) => `跳到 ${year} →`,

  chartTitle: '县、区、市的四十年',
  chartSub: (from, to) => `${from}–${to}，全国县级行政单位的构成`,
  legendCounty: '县',
  legendDistrict: '区（市辖区）',
  legendCity: '市（县级市）',
  tipYear: (year) => `${year} 年`,
  tipLabels: ['县', '区', '市'],
  tipTotal: '县级合计',
  gapNote: (from, to) =>
    `1980 年，「县」的数目是「区」的 ${from} 倍；到 2026 年，只剩 ${to} 倍。差距仍在收窄。`,
  caveatBadge: '口径变化',
  derivedBand: '法令推演区',
  provenanceNote: (snapshotMax, yearMax) =>
    `1980–${snapshotMax} 为 GB/T 2260 逐年全量快照（直接测量）；${snapshotMax + 1}–${yearMax} 期间国家统计局停止发布年度区划，故由民政部《县级以上行政区划变更情况》的官方法令在 ${snapshotMax} 年名册上逐年推演（图中斜纹区）。该推演经独立交叉校验：推出的 ${yearMax} 年县级名册与国家地名信息库实测结果逐码逐名完全一致，差异为零。`,
  pendingNote: (name, date) =>
    `另：${name}（${date} 公告设立）官方区划码尚未发布，故未计入名册——我们不编造区划码。`,

  explorerTitle: '寻找你的家乡',
  explorerSub: (v) =>
    `省、市、县、乡镇、村与社区 —— 五级名册全部可搜（含 ${v} 个村落与社区）。中文或拼音都行。`,
  searchPlaceholder: '搜省市县、乡镇、村 —— 如「辽宁 和平」「新安村」xinancun',
  searchHint: '可以加省市限定重名，如「辽宁 和平」；支持全拼与首字母',
  noResult: '名册里没有找到这个地名',
  loading: '翻找中…',
  pickTown: '选择乡镇 / 街道',
  pickVillage: '选择村 / 社区',
  backToSearch: '← 重新查找',

  groupTop: '省 · 市 · 县',
  groupTown: '乡镇 / 街道',
  groupVillage: '村 · 社区',
  searchingDeep: '正在翻找 66 万条乡镇与村…',
  deepHint: '再输一个字，就能搜到乡镇与村',
  jumping: '正在翻到那一页…',
  resultTruncated: (total, shown) =>
    `全国共 ${total.toLocaleString()} 条命中，这里只列出前 ${shown} 条。`,
  scopeUnresolved: (tokens) => `名册里没有「${tokens}」这个地方，已按全国搜索。`,

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

  namesTitle: '最常见的村名',
  namesSub: (era) =>
    `全国 ${era.toLocaleString()} 个村庄，名字来自同一个年代的词汇表。`,
  namesLead: (topName, topCount, eraInTop) =>
    `中国最常见的村名不是「张家村」，是「${topName}」——全国有 ${topCount} 个。最常见的 20 个村名里，${eraInTop} 个诞生于集体化年代：和平、团结、幸福、胜利、红旗、向阳、东风……那一代人的理想，被写进门牌，挂到了今天。`,
  eraBadge: '时代词',
  eraDisclaimer:
    '「时代词」是本站依据 1950–70 年代政治话语作出的归类，非官方定义；「太平」「兴隆」「花园」等传统地名一律未计入。',
  axisVillages: '村庄数',
  clickToSearch: '点任意一行，搜出全国所有同名的村',

  surnameTitle: '姓氏的村庄',
  surnameSub: (total) => `${total} 个村子以「某家」命名。你家的姓，有多少个村？`,
  surnameYours: '你的姓',
  surnameYoursPlaceholder: '姓',
  surnameFound: (sur, count, rank) =>
    `全国有 ${count.toLocaleString()} 个村子叫「${sur}家…」，在所有姓氏里排第 ${rank}。`,
  surnameMissing: (sur) => `名册里没有以「${sur}」命名的村。`,

  marksTitle: '南塘北屯',
  marksSub: '村名里的一个字，藏着它在南方还是北方',
  marksNorth: '北方通名',
  marksSouth: '南方通名',
  marksLead:
    '按密度看：「庄」在天津与河北，「屯」在辽宁，「堡」在辽宁与宁夏，「沟」在甘肃与陕西的黄土高原；「塘」「圩」「畈」「冲」几乎只见于湖南、湖北、安徽、江西。没有人规定过这条线，它是几百年农耕与聚落方式，自己长出来的。',
  marksModeRate: '每万村',
  marksModeRaw: '原始村数',
  marksModeNote:
    '按「每万村」归一化：直接比原始村数，读到的只是「哪个省村多」（河北 5 万村，海南 2 千村）。切到「原始村数」看「沟」这一行——前三名会变成河北、河南、山东（清一色的村庄大省）；而按密度，「沟」真正的家在甘肃与陕西，黄土高原。省份体量是混淆变量，摘掉它，字才回到它自己的地理里。',
  marksCell: (prov, mark, count, rate) =>
    `${prov} · 「${mark}」：${count.toLocaleString()} 个村，每万村 ${rate} 个`,
  marksAxisProv: '省份按「北方通名密度 − 南方通名密度」排序 —— 这条从北到南的谱是数据自己排出来的，不是我们指定的',
  marksColorNote:
    '颜色深浅 = 该字在该省的密度，按每一行自己的最大值归一 —— 回答的是「这个字集中在哪」，不是「哪个字更多」。跨行的量级请看行首的总数。',

  rarityUnique: '全国独一无二',
  rarityShared: (n) => `全国还有 ${n - 1} 个同名村`,
  rarityLabel: '重名',

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
    '数据来源：GB/T 2260 历史编码（1980–2020 逐年全量快照）、民政部《县级以上行政区划变更情况》官方法令（2021–2026 推演）、国家统计局 2023 年五级快照（乡村下钻）、国家地名信息库（交叉校验）。',
  footer: '数据开放，欢迎自由使用与转载。',
};

const en: Copy = {
  brand: 'China Division Time Machine',
  brandSub: '1980–2026 · five-level registry',
  tagline: '652 counties vanished in 40 years',
  heroKicker: '1980 → 2026',
  heroSuffix: 'counties vanished',
  heroLead: (lost, district, city) =>
    `Over forty years, ${lost} counties disappeared from China's administrative registry. They were not erased — ${district} became urban districts, ${city} became county-level cities. Four decades of urbanization, written line by line into the registry.`,
  heroNote: 'Derived by diffing official year-by-year registries, 1980–2026.',
  heroReplay: 'Run it again',
  heroPause: 'Hold',
  heroResume: 'Resume',
  heroDialCounty: 'Counties',
  heroDialDistrict: 'Districts',
  heroDialCity: 'Cities',
  heroField:
    'Map of China: abolished county names burn to ash over their own province; new names grow from the same ground',
  heroGeoNote: 'Placed within its province · province-accurate, not county-accurate',
  heroScrub: 'Drag to any year',
  scrubVol: (n) =>
    n === 0 ? 'Nothing changed this year' : `${n} ${n === 1 ? 'county' : 'counties'} vanished this year`,
  scrubHint: 'Bar height = counties lost that year · drag or use arrow keys',
  scrubCaveat: 'coding change, not a real reorganisation',
  heroSkip: (year) => `Skip to ${year} →`,

  chartTitle: 'Counties, districts, cities: forty years',
  chartSub: (from, to) =>
    `Composition of China's county-level divisions, ${from}–${to}`,
  legendCounty: 'County (县)',
  legendDistrict: 'Urban district (区)',
  legendCity: 'County-level city (市)',
  tipYear: (year) => `${year}`,
  tipLabels: ['County', 'District', 'City'],
  tipTotal: 'Total',
  gapNote: (from, to) =>
    `In 1980 counties outnumbered districts ${from} to one. By 2026, ${to} to one — and the gap keeps closing.`,
  caveatBadge: 'coding change',
  derivedBand: 'derived from decrees',
  provenanceNote: (snapshotMax, yearMax) =>
    `1980–${snapshotMax} are annual full snapshots from GB/T 2260 (direct measurement). From ${snapshotMax + 1} the National Bureau of Statistics stopped publishing its annual division dataset, so ${snapshotMax + 1}–${yearMax} are derived year by year from the Ministry of Civil Affairs' official change decrees, applied to the ${snapshotMax} roster (hatched area). The derivation was independently cross-checked: the resulting ${yearMax} county roster matches the National Place-Name Database exactly — same codes, same names, zero discrepancies.`,
  pendingNote: (name, date) =>
    `Note: ${name} (established ${date}) has no official division code published yet, so it is not counted — we do not invent codes.`,

  explorerTitle: 'Find your hometown',
  explorerSub: (v) =>
    `Provinces, prefectures, counties, townships, villages — all five levels are searchable (${v} villages and communities included). Chinese or pinyin.`,
  searchPlaceholder: 'Search any level, e.g. "Liaoning Heping" or 新安村 / xinancun',
  searchHint: 'Narrow a common name with a province/city, e.g. "Liaoning Heping"; pinyin works too',
  noResult: 'No such place in the registry',
  loading: 'Leafing through…',
  pickTown: 'Pick a township',
  pickVillage: 'Pick a village',
  backToSearch: '← Search again',

  groupTop: 'Provinces · Prefectures · Counties',
  groupTown: 'Townships',
  groupVillage: 'Villages · Communities',
  searchingDeep: 'Leafing through 660,000 townships and villages…',
  deepHint: 'One more character reaches township and village level',
  jumping: 'Turning to that page…',
  resultTruncated: (total, shown) =>
    `${total.toLocaleString()} matches nationwide; showing the first ${shown}.`,
  scopeUnresolved: (tokens) => `No place named "${tokens}" in the registry — searched nationwide instead.`,

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

  namesTitle: 'The most common village names',
  namesSub: (era) =>
    `${era.toLocaleString()} villages share a vocabulary from one single era.`,
  namesLead: (topName, topCount, eraInTop) =>
    `The most common village name in China is not a family name — it is “${topName}” (和平, Peace): ${topCount} of them. Of the 20 most common village names, ${eraInTop} were born in the collectivization era: Peace, Unity, Happiness, Victory, Red Flag, Facing-the-Sun, East Wind… An entire generation's ideals, written onto door plates, still hanging there today.`,
  eraBadge: 'era word',
  eraDisclaimer:
    '“Era words” is our own classification, based on 1950s–70s political vocabulary — not an official definition. Traditional names such as 太平 (Peace-and-Order), 兴隆 (Prosperity) and 花园 (Garden) are deliberately excluded.',
  axisVillages: 'villages',
  clickToSearch: 'Click any row to find every village that carries the name',

  surnameTitle: 'Villages of a surname',
  surnameSub: (total) =>
    `${total} villages are named after a family. How many carry yours?`,
  surnameYours: 'Your surname',
  surnameYoursPlaceholder: '姓',
  surnameFound: (sur, count, rank) =>
    `${count.toLocaleString()} villages are named after the 「${sur}」 family — #${rank} among all surnames.`,
  surnameMissing: (sur) => `No village in the registry is named after 「${sur}」.`,

  marksTitle: 'Ponds in the south, hamlets in the north',
  marksSub: 'One character in a village name tells you which half of China it sits in',
  marksNorth: 'Northern suffixes',
  marksSouth: 'Southern suffixes',
  marksLead:
    'By density: 庄 zhuāng belongs to Tianjin and Hebei, 屯 tún to Liaoning, 堡 bǔ to Liaoning and Ningxia, 沟 gōu to the loess plateau of Gansu and Shaanxi; 塘 táng (pond), 圩 wéi (polder), 畈 fàn (paddy flat) and 冲 chōng (valley) appear almost only in Hunan, Hubei, Anhui and Jiangxi. Nobody drew this line. Centuries of farming and settlement grew it.',
  marksModeRate: 'Per 10,000 villages',
  marksModeRaw: 'Raw count',
  marksModeNote:
    'Normalized per 10,000 villages. Switch to raw counts and look at the 沟 gōu row: its top three become Hebei, Henan and Shandong — simply the provinces with the most villages. By density, 沟 actually belongs to Gansu and Shaanxi: the loess plateau. Province size is a confounder; remove it and each character returns to its own geography.',
  marksCell: (prov, mark, count, rate) =>
    `${prov} · 「${mark}」: ${count.toLocaleString()} villages, ${rate} per 10,000`,
  marksAxisProv:
    'Provinces are ordered by (northern density − southern density). This north-to-south spectrum is what the data itself produced — we did not assign it',
  marksColorNote:
    'Colour intensity = the density of that character in that province, normalized within each row — it answers “where does this character cluster”, not “which character is more common”. For cross-row magnitude, read the totals in the left column.',

  rarityUnique: 'The only one in China',
  rarityShared: (n) => `${n - 1} other villages share this name`,
  rarityLabel: 'Namesakes',

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
    'Sources: GB/T 2260 historical codes (annual full snapshots, 1980–2020), official change decrees from the Ministry of Civil Affairs (derived, 2021–2026), the NBS 2023 five-level snapshot (township/village drill-down), and the National Place-Name Database (cross-check).',
  footer: 'Open data. Free to use and redistribute.',
};

export const COPY: Record<Lang, Copy> = { zh, en };
