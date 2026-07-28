/**
 * 转化链路：情感钩子（641）→ 宏观叙事（曲线）→ 个人化裂变（寻根+卡片）
 * → 名册全景 → 开发者转化（npm）。
 * 寻根紧跟曲线：宏大叙事之后立刻让用户查自己的家乡，情绪不冷场。
 */
import { useCallback, useEffect, useState } from 'react';
import type { Geo, Names, Stats, Timeline as TimelineData } from './types';
import { COPY, type Lang } from './i18n';
import { BrandMark } from './components/BrandMark';
import { Hero } from './components/Hero';
import { Timeline } from './components/Timeline';
import { NameRings } from './components/NameRings';
import { SouthNorth } from './components/SouthNorth';
import { Explorer } from './components/Explorer';

/**
 * Vite 构建时会把 import.meta.env.BASE_URL 静态替换为配置的 base 值；
 * 但 prerender.ts（SSR）直接用 Bun 执行，不存在 Vite 的替换——BASE_URL 为 undefined，
 * 导致 `${undefined}docs/` → "undefineddocs/"。
 * 因此通过 prerendered.baseUrl 透传部署基路径作为 fallback。
 */
const BASE: string =
  typeof import.meta.env.BASE_URL === 'string' && import.meta.env.BASE_URL !== ''
    ? import.meta.env.BASE_URL
    : '/';
const REPO = 'https://github.com/tonyc726/china-administrative-division';

