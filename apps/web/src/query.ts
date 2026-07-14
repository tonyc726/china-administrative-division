/**
 * 查询解析：把「辽宁 和平」这类**限定域 + 名字**的输入拆成可执行的检索意图。
 *
 * 为什么零成本：区划码本身就是层级前缀。
 *   辽宁省 210000 → 「21」   沈阳市 210100 → 「2101」   和平区 210102 → 「210102」
 * 所有下级（含 12 位的村码 210102001001）都以它开头。于是「限定在辽宁」= 码前缀过滤，
 * 不需要为限定域再建任何索引，L1–L3 那 3348 条常驻内存的树就够了。
 *
 * 两种写法，两种信心：
 *   · 带空格「辽宁 和平」—— 用户显式表达，直接照做。
 *   · 不带空格「宁波横街」—— 我们自己切（inferred）。切分**只能兜底，不能抢戏**：
 *     万一真有个村就叫「宁波横街」，整体解释必须先跑、先赢。所以这里返回的是
 *     **按可信度降序的解释列表**，由调用方依次尝试、取第一个有结果的——
 *     而不是在这里替用户拍板。
 */
import type { Division } from './types';

/** L1–L3 的一条：Division + 拼音，供限定词解析与内存匹配复用 */
export interface PlaceRow extends Division {
  py: string;
  ini: string;
}

/** 限定域：一个或多个同名政区（「朝阳」既是北京的区也是辽宁的市，不替用户二选一） */
export interface Scope {
  divisions: Division[];
  /** 码前缀，如 ['21'] / ['2101'] / ['110105','211321'] */
  prefixes: string[];
  /** 展示用，如「辽宁省」「朝阳区 等 3 处」 */
  label: string;
}

/** 一种检索解释 */
export interface Interp {
  /** 真正拿去匹配名字的词 */
  term: string;
  /** null = 全国 */
  scope: Scope | null;
  /** true = 无空格输入下我们自己切出来的，可信度低于用户显式空格 */
  inferred: boolean;
}

export interface Parsed {
  /** 按可信度降序，至少一条（查询非空时） */
  interps: Interp[];
  /** 用户写了限定词、但名册里查无此地 —— 必须说出来，不能静默降级成全国搜 */
  unresolved: string[];
}

/** 限定词解析器：从 L1–L3 构建一次，随 tree 常驻 */
export interface Locator {
  rows: PlaceRow[];
  /** 所有政区名的 2..8 字前缀 —— 无空格切分时 O(1) 判断「这几个字是不是个地名」 */
  heads: Set<string>;
}

/** 限定词与被切出的名字都至少 2 个字：1 个字的命中面过大，且几乎必是误切 */
const MIN_SCOPE = 2;
const MIN_TERM = 2;
/** 最长的政区名（如「克孜勒苏柯尔克孜自治州」）远不止 8 字，但用户不会拿全称当限定词 */
const MAX_SCOPE = 8;

/** 层级 → 码的有效位数。L1「210000」的下级都以「21」开头 */
const SIGNIFICANT: Record<number, number> = { 1: 2, 2: 4, 3: 6 };

const prefixOf = (d: Division): string => d.code.slice(0, SIGNIFICANT[d.level] ?? 6);

const isPinyin = (s: string): boolean => /^[a-z]+$/.test(s);

/**
 * 限定词是否命中某个政区。
 * 中文走**前缀**而非全等：用户敲「辽宁」，名册里写的是「辽宁省」；敲「广西」，
 * 名册里是「广西壮族自治区」。前缀匹配把「省 / 市 / 自治区 / 民族名」这些尾缀问题
 * 一并吃掉，比维护一张尾缀剥离表稳得多（Occam）。
 */
function matches(r: PlaceRow, token: string): boolean {
  if (isPinyin(token)) {
    return r.py === token || r.ini === token || r.py.startsWith(token);
  }
  return r.name.startsWith(token);
}

