/**
 * 最常见的村名 + 姓氏的村庄。
 *
 * 图型选择（先讲统计，再画图）：
 *   两组数据都是**一维频次**（名字 → 村数）。Cleveland–McGill 的判读精度实验里，
 *   「沿共同基线的位置/长度」排第一，颜色与面积垫底 —— 所以这里用排序条形，
 *   而不是热力图或饼图：读者要能一眼看出「和平 778」比「团结 612」多多少。
 *   （热力图留给真正的二维数据：南塘北屯的「通名 × 省份」。）
 *   姓氏用棒棒糖图 —— 同样是位置编码，墨点比色块更省油墨（Tufte），
 *   也和上面的条形拉开视觉层次。
 *
 * 交互：
 *   · hover 高亮整行，右侧亮出「搜索 →」
 *   · 点任意一行 → 把这个名字灌进下面的搜索框，搜出全国所有同名的村（三个板块串成闭环）
 *   · 姓氏区可以输入**你自己的**姓，不在榜上也能查（全量姓氏随 names.json 下发）
 *
 * 「时代词」是本站的归类而非官方定义，页面必须如实声明（见 eraDisclaimer）。
 */
import { useMemo, useState } from 'react';
import type { Names } from '../types';
import { COPY, type Lang } from '../i18n';

interface Props {
  data: Names;
  lang: Lang;
  /** 点一行 → 拿这个名字去搜索（App 负责灌进搜索框并滚过去） */
  onSearch: (q: string) => void;
}