function detectLang(): Lang {
  // 服务端渲染时 window/navigator 不存在，返回默认值
  if (typeof window === 'undefined') return 'zh';
  const url = new URLSearchParams(window.location.search).get('lang');
  if (url === 'zh' || url === 'en') return url;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export interface AppProps {
  prerendered?: {
    timeline: TimelineData;
    stats: Stats;
    /** 部署基路径（如 /china-administrative-division/），用于 SSR 时替换 import.meta.env.BASE_URL */
    baseUrl?: string;
  };
}

export function App({ prerendered }: AppProps): JSX.Element {
  const [lang, setLang] = useState<Lang>(detectLang);
  // 如果有预渲染数据，直接使用；否则初始化为 null 并在 useEffect 中 fetch
  const [timeline, setTimeline] = useState<TimelineData | null>(
    prerendered?.timeline ?? null
  );
  const [stats, setStats] = useState<Stats | null>(
    prerendered?.stats ?? null
  );
  const [names, setNames] = useState<Names | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  /**
   * 图表 → 搜索的闭环：点「和平」就去搜全国 778 个和平村。
   * 带 n（自增）是为了让「连点两次同一个名字」也能重新触发 Explorer 的同步。
   */
  const [seed, setSeed] = useState<{ q: string; n: number } | null>(null);

  const searchFor = useCallback((q: string): void => {
    setSeed((s) => ({ q, n: (s?.n ?? 0) + 1 }));
    document.getElementById('explore')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(() => {
    // 预渲染数据已通过 props 传入，跳过 timeline/stats fetch
    if (prerendered) {
      // names 和 geo 仍然懒加载（非 SEO 关键路径）
      Promise.all([
        fetch(`${BASE}data/names.json`).then((r) => r.json() as Promise<Names>),
        fetch(`${BASE}data/geo.json`).then((r) => r.json() as Promise<Geo>),
      ])
        .then(([nm, gj]) => {
          setNames(nm);
          setGeo(gj);
        })
        .catch(() => {
          /* 静态资产缺失 → 保持骨架，不白屏 */
        });
      return;
    }

    // 无预渲染数据时（开发环境 / 降级），走原有完整 fetch 逻辑
    void Promise.all([
      fetch(`${BASE}data/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
      fetch(`${BASE}data/stats.json`).then((r) => r.json() as Promise<Stats>),
      fetch(`${BASE}data/names.json`).then((r) => r.json() as Promise<Names>),
      fetch(`${BASE}data/geo.json`).then((r) => r.json() as Promise<Geo>),
    ])
      .then(([tl, st, nm, gj]) => {
        setTimeline(tl);
        setStats(st);
        setNames(nm);
        setGeo(gj);
      })
      .catch(() => {
        /* 静态资产缺失 → 保持骨架，不白屏 */
      });
  }, [prerendered]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `${COPY[lang].brand} · ${COPY[lang].tagline}`;
  }, [lang]);

  const t = COPY[lang];
  const villages = stats ? (stats.levels['5'] ?? 0).toLocaleString() : '620,572';

  return (
    <div className="min-h-screen bg-paper text-ink-2 antialiased">
      {/* 页眉：赤陶方印 + 刊名 + 副题，随页滚动常驻（双轨叙事的入口）
          z-40：高于地图 Canvas(1)、寻根搜索浮层(10)，低于模态框(50) */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          {/* min-w-0：flex 子项默认 min-width:auto，不给它就压不下去，刊名会把窄屏撑出横向滚动 */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="group flex min-w-0 items-center gap-3 text-left"
            aria-label={t.brand}
          >
            <BrandMark className="h-9 w-9 shrink-0 transition group-hover:opacity-85" />
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-medium tracking-wide text-ink">
                {t.brand}
              </span>
              <span className="mt-0.5 hidden text-[11px] tabular-nums tracking-wide text-ink-3 sm:block">
                {t.brandSub}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-3">
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="hidden text-ink-3 transition hover:text-ink sm:block"
            >
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            <a
              href={`${prerendered?.baseUrl ?? BASE}docs/`}
              aria-label="文档站"
              className="hidden text-ink-3 transition hover:text-ink sm:block"
            >
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M1 2.5A1.5 1.5 0 012.5 1H3v13h-.5A1.5 1.5 0 011 12.5v-10zM4 1h9.5A1.5 1.5 0 0115 2.5v10a1.5 1.5 0 01-1.5 1.5H4V1zm1 1.5v10h8.5a.5.5 0 00.5-.5v-10a.5.5 0 00-.5-.5H5zm1 1h6v1H6v-1zm0 2h6v1H6v-1zm0 2h3v1H6v-1z" />
              </svg>
            </a>
            <a
              href="https://www.npmjs.com/org/cndiv"
              target="_blank"
              rel="noreferrer"
              aria-label="npm"
              className="hidden text-ink-3 transition hover:text-ink sm:block"
            >
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M0 0v16h16V0H0zm13 13h-2V5H8v8H3V3h10v10z" />
              </svg>
            </a>
            <div className="flex gap-0.5 rounded-md border border-line bg-paper-2/60 p-0.5 text-xs">
              {(['zh', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded px-2.5 py-1 transition ${
                    lang === l
                      ? 'bg-ink text-paper'
                      : 'text-ink-3 hover:bg-paper-3 hover:text-ink-2'
                  }`}
                >
                  {l === 'zh' ? '中文' : 'EN'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ---------- Hero：一台从 1980 走到 2020 的时光机 ---------- */}
      {timeline && geo ? (
        <Hero data={timeline} geo={geo} lang={lang} />
      ) : (
        <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-28">
          <p className="font-mono text-sm tracking-[0.2em] text-clay">{t.heroKicker}</p>
          <h1 className="mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <span className="font-display text-[clamp(5rem,17vw,10.5rem)] leading-none tracking-tight tabular-nums text-clay">
              652
            </span>
            <span className="font-display text-2xl text-ink sm:text-4xl">
              {t.heroSuffix}
            </span>
          </h1>
        </section>
      )}

      {/* ---------- 三个叙事：时间的、名字的、地理的 ---------- */}
      <section className="border-t border-line px-6 py-24">
        {timeline && <Timeline data={timeline} lang={lang} />}
      </section>

      <section className="border-t border-line bg-paper-2/60 px-6 py-24">
        {names && <NameRings data={names} lang={lang} onSearch={searchFor} />}
      </section>

      <section className="border-t border-line px-6 py-24">
        {names && <SouthNorth data={names} lang={lang} />}
      </section>

      {/* ---------- 寻根（含县的四十年谱系 + 稀有度）—— 核心交互，给足呼吸空间 ---------- */}
      <section
        id="explore"
        className="scroll-mt-16 border-t border-line bg-paper-2/60 px-6 py-24"
      >
        <Explorer
          lang={lang}
          villageCount={villages}
          historySince={timeline?.yearMin ?? 1980}
          seed={seed}
        />
      </section>

      {/* ---------- 名册全景 ---------- */}
      <section className="border-t border-line px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            {t.statsTitle}
          </h2>
          <p className="mt-2 text-sm text-ink-3">{t.statsLead}</p>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((l) => (
              <div key={l} className="bg-paper px-5 py-6">
                <dt className="text-xs uppercase tracking-wider text-ink-3">
                  {t.levelNames[l]}
                </dt>
                <dd className="mt-2 font-display text-2xl tabular-nums text-ink">
                  {stats ? (stats.levels[String(l)] ?? 0).toLocaleString() : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- 开发者转化：深藏青卡片（DESIGN.md cta-band-dark）—— 全页唯一的深色带 ---------- */}
      <section className="border-t border-line px-6 py-24">
        <div className="mx-auto max-w-5xl rounded-xl bg-night px-6 py-12 sm:px-12 sm:py-16">
          <h2 className="font-display text-2xl text-on-night sm:text-3xl">
            {t.devTitle}
          </h2>
          <p className="mt-4 font-display leading-relaxed text-on-night-soft">{t.devLead}</p>

          <pre className="mt-8 overflow-x-auto rounded-lg bg-night-2 p-5 font-mono text-sm text-on-night">
            <code>{`npm i @cndiv/source-2023    # 2023 全量五级快照
npm i @cndiv/source-history # GB/T 2260 · 1980–2020
npm i @cndiv/reader         # 只读查询 API`}</code>
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={REPO}
              className="rounded-md bg-night-2 px-5 py-2.5 text-sm text-on-night transition hover:bg-night-3"
            >
              {t.devRepo}
            </a>
            <a
              href="https://www.npmjs.com/org/cndiv"
              className="rounded-md bg-night-2 px-5 py-2.5 text-sm text-on-night transition hover:bg-night-3"
            >
              npm · @cndiv
            </a>
            <a
              href={`${prerendered?.baseUrl ?? BASE}docs/`}
              className="rounded-md bg-night-2 px-5 py-2.5 text-sm text-on-night transition hover:bg-night-3"
            >
              {t.devDocs}
            </a>
          </div>
        </div>
      </section>

      {/* 页脚深藏青收束（DESIGN.md footer）：明暗交替节奏的终点，永不反白 */}
      <footer className="bg-night px-6 py-16 text-on-night-soft">
        <div className="mx-auto max-w-5xl text-xs leading-relaxed">
          <p>{t.sourceNote}</p>
          <p className="mt-2">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}
