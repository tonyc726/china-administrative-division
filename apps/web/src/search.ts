/**
 * 全国五级搜索（零后端）。
 *
 * L1–L3（3348 条）随 tree.json 常驻内存，敲第一个字就有结果；
 * L4–L5（66 万条乡镇 + 村 / 社区）落在 572 个倒排桶里，按需 fetch，一次查询最多下 3 个桶。
 *
 * 桶键 = 名字前两个字的拼音首字母（新安 → "xa"）。中文 / 全拼 / 首字母缩写三种输入
 * 在「每个字的首字母」这一维上重合，所以一套桶通吃：
 *   「新安」  → chars 表查得 x + a          → xa
 *   「xinan」 → 切出音节 xin，取其后一字母 a → xa
 *   「xac」   → 直接取前两个字母            → xa
 *
 * 边界（如实说明，不粉饰）：
 *   · 只匹配**前缀**。子串匹配要按字位建 n-gram，索引体积乘以名字长度，不划算。
 *   · 查询短于 2 个字符时不查村级（首字母只有一位 → 命中面过大），只给 L1–L3。
 */
import type { Division } from './types';

const BASE = import.meta.env.BASE_URL;

/** 一次查询最多下载的桶数——多音字/切分歧义最坏情况下的兜底闸门 */
const MAX_BUCKETS = 4;
const MAX_HITS = 40;

interface Keys {
  suffixes: string[];
  /** 与 suffixes 对齐：用户真正会键入的类型词（村 / 社区 / 空） */
  kinds: string[];
  /** 汉字 → 该字在首/次位出现过的拼音首字母（多音字多值，如「厦」→ "xs"） */
  chars: Record<string, string>;
  syllables: string[];
  buckets: string[];
}

interface Entry {
  code: string;
  /** 显示名（原名，含行政尾缀） */
  name: string;
  /** 中文匹配用文本：本体 + 类型词，如「新安村」 */
  text: string;
  /** 全拼，如 xinancun */
  py: string;
  /** 首字母，如 xac */
  ini: string;
  level: number;
}

export interface Hit extends Division {
  /** 0=完全命中 1=前缀命中 2=首字母命中 —— 排序用 */
  score: number;
}

export interface DeepResult {
  hits: Hit[];
  /** 命中总数（未截断）——点「和平」进来的人有权知道全国有 778 个，而不是只看见 40 条 */
  total: number;
}

let keysPromise: Promise<Keys> | null = null;
let bucketSet: Set<string> = new Set();

function loadKeys(): Promise<Keys> {
  keysPromise ??= fetch(`${BASE}data/search/keys.json`)
    .then((r) => r.json() as Promise<Keys>)
    .then((k) => {
      bucketSet = new Set(k.buckets);
      return k;
    })
    .catch(() => {
      keysPromise = null; // 允许重试，别把失败缓存成永久失败
      throw new Error('keys unavailable');
    });
  return keysPromise;
}

const bucketCache = new Map<string, Promise<Entry[]>>();

function loadBucket(key: string, keys: Keys): Promise<Entry[]> {
  const hit = bucketCache.get(key);
  if (hit) return hit;
  const p = fetch(`${BASE}data/search/${key}.txt`)
    .then((r) => (r.ok ? r.text() : ''))
    .then((text) => parseBucket(text, keys))
    .catch(() => {
      bucketCache.delete(key);
      return [] as Entry[];
    });
  bucketCache.set(key, p);
  return p;
}

/** 行格式：code \t 名字本体 \t 音节-连字符-拼音 \t 尾缀id */
function parseBucket(text: string, keys: Keys): Entry[] {
  const out: Entry[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [code, body, syl, sid] = line.split('\t');
    if (!code || !body || !syl || sid === undefined) continue;
    const parts = syl.split('-');
    const id = Number(sid);
    out.push({
      code,
      name: body + (keys.suffixes[id] ?? ''),
      text: body + (keys.kinds[id] ?? ''),
      py: parts.join(''),
      ini: parts.map((s) => s[0] ?? '').join(''),
      // 乡镇码补零结尾，村码不补零（构建期有断言守着）
      level: code.endsWith('000') ? 4 : 5,
    });
  }
  return out;
}

