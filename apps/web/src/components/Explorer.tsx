/**
 * 寻根：五级搜索 + 下钻 —— 传播裂变的主力。
 *
 * 两层数据，两种延迟：
 *   L1–L3（3348 条，带拼音）随 tree.json 常驻内存 —— 敲第一个字就有结果，零请求；
 *   L4–L5（66 万条乡镇 + 村 / 社区）走 search.ts 的倒排桶 —— 按需 fetch，一次最多 3 个桶。
 *
 * 搜到村可以直接落到那一行（jumpTo）：从村码倒推县码 → 拉该县分片 → 补齐乡镇与村，
 * 一次 setPath 直达分享卡，用户不必再逐级点。
 *
 * 分片里同时带着该县 1980–2020 的名称谱系（h）——
 * 宏大叙事在这里落到个人身上：「1985 年起，余姚县改记为余姚市」。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Division, Shard, TreeRow } from '../types';
import { COPY, type Lang } from '../i18n';
import { ShareCard } from './ShareCard';
import { canSearchDeep, normalize, searchDeep, warmup, type Hit } from '../search';

const BASE = import.meta.env.BASE_URL;

/** 深层搜索的防抖：手速再快也不会为每个按键下一次桶 */
const DEBOUNCE_MS = 180;

interface Props {
  lang: Lang;
  villageCount: string;
  /** 历史名册起始年（谱系文案「自 X 年起」的下限） */
  historySince: number;
  /** 上面的图表点过来的查询（n 自增，连点同一项也能重新触发） */
  seed: { q: string; n: number } | null;
}

/** 内存里的 L1–L3 条目：Division + 拼音，供即时匹配 */
interface TopRow extends Division {
  py: string;
  ini: string;
}

interface TreeIndex {
  byCode: Map<string, Division>;
  childrenOf: Map<string, Division[]>;
  all: TopRow[];
}

function buildIndex(rows: TreeRow[]): TreeIndex {
  const byCode = new Map<string, Division>();
  const childrenOf = new Map<string, Division[]>();
  const all: TopRow[] = [];
  for (const [code, name, level, parent, py, ini] of rows) {
    const d: Division = { code, name, level, parent };
    byCode.set(code, d);
    all.push({ ...d, py, ini });
    const key = parent || '';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(d);
  }
  return { byCode, childrenOf, all };
}

/** 分片缓存：跳转与下钻会请求同一个县，别让浏览器发两次 */
const shardCache = new Map<string, Promise<Shard>>();

