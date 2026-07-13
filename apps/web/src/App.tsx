/**
 * 转化链路：情感钩子（641）→ 个人化裂变（寻根卡片）→ 开发者转化（npm）。
 * 三层顺序不可换：先让人有感觉，再让人有关系，最后才谈技术。
 */
import { useEffect, useState } from 'react';
import type { Stats, Timeline as TimelineData } from './types';
import { COPY, type Lang } from './i18n';
import { Timeline } from './components/Timeline';
import { Explorer } from './components/Explorer';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/tonyc726/china-administrative-division';

function detectLang(): Lang {
  const url = new URLSearchParams(window.location.search).get('lang');
  if (url === 'zh' || url === 'en') return url;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function App(): JSX.Element {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`${BASE}data/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
      fetch(`${BASE}data/stats.json`).then((r) => r.json() as Promise<Stats>),
    ])
      .then(([tl, st]) => {
        setTimeline(tl);
        setStats(st);
      })
      .catch(() => {
        /* 静态资产缺失 → 保持骨架，不白屏 */
      });
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `${COPY[lang].brand} · ${COPY[lang].tagline}`;
  }, [lang]);

  const t = COPY[lang];
  const villages = stats ? (stats.levels['5'] ?? 0).toLocaleString() : '620,572';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 antialiased">
      {/* 语言切换：双轨叙事的入口 */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-sm font-medium tracking-wide text-zinc-500">
          {t.brand}
        </span>
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-1 text-xs">
          {(['zh', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded px-2.5 py-1 transition ${
                lang === l ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {l === 'zh' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
      </header>

      {/* ---------- Hero：一个数字撑起整屏 ---------- */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-28">
        <p className="font-mono text-sm tracking-[0.2em] text-cyan-400">
          {t.heroKicker}
        </p>
        <h1 className="mt-6 flex items-baseline gap-4">
          <span className="bg-gradient-to-br from-red-400 to-red-600 bg-clip-text text-[clamp(5rem,18vw,11rem)] font-bold leading-none tracking-tight text-transparent">
            {timeline ? t.heroNumber(timeline.headline.countyLost) : '641'}
          </span>
          <span className="text-2xl font-medium text-zinc-300 sm:text-4xl">
            {t.heroSuffix}
          </span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400">
          {timeline
            ? t.heroLead(
                timeline.headline.countyLost,
                timeline.headline.districtGained,
                timeline.headline.cityGained
              )
            : ''}
        </p>
        <p className="mt-4 text-sm text-zinc-600">{t.heroNote}</p>
      </section>

      {/* ---------- 曲线 ---------- */}
      <section className="border-t border-zinc-900 px-6 py-24">
        {timeline && <Timeline data={timeline} lang={lang} />}
      </section>

      {/* ---------- 2023 全景 ---------- */}
      <section className="border-t border-zinc-900 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold text-zinc-100 sm:text-3xl">
            {t.statsTitle}
          </h2>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((l) => (
              <div key={l} className="bg-zinc-950 px-5 py-6">
                <dt className="text-xs uppercase tracking-wider text-zinc-600">
                  {t.levelNames[l]}
                </dt>
                <dd className="mt-2 font-mono text-2xl tabular-nums text-zinc-100">
                  {stats ? (stats.levels[String(l)] ?? 0).toLocaleString() : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- 寻根 ---------- */}
      <section className="border-t border-zinc-900 px-6 py-24">
        <Explorer lang={lang} villageCount={villages} />
      </section>

      {/* ---------- 开发者转化 ---------- */}
      <section className="border-t border-zinc-900 px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold text-zinc-100 sm:text-3xl">
            {t.devTitle}
          </h2>
          <p className="mt-4 leading-relaxed text-zinc-400">{t.devLead}</p>

          <pre className="mt-8 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 font-mono text-sm text-zinc-300">
            <code>{`npm i @cndiv/source-2023   # 2023 全量五级快照
npm i @cndiv/source-history # GB/T 2260 · 1980–2020
npm i @cndiv/reader         # 只读查询 API`}</code>
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={REPO}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700"
            >
              {t.devRepo}
            </a>
            <a
              href="https://www.npmjs.com/org/cndiv"
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700"
            >
              npm · @cndiv
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-900 px-6 py-12">
        <div className="mx-auto max-w-5xl text-xs leading-relaxed text-zinc-600">
          <p>{t.sourceNote}</p>
          <p className="mt-2">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}
