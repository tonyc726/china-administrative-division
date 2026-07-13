/**
 * 转化链路：情感钩子（641）→ 宏观叙事（曲线）→ 个人化裂变（寻根+卡片）
 * → 名册全景 → 开发者转化（npm）。
 * 寻根紧跟曲线：宏大叙事之后立刻让用户查自己的家乡，情绪不冷场。
 */
import { useEffect, useState } from 'react';
import type { Names, Stats, Timeline as TimelineData } from './types';
import { COPY, type Lang } from './i18n';
import { Timeline } from './components/Timeline';
import { NameRings } from './components/NameRings';
import { SouthNorth } from './components/SouthNorth';
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
  const [names, setNames] = useState<Names | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`${BASE}data/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
      fetch(`${BASE}data/stats.json`).then((r) => r.json() as Promise<Stats>),
      fetch(`${BASE}data/names.json`).then((r) => r.json() as Promise<Names>),
    ])
      .then(([tl, st, nm]) => {
        setTimeline(tl);
        setStats(st);
        setNames(nm);
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
    <div className="min-h-screen bg-paper text-ink-2 antialiased">
      {/* 语言切换：双轨叙事的入口 */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-sm tracking-wide text-ink-2">
          {t.brand}
        </span>
        <div className="flex gap-1 rounded-md border border-line p-1 text-xs">
          {(['zh', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded px-2.5 py-1 transition ${
                lang === l ? 'bg-paper-3 text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {l === 'zh' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
      </header>

      {/* ---------- Hero：一个数字撑起整屏 ---------- */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-28">
        <p className="font-mono text-sm tracking-[0.2em] text-clay">
          {t.heroKicker}
        </p>
        <h1 className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <span className="font-display text-[clamp(5rem,17vw,10.5rem)] font-semibold leading-none tracking-tight text-clay">
            {timeline ? t.heroNumber(timeline.headline.countyLost) : '641'}
          </span>
          <span className="font-display text-2xl font-medium text-ink sm:text-4xl">
            {t.heroSuffix}
          </span>
        </h1>
        <p className="mt-9 max-w-2xl font-display text-lg leading-loose text-ink-2">
          {timeline
            ? t.heroLead(
                timeline.headline.countyLost,
                timeline.headline.districtGained,
                timeline.headline.cityGained
              )
            : ''}
        </p>
        <p className="mt-4 text-sm text-ink-3">{t.heroNote}</p>
      </section>

      {/* ---------- 三个叙事：时间的、名字的、地理的 ---------- */}
      <section className="border-t border-line px-6 py-24">
        {timeline && <Timeline data={timeline} lang={lang} />}
      </section>

      <section className="border-t border-line bg-paper-2/60 px-6 py-24">
        {names && <NameRings data={names} lang={lang} />}
      </section>

      <section className="border-t border-line px-6 py-24">
        {names && <SouthNorth data={names} lang={lang} />}
      </section>

      {/* ---------- 寻根（含县的四十年谱系 + 稀有度）---------- */}
      <section className="border-t border-line bg-paper-2/60 px-6 py-24">
        <Explorer
          lang={lang}
          villageCount={villages}
          historySince={timeline?.yearMin ?? 1980}
        />
      </section>

      {/* ---------- 名册全景 ---------- */}
      <section className="border-t border-line px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
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

      {/* ---------- 开发者转化 ---------- */}
      <section className="border-t border-line px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            {t.devTitle}
          </h2>
          <p className="mt-4 font-display leading-relaxed text-ink-2">{t.devLead}</p>

          <pre className="mt-8 overflow-x-auto rounded-lg bg-ink p-5 font-mono text-sm text-paper-2">
            <code>{`npm i @cndiv/source-2023    # 2023 全量五级快照
npm i @cndiv/source-history # GB/T 2260 · 1980–2020
npm i @cndiv/reader         # 只读查询 API`}</code>
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={REPO}
              className="rounded-md border border-line-2 px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink"
            >
              {t.devRepo}
            </a>
            <a
              href="https://www.npmjs.com/org/cndiv"
              className="rounded-md border border-line-2 px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink"
            >
              npm · @cndiv
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-paper-2/60 px-6 py-12">
        <div className="mx-auto max-w-5xl text-xs leading-relaxed text-ink-3">
          <p>{t.sourceNote}</p>
          <p className="mt-2">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}
