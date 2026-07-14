/**
 * 预构建：把 @cndiv 数据源编译成静态资产（零后端）
 *
 * 产物（apps/web/public/data/）：
 *   timeline.json      42 年县级构成曲线 —— 首屏叙事，几 KB
 *   tree.json          省/市/县三级树（含拼音）—— 下钻与即时搜索索引
 *   stats.json         2023 五级全景数字
 *   shards/<c>.json    每个县下的乡镇+村，按需 fetch
 *   search/keys.json   倒排索引的元数据（首字母表/音节表/尾缀表）
 *   search/<xy>.txt    倒排桶：66 万乡镇+村，按需 fetch（见下）
 *
 * 数据来源为 workspace 内的 source 包（已发布至 npm，构建期读 CSV）。
 * 产物不入 git（见 .gitignore），CI 构建时重新生成。
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { pinyin } from 'pinyin-pro';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = `${ROOT}apps/web/public/data`;

interface Row {
  code: string;
  name: string;
  level: number;
  parent: string;
  year: number;
}

/** CSV 解析：字段可被引号包裹（name 含逗号时不会炸） */
function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f: string[] = [];
    let cur = '';
    let quoted = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        f.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    f.push(cur);
    if (f.length < 5) continue;
    rows.push({
      code: f[0],
      name: f[1],
      level: Number(f[2]),
      parent: f[3],
      year: Number(f[4]),
    });
  }
  return rows;
}

/** 县级单位的"类型"——撤县设区叙事的核心维度 */
type Kind = '县' | '区' | '市' | '旗' | '其他';
function kindOf(name: string): Kind {
  if (name.endsWith('区')) return '区';
  if (name.endsWith('县')) return '县';
  if (name.endsWith('市')) return '市';
  if (name.endsWith('旗')) return '旗';
  return '其他';
}

/**
 * 谱系词根：撤县设区/设市时区划码常变，但名字的词根几乎总是保留
 * （余姚县→余姚市、丰南县→丰南市→丰南区）。按「地级前缀(code4)+词根」
 * 把 2023 的县对齐到 1980–2020 历史，即可还原每个县自己的变迁史。
 * 词根 <2 字（如「吉县」→「吉」）放弃匹配——重名误配的代价大于收益。
 */
const ROOT_SUFFIXES = ['自治县', '自治旗', '林区', '矿区', '特区', '新区', '县', '市', '区', '旗'];
function rootOf(name: string): string | null {
  for (const s of ROOT_SUFFIXES) {
    if (name.endsWith(s)) {
      const r = name.slice(0, -s.length);
      return r.length >= 2 ? r : null;
    }
  }
  return name.length >= 2 ? name : null;
}

/**
 * 里程碑：只标注数据能自证的事实。
 * ⚠️ 2013 年省级 31→34 是 GB/T 2260 纳入港澳台的**口径变化**，非行政变更——
 *    必须如实标注，否则是编故事。
 */