const isPinyin = (q: string): boolean => /^[a-z]+$/.test(q);

/**
 * 查询 → 候选桶（按可能性降序，MAX_BUCKETS 截断）。
 *
 * 拼音的第一个音节有歧义：「gangyaozhen」可切 ga|ngyaozhen、gan|gyaozhen、gang|yaozhen，
 * 分别指向桶 gn / gg / gy。**越长的音节越可能是真实切分**（缸 gang 才是对的），
 * 所以按音节长度降序排 —— 顺序错了，截断就会把唯一正确的桶扔掉（这里踩过一次）。
 * 首字母缩写的解释放在最后：查询越长，它越不可能是缩写。
 */
function bucketsFor(q: string, keys: Keys): string[] {
  const ordered: string[] = [];
  if (isPinyin(q)) {
    const syl = keys.syllables
      .filter((s) => q.length > s.length && q.startsWith(s))
      .sort((a, b) => b.length - a.length);
    for (const s of syl) ordered.push(q[0]! + q[s.length]!);
    ordered.push(q.slice(0, 2)); // 缩写解释：xac → xa
  } else {
    const a = keys.chars[q[0]!] ?? '';
    const b = keys.chars[q[1]!] ?? '';
    for (const x of a) for (const y of b) ordered.push(x + y);
  }
  return [...new Set(ordered)].filter((k) => bucketSet.has(k)).slice(0, MAX_BUCKETS);
}

function scoreOf(e: Entry, q: string, py: boolean): number {
  if (py) {
    if (e.py === q || e.ini === q) return 0;
    if (e.py.startsWith(q)) return 1;
    if (e.ini.startsWith(q)) return 2;
    return -1;
  }
  if (e.text === q) return 0;
  if (e.text.startsWith(q)) return 1;
  return -1;
}

/** 归一化：去空格、拼音转小写。中文原样（大小写无意义） */
export function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase();
}

/** 查询是否够长到可以查村级（拼音 ≥2 字母、中文 ≥2 字） */
export function canSearchDeep(q: string): boolean {
  return q.length >= 2;
}

/**
 * 搜乡镇 + 村 / 社区。返回按命中强度排序的前 40 条。
 * 网络失败一律降级为空数组 —— 搜索框不该因为一个桶 404 就白屏。
 */
export async function searchDeep(raw: string): Promise<DeepResult> {
  const empty: DeepResult = { hits: [], total: 0 };
  const q = normalize(raw);
  if (!canSearchDeep(q)) return empty;
  let keys: Keys;
  try {
    keys = await loadKeys();
  } catch {
    return empty;
  }
  const py = isPinyin(q);
  const bucketKeys = bucketsFor(q, keys);
  if (bucketKeys.length === 0) return empty;

  const loaded = await Promise.all(bucketKeys.map((k) => loadBucket(k, keys)));
  const hits: Hit[] = [];
  for (const entries of loaded) {
    for (const e of entries) {
      const score = scoreOf(e, q, py);
      if (score < 0) continue;
      hits.push({
        code: e.code,
        name: e.name,
        level: e.level,
        parent: e.level === 5 ? `${e.code.slice(0, 9)}000` : `${e.code.slice(0, 6)}000000`,
        score,
      });
    }
  }
  // 命中强度 → 名字短的优先（「新安村」排在「新安村村」前）→ 码序稳定
  hits.sort(
    (a, b) =>
      a.score - b.score ||
      a.name.length - b.name.length ||
      a.code.localeCompare(b.code)
  );
  return { hits: hits.slice(0, MAX_HITS), total: hits.length };
}

/** 预热：用户点进搜索框就把 keys 拉下来，第一次敲键时已就绪 */
export function warmup(): void {
  void loadKeys().catch(() => {
    /* 预热失败无所谓，真正查询时会重试 */
  });
}