export function buildLocator(rows: PlaceRow[]): Locator {
  const heads = new Set<string>();
  for (const r of rows) {
    const max = Math.min(r.name.length, MAX_SCOPE);
    for (let n = MIN_SCOPE; n <= max; n++) heads.add(r.name.slice(0, n));
  }
  return { rows, heads };
}

function scopeOf(divisions: Division[]): Scope {
  const names = [...new Set(divisions.map((d) => d.name))];
  const first = names[0] ?? '';
  return {
    divisions,
    prefixes: [...new Set(divisions.map(prefixOf))],
    label: names.length === 1 ? first : `${first} 等 ${divisions.length} 处`,
  };
}

/**
 * 逐个限定词收窄：「辽宁 沈阳 和平」→ 沈阳必须是辽宁的下级，否则不算数。
 * 某个词解析不出来时**不清空已有限定**，只记进 unresolved —— 少给一层限定，
 * 好过把用户已经给对的那层也扔掉。
 */
function resolve(
  tokens: string[],
  loc: Locator
): { divisions: Division[] | null; unresolved: string[] } {
  let acc: Division[] | null = null;
  const unresolved: string[] = [];
  for (const token of tokens) {
    const within: Division[] | null = acc;
    const cands: PlaceRow[] = loc.rows.filter(
      (r) =>
        matches(r, token) &&
        (within === null ||
          within.some((a: Division) => r.level > a.level && r.code.startsWith(prefixOf(a))))
    );
    if (cands.length === 0) {
      unresolved.push(token);
      continue;
    }
    acc = cands;
  }
  return { divisions: acc, unresolved };
}

/**
 * 无空格输入的切分：「宁波横街」→ 宁波 + 横街。
 * **长的先试** —— 「黑龙江和平」必须切成 黑龙江|和平，而「黑龙」也在 heads 里
 * （它是「黑龙江省」的 2 字前缀），短的先试就会切出「黑龙 + 江和平」这种鬼东西。
 * 拼音不切：liaoningheping 的切分歧义面太大，让用户敲个空格更诚实。
 */
function segment(q: string, loc: Locator): Interp | null {
  if (isPinyin(q)) return null;
  const max = Math.min(MAX_SCOPE, q.length - MIN_TERM);
  for (let n = max; n >= MIN_SCOPE; n--) {
    const head = q.slice(0, n);
    if (!loc.heads.has(head)) continue;
    const { divisions } = resolve([head], loc);
    if (!divisions) continue;
    return { term: q.slice(n), scope: scopeOf(divisions), inferred: true };
  }
  return null;
}

/** 分词：空格（含全角）、逗号、顿号、间隔号都算分隔符 —— 用户从哪儿粘来的都认 */
const SEPARATORS = /[\s,，、·]+/;

export function parseQuery(raw: string, loc: Locator | null): Parsed {
  const tokens = raw.trim().toLowerCase().split(SEPARATORS).filter(Boolean);
  if (tokens.length === 0) return { interps: [], unresolved: [] };

  const term = tokens.at(-1) ?? '';
  // tree 还没到位：退化成一次全国搜索，别把用户的输入吞掉
  if (!loc) return { interps: [{ term: tokens.join(''), scope: null, inferred: false }], unresolved: [] };

  if (tokens.length > 1) {
    const { divisions, unresolved } = resolve(tokens.slice(0, -1), loc);
    return {
      interps: [{ term, scope: divisions ? scopeOf(divisions) : null, inferred: false }],
      unresolved,
    };
  }

  // 单个词：整体解释优先，切分只作兜底
  const interps: Interp[] = [{ term, scope: null, inferred: false }];
  const seg = segment(term, loc);
  if (seg) interps.push(seg);
  return { interps, unresolved: [] };
}

/** 某个码是否落在限定域内（scope 为空 = 全国，一律放行） */
export function inScope(code: string, scope: Scope | null): boolean {
  if (!scope) return true;
  return scope.prefixes.some((p) => code.startsWith(p));
}
