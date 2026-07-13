/**
 * 寻根：五级下钻 —— 传播裂变的主力。
 *
 * 62 万村级单位不可能全量进浏览器，也不需要：
 * 用户的心智本来就是「先定位到县，再找乡镇和村」。
 * 所以搜索只索引 L1–L3（3348 条，132KB 全量在前端），
 * 选中县之后才按需 fetch 该县分片（平均 6KB）。
 *
 * 分片里同时带着该县 1980–2020 的名称谱系（h）——
 * 宏大叙事在这里落到个人身上：「1985 年起，余姚县改记为余姚市」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Division, Shard, TreeRow } from '../types';
import { COPY, type Lang } from '../i18n';
import { ShareCard } from './ShareCard';

const BASE = import.meta.env.BASE_URL;

interface Props {
  lang: Lang;
  villageCount: string;
  /** 历史名册起始年（谱系文案「自 X 年起」的下限） */
  historySince: number;
}

interface TreeIndex {
  byCode: Map<string, Division>;
  childrenOf: Map<string, Division[]>;
  all: Division[];
}

function buildIndex(rows: TreeRow[]): TreeIndex {
  const byCode = new Map<string, Division>();
  const childrenOf = new Map<string, Division[]>();
  const all: Division[] = [];
  for (const [code, name, level, parent] of rows) {
    const d: Division = { code, name, level, parent };
    byCode.set(code, d);
    all.push(d);
    const key = parent || '';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(d);
  }
  return { byCode, childrenOf, all };
}

export function Explorer({ lang, villageCount, historySince }: Props): JSX.Element {
  const t = COPY[lang];
  const [index, setIndex] = useState<TreeIndex | null>(null);
  const [query, setQuery] = useState('');
  /** 当前下钻路径（省→…→末级）；空数组=搜索态 */
  const [path, setPath] = useState<Division[]>([]);
  const [shard, setShard] = useState<Shard | null>(null);
  const [loadingShard, setLoadingShard] = useState(false);

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

  /** 进入某个县时按需拉分片 */
  useEffect(() => {
    const county = path.find((d) => d.level === 3);
    if (!county) {
      setShard(null);
      return;
    }
    let alive = true;
    setLoadingShard(true);
    void fetch(`${BASE}data/shards/${county.code}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Shard>) : { h: [], t: [] }))
      .then((s) => {
        if (alive) {
          setShard(s);
          setLoadingShard(false);
        }
      })
      .catch(() => {
        if (alive) {
          setShard({ h: [], t: [] });
          setLoadingShard(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!index || q.length === 0) return [];
    return index.all.filter((d) => d.name.includes(q)).slice(0, 30);
  }, [index, query]);

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
            placeholder={t.searchPlaceholder}
            className="w-full rounded-lg border border-line-2 bg-paper px-4 py-3 text-lg text-ink outline-none transition placeholder:text-ink-3 focus:border-clay"
          />
          <p className="mt-2 text-xs text-ink-3">{t.searchHint}</p>

          {!index && query.length > 0 && (
            <p className="mt-4 text-sm text-ink-3">{t.loading}</p>
          )}
          {index && query.trim().length > 0 && results.length === 0 && (
            <p className="mt-4 text-sm text-ink-3">{t.noResult}</p>
          )}
          <ul className="mt-4 divide-y divide-line">
            {results.map((d) => {
              const chain = ancestorsOf(d);
              return (
                <li key={d.code}>
                  <button
                    type="button"
                    onClick={() => setPath(chain)}
                    className="flex w-full items-baseline gap-3 px-1 py-3 text-left transition hover:bg-paper-2"
                  >
                    <span className="font-display text-ink">{d.name}</span>
                    <span className="truncate text-xs text-ink-3">
                      {chain
                        .slice(0, -1)
                        .map((c) => c.name)
                        .join(' · ')}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-line-2">
                      {d.code}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