const MILESTONES = [
  {
    year: 1988,
    label: '海南建省',
    labelEn: 'Hainan becomes a province',
    note: '省级 29 → 30',
    kind: 'real' as const,
  },
  {
    year: 1997,
    label: '重庆设直辖市',
    labelEn: 'Chongqing made a municipality',
    note: '省级 30 → 31',
    kind: 'real' as const,
  },
  {
    year: 2013,
    label: '港澳台纳入编码表',
    labelEn: 'HK/MO/TW added to code table',
    note: '省级 31 → 34：编码口径变化，非行政区划变更',
    kind: 'caveat' as const,
  },
  {
    year: 2013,
    label: '撤县设区提速',
    labelEn: 'County-to-district wave accelerates',
    note: '此后「县」加速转为「区」',
    kind: 'real' as const,
  },
];

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(`${OUT}/shards`, { recursive: true });

  // ---------- 1. 42 年时间线 ----------
  const hist = parseCsv(
    await Bun.file(`${ROOT}packages/source-history/data/divisions.csv`).text()
  );
  // 2021 仅 21 行，数据残缺 → 有效区间截至 2020
  const YEAR_MAX = 2020;
  const byYear = new Map<number, Row[]>();
  for (const r of hist) {
    if (r.year > YEAR_MAX) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const series: Record<Kind, number[]> = { 县: [], 区: [], 市: [], 旗: [], 其他: [] };
  const provinces: number[] = [];
  for (const y of years) {
    const rows = byYear.get(y)!;
    const c: Record<Kind, number> = { 县: 0, 区: 0, 市: 0, 旗: 0, 其他: 0 };
    for (const r of rows) if (r.level === 3) c[kindOf(r.name)]++;
    for (const k of Object.keys(series) as Kind[]) series[k].push(c[k]);
    provinces.push(rows.filter((r) => r.level === 1).length);
  }
  /**
   * ---------- 名册的逐年增删：时光机真正要放的东西 ----------
   *
   * 一个数字在滚动不叫时光机，名册在翻页才是。所以逐年比对县级名册，还原到**具体的名字**：
   * 哪一行被划掉、变成了什么。配对分两步（先强后弱，弱的配不上就认「真的没了」）：
   *   1. 同码改名 —— 余姚县(330281) → 余姚市(330281)，最硬的证据；
   *   2. 换码但同「地级前缀 + 词根」—— 撤县设区常换码（丰南县 → 丰南区）。
   * 都配不上的，如实记作从名册上消失（后继不明，不编）。
   */
  const l3ByYear = new Map<number, Map<string, string>>();
  for (const r of hist) {
    if (r.level !== 3 || r.year > YEAR_MAX) continue;
    if (!l3ByYear.has(r.year)) l3ByYear.set(r.year, new Map());
    l3ByYear.get(r.year)!.set(r.code, r.name);
  }

  interface YearChange {
    y: number;
    /** [省码2位, 消失的县, 它变成的名字（'' = 后继不明，真的没了）] —— 省码是它在地图上的落点 */
    out: [string, string, string][];
    /** [省码2位, 新写下的县] */
    in: [string, string][];
  }
  /**
   * ⚠️ 身份必须用「省 + 名字」，不能用编码。
   * 1988 年河北地改市把整批县的编码前缀改了（香河县、武安县……码变了、名字没变），
   * 按编码比对会把它们全判成「消失 + 新增」—— 名册讲的是名字，不是编码。
   * 省级前缀（code2）四十年里几乎不动，用它区分同名县（全国有多个「城关」「郊区」）。
   */
  const idOf = (code: string, name: string): string => `${code.slice(0, 2)}|${name}`;
  const rootKey = (code: string, name: string): string =>
    `${code.slice(0, 2)}|${rootOf(name) ?? name}`;

  const changes: YearChange[] = [];
  for (let i = 1; i < years.length; i++) {
    const prev = l3ByYear.get(years[i - 1]!);
    const cur = l3ByYear.get(years[i]!);
    if (!prev || !cur) continue;

    const prevIds = new Set<string>();
    for (const [c, n] of prev) prevIds.add(idOf(c, n));
    const curIds = new Set<string>();
    for (const [c, n] of cur) curIds.add(idOf(c, n));

    /** 继任者索引：先查当年新写上的名字，再退回当年名册里任何同词根的单位（并入既有的区） */
    const bornIdx = new Map<string, string>();
    const curIdx = new Map<string, string>();
    for (const [c, n] of cur) {
      const k = rootKey(c, n);
      if (!curIdx.has(k)) curIdx.set(k, n);
      if (!prevIds.has(idOf(c, n)) && !bornIdx.has(k)) bornIdx.set(k, n);
    }

    const out: [string, string, string][] = [];
    const paired = new Set<string>();
    for (const [code, name] of prev) {
      if (kindOf(name) !== '县') continue; // 这一节讲的是「县」的离场
      if (curIds.has(idOf(code, name))) continue; // 名字还在名册上（换码不算）
      const k = rootKey(code, name);
      const heir = bornIdx.get(k) ?? curIdx.get(k);
      if (heir && heir !== name) {
        out.push([code.slice(0, 2), name, heir]);
        paired.add(k);
      } else {
        out.push([code.slice(0, 2), name, '']); // 后继不明：如实记作从名册上消失，不编
      }
    }

    const born: [string, string][] = [];
    for (const [code, name] of cur) {
      if (kindOf(name) !== '县') continue;
      if (prevIds.has(idOf(code, name))) continue;
      if (paired.has(rootKey(code, name))) continue; // 已作为「继任者」出现在 out 里
      born.push([code.slice(0, 2), name]);
    }

    if (out.length > 0 || born.length > 0) {
      changes.push({ y: years[i]!, out, in: born });
    }
  }

  const timeline = {
    yearMin: years[0],
    yearMax: YEAR_MAX,
    years,
    series,
    provinces,
    milestones: MILESTONES,
    changes,
    headline: {
      countyLost: series['县'][0] - series['县'].at(-1)!,
      districtGained: series['区'].at(-1)! - series['区'][0],
      cityGained: series['市'].at(-1)! - series['市'][0],
    },
    source: 'GB/T 2260 (@cndiv/source-history)',
  };
  await writeFile(`${OUT}/timeline.json`, JSON.stringify(timeline));

  /*
   * 省级边界：原样搬运，构建期不做任何几何加工。
   * 它是**第三方数据**且带着未了结的合规风险（高德衍生 / 无审图号），
   * 出处、许可与发布阻塞项全部写在 data/PROVENANCE.md —— 动它之前先读那份文件。
   * 换数据源只需换那一个文件，渲染端只认 {provs, jd} 这个契约。
   */
  const bounds = await readFile(`${ROOT}apps/web/data/china-bounds.json`, 'utf8');
  await writeFile(`${OUT}/geo.json`, bounds);

  // ---------- 1.5 县级谱系索引：code4|词根 → year→name ----------
  // 同键同年出现两个不同名（如「井陉县」与「井陉矿区」并存）即词根歧义，
  // 整键放弃——宁可不显示谱系，不显示拼错的历史。
  const lineageIdx = new Map<string, Map<number, string>>();
  const ambiguous = new Set<string>();
  for (const r of hist) {
    if (r.level !== 3 || r.year > YEAR_MAX) continue;
    const root = rootOf(r.name);
    if (!root) continue;
    const key = `${r.code.slice(0, 4)}|${root}`;
    if (!lineageIdx.has(key)) lineageIdx.set(key, new Map());
    const ym = lineageIdx.get(key)!;
    const existing = ym.get(r.year);
    if (existing !== undefined && existing !== r.name) ambiguous.add(key);
    else ym.set(r.year, r.name);
  }

  /** 某县的变迁事件序列：[[year, name], ...] 仅保留变化点；歧义/无匹配返回 [] */
  function lineageOf(county: Row): [number, string][] {
    const root = rootOf(county.name);
    if (!root) return [];
    const key = `${county.code.slice(0, 4)}|${root}`;
    if (ambiguous.has(key)) return [];
    const ym = lineageIdx.get(key);
    if (!ym) return [];
    const events: [number, string][] = [];
    for (const y of [...ym.keys()].sort((a, b) => a - b)) {
      const n = ym.get(y)!;
      if (events.length === 0 || events[events.length - 1]![1] !== n) events.push([y, n]);
    }
    return events;
  }

  // ---------- 2. 2023 快照：三级树 + 按县分片 ----------
  const snap = parseCsv(
    await Bun.file(`${ROOT}packages/source-2023/data/divisions.csv`).text()
  );

  /** 逐字拼音（无声调）。pinyin-pro 带词库，地名多音字读对：六安 luan、铅山 yanshan、厦门 xiamen */
  const sylOf = (s: string): string[] =>
    pinyin(s, { toneType: 'none', type: 'array' }) as string[];
  const iniOf = (syl: string[]): string => syl.map((s) => s[0] ?? '').join('');

  // L1–L3 只有 3348 条，全量带拼音进 tree.json（前端内存里即时搜，零请求）
  const tree = snap
    .filter((r) => r.level <= 3)
    .map((r) => {
      const syl = sylOf(r.name);
      return [r.code, r.name, r.level, r.parent, syl.join(''), iniOf(syl)];
    });

  // 乡镇(L4) 按其父县分组；村(L5) 按其父乡镇分组
  const townsByCounty = new Map<string, Row[]>();
  const villagesByTown = new Map<string, Row[]>();
  for (const r of snap) {
    if (r.level === 4) {
      if (!townsByCounty.has(r.parent)) townsByCounty.set(r.parent, []);
      townsByCounty.get(r.parent)!.push(r);
    } else if (r.level === 5) {
      if (!villagesByTown.has(r.parent)) villagesByTown.set(r.parent, []);
      villagesByTown.get(r.parent)!.push(r);
    }
  }

  const countyByCode = new Map<string, Row>();
  for (const r of snap) if (r.level === 3) countyByCode.set(r.code, r);

  // ---------- 2.5 村名统计：62 万个村名是这个站最大的金矿 ----------
  const provOf = new Map<string, string>();
  for (const r of snap) if (r.level === 1) provOf.set(r.code.slice(0, 2), r.name);

  /** 村名本体：反复剥离行政尾缀（「XX社区居民委员会」→「XX」），得到可比对的名字 */
  const NAME_TAILS = [
    '社区居民委员会',
    '村民委员会',
    '居民委员会',
    '社区居委会',
    '村委会',
    '居委会',
    '社区',
    '村',
  ];
  function nameBody(name: string): string {
    let s = name;
    let changed = true;
    while (changed) {
      changed = false;
      for (const tail of NAME_TAILS) {
        if (s.length > tail.length && s.endsWith(tail)) {
          s = s.slice(0, -tail.length);
          changed = true;
          break;
        }
      }
    }
    return s;
  }

  const villages = snap.filter((r) => r.level === 5);
  const nameFreq = new Map<string, number>();
  for (const v of villages) {
    const b = nameBody(v.name);
    if (b) nameFreq.set(b, (nameFreq.get(b) ?? 0) + 1);
  }

  /**
   * 「时代词」词表：1950–70 年代集体化时期的政治话语。
   * ⚠️ 这是**我们的归类**，非官方定义，页面须如实说明。
   * 只收录语义明确属于该话语体系的词；「太平」「兴隆」「花园」「东山」等
   * 传统地名/中性词一律不收 —— 宁可少算，不可扩大解释。
   */
  const ERA_WORDS = [
    '团结', '和平', '胜利', '红星', '红旗', '前进', '光明', '幸福', '新华', '新民',
    '向阳', '朝阳', '东风', '新建', '联合', '解放', '建设', '民主', '跃进', '先锋',
    '曙光', '黎明', '星火', '卫星', '长征', '国庆', '建国', '富强', '振兴', '文明',
    '自由', '光荣', '英雄', '战斗', '红光', '五星', '红卫', '工农', '互助', '合作',
    '友谊', '爱国', '立新', '永丰', '丰收', '跃升', '奋斗', '前锋', '新生', '民生',
  ];
  const eraSet = new Set(ERA_WORDS);
  let eraTotal = 0;
  const eraRank: [string, number][] = [];
  for (const w of ERA_WORDS) {
    const c = nameFreq.get(w) ?? 0;
    if (c > 0) {
      eraTotal += c;
      eraRank.push([w, c]);
    }
  }
  eraRank.sort((a, b) => b[1] - a[1]);

  const topNames = [...nameFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([n, c]) => [n, c, eraSet.has(n) ? 1 : 0]);

  // 姓氏村：本体形如「X家…」
  const surnameFreq = new Map<string, number>();
  for (const v of villages) {
    const m = nameBody(v.name).match(/^([一-龥])家/);
    if (m?.[1]) surnameFreq.set(m[1], (surnameFreq.get(m[1]) ?? 0) + 1);
  }
  const surnameTotal = [...surnameFreq.values()].reduce((a, b) => a + b, 0);
  // 全量下发（几百个姓，~5KB）：用户要能查**自己的**姓有多少个村，不只是榜上的前 20
  const surnames = [...surnameFreq.entries()].sort((a, b) => b[1] - a[1]);

  /**
   * 地名通名的南北分野：纯统计，不画地图（规避地图审核），用「通名 × 省份」矩阵表达。
   * north/south 的归属由数据自证（见每个字的省份分布），非先验断言。
   *
   * ⚠️ 统计陷阱：直接比原始村数会被**省份体量混淆**——河北的村本来就多，
   * 任何字在河北的绝对数都高。所以同时输出每省村总数，前端按「每万村」归一化，
   * 南北分野才是真的分野，而不是「哪个省村多」的影子。
   */
  const MARKS = {
    north: ['庄', '屯', '营', '堡', '沟'],
    south: ['塘', '圩', '畈', '冲', '垅'],
  };
  const provTotals: Record<string, number> = {};
  for (const v of villages) {
    const p = provOf.get(v.code.slice(0, 2)) ?? '?';
    provTotals[p] = (provTotals[p] ?? 0) + 1;
  }
  const markStats: Record<string, { total: number; provs: [string, number][] }> = {};
  for (const mk of [...MARKS.north, ...MARKS.south]) {
    const pm = new Map<string, number>();
    let total = 0;
    for (const v of villages) {
      if (!nameBody(v.name).includes(mk)) continue;
      total++;
      const p = provOf.get(v.code.slice(0, 2)) ?? '?';
      pm.set(p, (pm.get(p) ?? 0) + 1);
    }
    // 全省份下发（10 字 × 31 省，几 KB）——热力图需要完整矩阵，不能只给 top5
    markStats[mk] = {
      total,
      provs: [...pm.entries()].sort((a, b) => b[1] - a[1]),
    };
  }

  const distinct = nameFreq.size;
  const uniqueOnes = [...nameFreq.values()].filter((c) => c === 1).length;

  await writeFile(
    `${OUT}/names.json`,
    JSON.stringify({
      totalVillages: villages.length,
      distinct,
      uniqueOnes,
      topNames,
      era: { words: ERA_WORDS, total: eraTotal, rank: eraRank.slice(0, 20) },
      surnames: { total: surnameTotal, rank: surnames },
      marks: {
        north: MARKS.north,
        south: MARKS.south,
        stats: markStats,
        provTotals,
      },
    })
  );

  let shardCount = 0;
  let shardBytes = 0;
  let maxShard = 0;
  let lineageHit = 0;
  for (const [county, towns] of townsByCounty) {
    // 分片 = { h: 该县 1980–2020 变迁事件, t: [乡镇码, 乡镇名, [[村码, 村名], ...]] }
    const countyRow = countyByCode.get(county);
    const h = countyRow ? lineageOf(countyRow) : [];
    if (h.length > 0) lineageHit++;
    // 村元组第三项 = 全国同名村数（重名数）。随分片下发，稀有度查询零额外请求。
    const t = towns.map((tw) => [
      tw.code,
      tw.name,
      (villagesByTown.get(tw.code) ?? []).map((v) => [
        v.code,
        v.name,
        nameFreq.get(nameBody(v.name)) ?? 1,
      ]),
    ]);
    const json = JSON.stringify({ h, t });
    await writeFile(`${OUT}/shards/${county}.json`, json);
    shardCount++;
    shardBytes += json.length;
    maxShard = Math.max(maxShard, json.length);
  }
  await writeFile(`${OUT}/tree.json`, JSON.stringify(tree));

  // ---------- 3. 全国搜索倒排索引：66 万乡镇 + 村 / 社区 ----------
  /**
   * 桶键 = 名字前两个字的拼音首字母（新安 → "xa"）。
   *
   * 为什么是这个键：中文、全拼、首字母缩写三种输入，在「每个字的首字母」这一维上是重合的
   * ——「新安」「xinan」「xa」都能推出 x+a。一套桶同时服务三种查询，不必建三份索引
   * （体积翻倍换不来任何东西）。612 个桶，最大 7.7k 条，比按首字或首音节分桶均匀一个量级。
   *
   * 代价（如实记录）：只支持**前缀**匹配。子串搜索要按每个字位建 n-gram 索引，
   * 体积乘以名字长度，对一个零后端的传播站不划算。地名搜索本来就是从头打起的。
   */
  const suffixes: string[] = [];
  const kinds: string[] = [];
  const suffixIds = new Map<string, number>();
  /** 尾缀 → 用户真正会键入的类型词：「新安村村民委员会」的搜索文本是「新安村」 */
  const idOfSuffix = (s: string): number => {
    const hit = suffixIds.get(s);
    if (hit !== undefined) return hit;
    const id = suffixes.length;
    suffixes.push(s);
    kinds.push(s.startsWith('村') ? '村' : s.startsWith('社区') ? '社区' : '');
    suffixIds.set(s, id);
    return id;
  };
  idOfSuffix('');

  const buckets = new Map<string, string[]>();
  /** 汉字 → 该字在首/次位实际出现过的拼音首字母（多音字多值，如「厦」→ "xs"） */
  const charIni = new Map<string, Set<string>>();
  const syllables = new Set<string>();
  const safeKey = (c: string): string => (/^[a-z0-9]$/.test(c) ? c : '_');

  for (const r of snap) {
    if (r.level !== 4 && r.level !== 5) continue;
    const body = r.level === 5 ? nameBody(r.name) : r.name;
    if (!body) continue;
    const sid = idOfSuffix(r.name.slice(body.length));
    const text = body + kinds[sid]!; // 可搜索文本
    const syl = sylOf(text);
    const ini = iniOf(syl);
    if (!ini) continue;

    for (const s of syl) if (/^[a-z]+$/.test(s)) syllables.add(s);
    // 逐字对齐时才登记「字→首字母」，错位行（含数字/外文）只进桶不进字表
    if (syl.length === text.length) {
      for (let i = 0; i < Math.min(2, text.length); i++) {
        const ch = text[i]!;
        const letter = syl[i]![0];
        if (!letter) continue;
        if (!charIni.has(ch)) charIni.set(ch, new Set());
        charIni.get(ch)!.add(letter);
      }
    }

    const key = safeKey(ini[0] ?? '_') + safeKey(ini[1] ?? '_');
    // 层级由 code 自证：乡镇码补零结尾（120115108000），村码不补零 —— 省掉一整列。
    // 这是数据的现实（41,351/620,572 零反例），不是假设；断言在此，数据漂移时立刻炸。
    if ((r.level === 4) !== r.code.endsWith('000')) {
      throw new Error(`层级无法由 code 自证：${r.code} L${r.level} ${r.name}（搜索索引契约被打破）`);
    }
    const line = `${r.code}\t${body.replace(/[\t\n]/g, '')}\t${syl.join('-')}\t${sid}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(line);
  }

  await mkdir(`${OUT}/search`, { recursive: true });
  let idxBytes = 0;
  let maxBucket = 0;
  let maxBucketKey = '';
  for (const [key, lines] of buckets) {
    const body = lines.join('\n');
    await writeFile(`${OUT}/search/${key}.txt`, body);
    idxBytes += body.length;
    if (lines.length > maxBucket) {
      maxBucket = lines.length;
      maxBucketKey = key;
    }
  }
  await writeFile(
    `${OUT}/search/keys.json`,
    JSON.stringify({
      suffixes,
      kinds,
      chars: Object.fromEntries([...charIni].map(([c, s]) => [c, [...s].join('')])),
      syllables: [...syllables].sort(),
      buckets: [...buckets.keys()].sort(),
    })
  );

  const levels: Record<number, number> = {};
  for (const r of snap) levels[r.level] = (levels[r.level] ?? 0) + 1;
  await writeFile(
    `${OUT}/stats.json`,
    JSON.stringify({ year: 2023, levels, total: snap.length, source: 'NBS (@cndiv/source-2023)' })
  );

  // ---------- 报告 ----------
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log('✅ 构建完成');
  console.log(`  timeline.json  ${kb(JSON.stringify(timeline).length)}  (${years[0]}–${YEAR_MAX})`);
  console.log(`  tree.json      ${kb(JSON.stringify(tree).length)}  (${tree.length} 节点, L1–L3)`);
  console.log(`  shards/        ${shardCount} 片, 合计 ${kb(shardBytes)}, 均 ${kb(shardBytes / shardCount)}, 最大 ${kb(maxShard)}`);
  console.log(`  谱系: ${lineageHit}/${shardCount} 个县接上 1980–2020 历史（歧义键 ${ambiguous.size} 个已放弃）`);
  console.log(`  村名: ${distinct.toLocaleString()} 个不同名字, 独一无二 ${uniqueOnes.toLocaleString()} (${((uniqueOnes / distinct) * 100).toFixed(1)}%)`);
  console.log(`  时代词: ${eraTotal.toLocaleString()} 个村 · 榜首「${eraRank[0]?.[0]}」${eraRank[0]?.[1]}`);
  console.log(`  姓氏村: ${surnameTotal.toLocaleString()} 个 · 榜首「${surnames[0]?.[0]}家」${surnames[0]?.[1]}`);
  console.log(`  头条: 县 -${timeline.headline.countyLost} / 区 +${timeline.headline.districtGained} / 市 +${timeline.headline.cityGained}`);
  console.log(`  五级: ${Object.entries(levels).map(([l, n]) => `L${l}=${n.toLocaleString()}`).join(' ')}`);
  const idxRows = [...buckets.values()].reduce((a, b) => a + b.length, 0);
  const keysBytes = JSON.stringify({
    suffixes,
    kinds,
    chars: Object.fromEntries([...charIni].map(([c, s]) => [c, [...s].join('')])),
    syllables: [...syllables],
    buckets: [...buckets.keys()],
  }).length;
  console.log(
    `  搜索索引: ${idxRows.toLocaleString()} 条 (L4+L5) → ${buckets.size} 桶, 合计 ${kb(idxBytes)}, 均 ${kb(idxBytes / buckets.size)}, 最大「${maxBucketKey}」${maxBucket.toLocaleString()} 条 ${kb((idxBytes / idxRows) * maxBucket)}`
  );
  console.log(`  keys.json      ${kb(keysBytes)}  (${charIni.size} 字 / ${syllables.size} 音节 / ${suffixes.length} 尾缀)`);
}

await main();