function loadShard(county: string): Promise<Shard> {
  const hit = shardCache.get(county);
  if (hit) return hit;
  const p = fetch(`${BASE}data/shards/${county}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Shard>) : { h: [], t: [] }))
    .catch(() => {
      shardCache.delete(county); // 网络抖动不该被缓存成永久的空县
      return { h: [], t: [] } as Shard;
    });
  shardCache.set(county, p);
  return p;
}

const COUNTY_OF = (code: string): string => `${code.slice(0, 6)}000000`;
const TOWN_OF = (code: string): string => `${code.slice(0, 9)}000`;

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mt-6">
      <p className="text-xs uppercase tracking-wider text-ink-3">{title}</p>
      <ul className="mt-2 divide-y divide-line">{children}</ul>
    </div>
  );
}

interface RowProps {
  name: string;
  /** 归属链：省 · 市 · 县 */
  context: string;
  code: string;
  onClick: () => void;
}

function Row({ name, context, code, onClick }: RowProps): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-baseline gap-3 px-1 py-3 text-left transition hover:bg-paper-2"
      >
        <span className="shrink-0 font-display text-ink">{name}</span>
        <span className="truncate text-xs text-ink-3">{context}</span>
        <span className="ml-auto shrink-0 font-mono text-xs text-line-2">{code}</span>
      </button>
    </li>
  );
}

export function Explorer({
  lang,
  villageCount,
  historySince,
  seed,
}: Props): JSX.Element {
  const t = COPY[lang];
  const [index, setIndex] = useState<TreeIndex | null>(null);
  const [query, setQuery] = useState('');
  /** 当前下钻路径（省→…→末级）；空数组=搜索态 */
  const [path, setPath] = useState<Division[]>([]);
  const [shard, setShard] = useState<Shard | null>(null);
  const [loadingShard, setLoadingShard] = useState(false);
  /** 深层（乡镇 / 村）搜索结果：异步，与内存里的 L1–L3 结果并排显示 */
  const [deep, setDeep] = useState<Hit[]>([]);
  /** 命中总数（未截断）：全国 778 个和平村，不能只让人看见 40 条 */
  const [deepTotal, setDeepTotal] = useState(0);
  const [deepLoading, setDeepLoading] = useState(false);
  const [jumping, setJumping] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`${BASE}data/tree.json`)
      .then((r) => r.json() as Promise<TreeRow[]>)
      .then((rows) => {
        if (alive) setIndex(buildIndex(rows));
      })
      .catch(() => {
        /* 静态资产缺失时降级为不可搜索，不炸整页 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const current = path.at(-1) ?? null;

  /** 图表点过来：灌进搜索框，并退回搜索态（不然用户会停在上一次的下钻里） */
  useEffect(() => {
    if (!seed) return;
    setQuery(seed.q);
    setPath([]);
  }, [seed]);

  /** 进入某个县时按需拉分片 */
  useEffect(() => {
    const county = path.find((d) => d.level === 3);
    if (!county) {
      setShard(null);
      return;
    }
    let alive = true;
    setLoadingShard(true);
    void loadShard(county.code).then((s) => {
      if (alive) {
        setShard(s);
        setLoadingShard(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [path]);

  /** L1–L3：内存里即时匹配（中文子串 / 全拼 / 首字母），零请求 */
  const results = useMemo((): Division[] => {
    const q = normalize(query);
    if (!index || q.length === 0) return [];
    const py = /^[a-z]+$/.test(q);
    const scored: [number, TopRow][] = [];
    for (const d of index.all) {
      let s = -1;
      if (py) {
        if (d.py === q || d.ini === q) s = 0;
        else if (d.py.startsWith(q)) s = 1;
        else if (d.ini.startsWith(q)) s = 2;
      } else if (d.name === q) s = 0;
      else if (d.name.startsWith(q)) s = 1;
      else if (d.name.includes(q)) s = 2;
      if (s >= 0) scored.push([s, d]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].level - b[1].level || a[1].name.length - b[1].name.length);
    return scored.slice(0, 12).map(([, d]) => d);
  }, [index, query]);

  /** L4–L5：防抖后查倒排桶。查询串变了就丢弃在途结果（竞态是搜索框的头号 bug） */
  useEffect(() => {
    const q = normalize(query);
    if (!canSearchDeep(q)) {
      setDeep([]);
      setDeepTotal(0);
      setDeepLoading(false);
      return;
    }
    let alive = true;
    setDeepLoading(true);
    const timer = setTimeout(() => {
      void searchDeep(q).then((r) => {
        if (!alive) return;
        setDeep(r.hits);
        setDeepTotal(r.total);
        setDeepLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  /** 从任意节点回溯出完整祖先链（tree 内 L1–L3） */
  const ancestorsOf = useCallback(
    (d: Division): Division[] => {
      if (!index) return [d];
      const chain: Division[] = [d];
      let cur = d;
      while (cur.parent) {
        const p = index.byCode.get(cur.parent);
        if (!p) break;
        chain.unshift(p);
        cur = p;
      }
      return chain;
    },
    [index]
  );

  /**
   * 搜到乡镇 / 村 → 直接落到那一行。
   * 村码自证祖先：前 6 位是县、前 9 位是乡镇。拉一次县分片就能补齐名字，
   * 一次 setPath 直达分享卡（下钻的 useEffect 会命中同一个分片缓存，不重复请求）。
   */
  const jumpTo = useCallback(
    async (hit: Hit): Promise<void> => {
      if (!index) return;
      const county = index.byCode.get(COUNTY_OF(hit.code));
      if (!county) return;
      setJumping(true);
      const s = await loadShard(county.code);
      const townCode = TOWN_OF(hit.code);
      const town = s.t.find(([code]) => code === townCode);
      const next: Division[] = ancestorsOf(county);
      if (town) {
        next.push({ code: town[0], name: town[1], level: 4, parent: county.code });
        if (hit.level === 5) {
          const v = town[2].find(([code]) => code === hit.code);
          if (v) next.push({ code: v[0], name: v[1], level: 5, parent: townCode });
        }
      }
      setPath(next);
      setJumping(false);
    },
    [index, ancestorsOf]
  );

  const options = useMemo((): Division[] => {
    if (!index || !current) return [];
    if (current.level < 3) return index.childrenOf.get(current.code) ?? [];
    if (current.level === 3) {
      return (shard?.t ?? []).map(([code, name]) => ({
        code,
        name,
        level: 4,
        parent: current.code,
      }));
    }
    if (current.level === 4) {
      const town = (shard?.t ?? []).find(([code]) => code === current.code);
      return (town?.[2] ?? []).map(([code, name]) => ({
        code,
        name,
        level: 5,
        parent: current.code,
      }));
    }
    return [];
  }, [index, current, shard]);

  const isLeaf = current !== null && (current.level === 5 || options.length === 0);
  const lineage = t.lineageStory(shard?.h ?? [], historySince);

  const q = normalize(query);
  const towns = useMemo(() => deep.filter((h) => h.level === 4), [deep]);
  const villages = useMemo(() => deep.filter((h) => h.level === 5), [deep]);
  const hasAnyResult = results.length > 0 || deep.length > 0;

  /** 深层命中的归属：县码就在内存 tree 里，直接拼出「省 · 市 · 县」，不必等分片 */
  const contextOf = useCallback(
    (code: string): string => {
      const county = index?.byCode.get(COUNTY_OF(code));
      if (!county) return '';
      return ancestorsOf(county)
        .map((c) => c.name)
        .join(' · ');
    },
    [index, ancestorsOf]
  );

  /** 末级若是村，取其全国同名数（分片第三项）——稀有度，裂变的引擎 */
  const dup = useMemo((): number => {
    if (!current || current.level !== 5 || !shard) return 0;
    for (const [, , vs] of shard.t) {
      for (const v of vs) if (v[0] === current.code) return v[2];
    }
    return 0;
  }, [current, shard]);

  return (
    <section className="mx-auto w-full max-w-3xl">
      <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t.explorerTitle}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">
        {t.explorerSub(villageCount)}
      </p>

      {path.length === 0 ? (
        <div className="mt-6">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={warmup}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-lg border border-line-2 bg-paper px-4 py-3 text-lg text-ink outline-none transition placeholder:text-ink-3 focus:border-clay"
          />
          <p className="mt-2 text-xs text-ink-3">
            {q.length > 0 && !canSearchDeep(q) ? t.deepHint : t.searchHint}
          </p>

          {!index && q.length > 0 && <p className="mt-4 text-sm text-ink-3">{t.loading}</p>}
          {index && q.length > 0 && !hasAnyResult && !deepLoading && (
            <p className="mt-4 text-sm text-ink-3">{t.noResult}</p>
          )}

          {results.length > 0 && (
            <Group title={t.groupTop}>
              {results.map((d) => (
                <Row
                  key={d.code}
                  name={d.name}
                  context={ancestorsOf(d)
                    .slice(0, -1)
                    .map((c) => c.name)
                    .join(' · ')}
                  code={d.code}
                  onClick={() => setPath(ancestorsOf(d))}
                />
              ))}
            </Group>
          )}

          {towns.length > 0 && (
            <Group title={t.groupTown}>
              {towns.map((h) => (
                <Row
                  key={h.code}
                  name={h.name}
                  context={contextOf(h.code)}
                  code={h.code}
                  onClick={() => void jumpTo(h)}
                />
              ))}
            </Group>
          )}

          {villages.length > 0 && (
            <Group title={t.groupVillage}>
              {villages.map((h) => (
                <Row
                  key={h.code}
                  name={h.name}
                  context={contextOf(h.code)}
                  code={h.code}
                  onClick={() => void jumpTo(h)}
                />
              ))}
            </Group>
          )}

          {deepTotal > deep.length && (
            <p className="mt-4 text-xs text-ink-3">
              {t.resultTruncated(deepTotal, deep.length)}
            </p>
          )}

          {(deepLoading || jumping) && (
            <p className="mt-4 text-sm text-ink-3">
              {jumping ? t.jumping : t.searchingDeep}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {/* 面包屑：任意一级可回退 */}
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setPath([]);
                setQuery('');
              }}
              className="rounded px-2 py-1 text-clay transition hover:bg-paper-2"
            >
              {t.backToSearch}
            </button>
            {path.map((d, i) => (
              <span key={d.code} className="flex items-center">
                <span className="text-line-2">/</span>
                <button
                  type="button"
                  onClick={() => setPath(path.slice(0, i + 1))}
                  className="rounded px-2 py-1 text-ink-2 transition hover:bg-paper-2"
                >
                  {d.name}
                </button>
              </span>
            ))}
          </nav>

          {/* 这个县的四十年：宏大叙事落到个人 —— 意图级的关键功能 */}
          {!loadingShard && lineage && (
            <aside className="mt-6 border-l-2 border-clay bg-paper-2 py-3 pl-4 pr-4">
              <p className="text-xs uppercase tracking-widest text-clay">
                {t.lineageLabel}
              </p>
              <p className="mt-1.5 font-display leading-relaxed text-ink-2">
                {lineage}
              </p>
            </aside>
          )}

          {loadingShard && <p className="mt-6 text-sm text-ink-3">{t.loading}</p>}

          {!loadingShard && !isLeaf && (
            <>
              <p className="mt-6 text-xs uppercase tracking-wider text-ink-3">
                {current?.level === 3 ? t.pickTown : current?.level === 4 ? t.pickVillage : ''}
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {options.map((d) => (
                  <li key={d.code}>
                    <button
                      type="button"
                      onClick={() => setPath([...path, d])}
                      className="w-full truncate rounded-md border border-line bg-paper px-3 py-2 text-left text-sm text-ink-2 transition hover:border-clay hover:text-ink"
                      title={d.name}
                    >
                      {d.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!loadingShard && isLeaf && current && (
            <>
              {dup > 0 && (
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-xs uppercase tracking-widest text-ink-3">
                    {t.rarityLabel}
                  </span>
                  <span
                    className={`font-display text-lg ${dup === 1 ? 'text-clay' : 'text-ink-2'}`}
                  >
                    {dup === 1 ? t.rarityUnique : t.rarityShared(dup)}
                  </span>
                </p>
              )}
              <ShareCard
                lang={lang}
                chain={path}
                leaf={current}
                lineage={shard?.h ?? []}
                dup={dup}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