/** 条形图的刻度：取一个略大于最大值的整数上限，刻度落在整百 */
function ticksOf(max: number, step: number): number[] {
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

export function NameRings({ data, lang, onSearch }: Props): JSX.Element {
  const t = COPY[lang];
  const top = data.topNames.slice(0, 20);
  const max = top[0]?.[1] ?? 1;
  const eraInTop = top.filter(([, , isEra]) => isEra === 1).length;
  const first = top[0];
  const ticks = ticksOf(max, 200);
  const scaleMax = ticks.at(-1) ?? max;

  const [hover, setHover] = useState<string | null>(null);

  // ---- 姓氏 ----
  const surTop = data.surnames.rank.slice(0, 15);
  const surMax = surTop[0]?.[1] ?? 1;
  const surTicks = ticksOf(surMax, 500);
  const surScaleMax = surTicks.at(-1) ?? surMax;
  const [mySur, setMySur] = useState('');
  /** 全量姓氏索引：你的姓不在 TOP15 也答得出（榜单是榜单，你的问题是你的问题） */
  const surIndex = useMemo(() => {
    const m = new Map<string, { count: number; rank: number }>();
    data.surnames.rank.forEach(([s, c], i) => m.set(s, { count: c, rank: i + 1 }));
    return m;
  }, [data.surnames.rank]);
  const myHit = mySur ? surIndex.get(mySur) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="font-display text-2xl text-ink sm:text-3xl">
        {t.namesTitle}
      </h2>
      <p className="mt-2 text-sm text-ink-3">{t.namesSub(data.era.total)}</p>

      <p className="mt-8 max-w-3xl font-display text-lg leading-loose text-ink-2">
        {first ? t.namesLead(first[0], first[1], eraInTop) : ''}
      </p>

      {/* ---------- TOP20 排序条形 ---------- */}
      <figure className="mt-10">
        <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-3">
          <span>{t.clickToSearch}</span>
          <span className="font-mono">{t.axisVillages}</span>
        </figcaption>

        {/*
         * 刻度轴（顶部）。左右留白必须与行内条形的起止**逐像素**对齐，否则网格线会骗人：
         * 行 = [序号 w-6=24] gap-3 [名字 w-14=56] gap-3 [条形 flex-1] gap-3 [数值 w-12=48] gap-3 [箭头 w-2=8]
         * → 左 24+12+56+12 = 104px，右 8+12+48+12 = 80px。
         */}
        <div className="relative ml-[104px] mr-[80px] h-4 border-b border-line">
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute -translate-x-1/2 font-mono text-[10px] tabular-nums text-ink-3"
              style={{ left: `${(v / scaleMax) * 100}%` }}
            >
              {v}
            </span>
          ))}
        </div>

        <ol className="relative">
          {/* 竖向刻度线：贯穿所有行，长度比较才有参照 */}
          <div className="pointer-events-none absolute inset-y-0 left-[104px] right-[80px]">
            {ticks.slice(1).map((v) => (
              <span
                key={v}
                className="absolute inset-y-0 w-px bg-line/70"
                style={{ left: `${(v / scaleMax) * 100}%` }}
              />
            ))}
          </div>

          {top.map(([name, count, isEra], i) => {
            const on = hover === name;
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onSearch(name)}
                  onMouseEnter={() => setHover(name)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(name)}
                  onBlur={() => setHover(null)}
                  className={`group flex w-full items-center gap-3 rounded py-1 text-left transition ${
                    on ? 'bg-paper-3/40' : ''
                  }`}
                  title={`${name} · ${count}`}
                >
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-3">
                    {i + 1}
                  </span>
                  <span
                    className={`w-14 shrink-0 font-display text-base ${
                      isEra ? 'text-clay' : 'text-ink'
                    }`}
                  >
                    {name}
                  </span>
                  <span className="relative h-4 flex-1">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-sm transition-opacity ${
                        isEra ? 'bg-clay/80' : 'bg-ink-3/45'
                      } ${on ? 'opacity-100' : 'opacity-85'}`}
                      style={{ width: `${(count / scaleMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
                    {count}
                  </span>
                  <span
                    className={`w-2 shrink-0 text-xs text-clay transition-opacity ${
                      on ? 'opacity-100' : 'opacity-0'
                    }`}
                    aria-hidden
                  >
                    →
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </figure>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-clay/80" />
          {t.eraBadge}
        </span>
        <span className="text-line-2">·</span>
        <span className="max-w-2xl leading-relaxed">{t.eraDisclaimer}</span>
      </p>

      {/* ---------- 姓氏：棒棒糖图 + 查你自己的姓 ---------- */}
      <div className="mt-16 border-t border-line pt-10">
        <h3 className="font-display text-xl text-ink">
          {t.surnameTitle}
        </h3>
        <p className="mt-2 text-sm text-ink-3">
          {t.surnameSub(data.surnames.total.toLocaleString())}
        </p>

        {/* 你的姓：榜单回答不了「我」的问题，所以给一个入口 */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-ink-3" htmlFor="sur">
            {t.surnameYours}
          </label>
          <input
            id="sur"
            value={mySur}
            maxLength={1}
            onChange={(e) => setMySur(e.target.value.trim())}
            placeholder={t.surnameYoursPlaceholder}
            className="w-14 rounded-md border border-line-2 bg-paper px-3 py-1.5 text-center font-display text-lg text-ink outline-none transition placeholder:text-line-2 focus:border-clay"
          />
          {mySur && (
            <p className="font-display text-ink-2">
              {myHit ? (
                <button
                  type="button"
                  onClick={() => onSearch(`${mySur}家`)}
                  className="text-left underline decoration-line-2 underline-offset-4 transition hover:text-clay hover:decoration-clay"
                >
                  {t.surnameFound(mySur, myHit.count, myHit.rank)}
                </button>
              ) : (
                <span className="text-ink-3">{t.surnameMissing(mySur)}</span>
              )}
            </p>
          )}
        </div>

        <figure className="mt-8">
          {/* 同上：行 = [姓 w-7=28] gap-3 [杆 flex-1] gap-3 [数值 w-12=48] → 左 40px，右 60px */}
          <div className="relative ml-[40px] mr-[60px] h-4 border-b border-line">
            {surTicks.map((v) => (
              <span
                key={v}
                className="absolute -translate-x-1/2 font-mono text-[10px] tabular-nums text-ink-3"
                style={{ left: `${(v / surScaleMax) * 100}%` }}
              >
                {v}
              </span>
            ))}
          </div>
          <ol className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-[40px] right-[60px]">
              {surTicks.slice(1).map((v) => (
                <span
                  key={v}
                  className="absolute inset-y-0 w-px bg-line/70"
                  style={{ left: `${(v / surScaleMax) * 100}%` }}
                />
              ))}
            </div>
            {surTop.map(([sur, count]) => {
              const mine = sur === mySur;
              return (
                <li key={sur}>
                  <button
                    type="button"
                    onClick={() => onSearch(`${sur}家`)}
                    className="group flex w-full items-center gap-3 rounded py-1 text-left transition hover:bg-paper-3/40"
                  >
                    <span
                      className={`w-7 shrink-0 font-display text-base ${
                        mine ? 'font-medium text-clay' : 'text-ink'
                      }`}
                    >
                      {sur}
                    </span>
                    {/* 棒棒糖：一根细杆 + 一个墨点，位置即数值 */}
                    <span className="relative h-5 flex-1">
                      <span
                        className={`absolute top-1/2 left-0 h-px -translate-y-1/2 ${
                          mine ? 'bg-clay' : 'bg-line-2'
                        }`}
                        style={{ width: `${(count / surScaleMax) * 100}%` }}
                      />
                      <span
                        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform group-hover:scale-125 ${
                          mine ? 'bg-clay' : 'bg-ink-3'
                        }`}
                        style={{ left: `${(count / surScaleMax) * 100}%` }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </figure>
      </div>
    </div>
  );
}
