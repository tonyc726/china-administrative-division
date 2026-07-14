/**
 * 42 年县级构成曲线 —— 首屏叙事的核心。
 *
 * 手绘 SVG，不引 echarts/d3：41 个数据点、3 条 polyline，图表库带来的
 * 几百 KB 首屏成本换不来任何东西（传播型站点，秒开是命门）。
 *
 * 配色属于纸面：赤陶橙（县，消逝的主角）、墨松绿（区）、暗金（市）。
 */
import { useMemo, useState } from 'react';
import type { Timeline as TimelineData } from '../types';
import { COPY, type Lang } from '../i18n';

const W = 1000;
const H = 420;
const PAD = { top: 32, right: 24, bottom: 44, left: 52 };

const SERIES = [
  { key: '县', color: '#bc5738', width: 3 },
  { key: '区', color: '#2f6d68', width: 3 },
  { key: '市', color: '#a8894e', width: 2 },
] as const;

interface Props {
  data: TimelineData;
  lang: Lang;
}

export function Timeline({ data, lang }: Props): JSX.Element {
  const t = COPY[lang];
  const [hover, setHover] = useState<number | null>(null);

  const { years, series } = data;
  const yMax = 2200;
  const last = years.length - 1;

  const x = (i: number): number =>
    PAD.left + (i / (years.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number): number =>
    H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);

  /** 屏幕坐标 → 最近的年份索引（一套逻辑同时喂鼠标、触摸、触控笔） */
  const pick = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((vx - PAD.left) / (W - PAD.left - PAD.right)) * last);
    setHover(Math.min(last, Math.max(0, i)));
  };

  const step = (delta: number): void =>
    setHover((h) => Math.min(last, Math.max(0, (h ?? last) + delta)));

  const paths = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        d: series[s.key]
          .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
          .join(' '),
      })),
    [series]
  );

  const ratio = (i: number): string => {
    const c = series['县'][i];
    const d = series['区'][i];
    if (c === undefined || d === undefined || d === 0) return '—';
    return (c / d).toFixed(1);
  };

  /** 推演区起点索引（快照终年之后的第一年）；-1 表示全是快照 */
  const derivedFrom = useMemo(() => {
    const i = years.indexOf(data.provenance.snapshotMax);
    return i >= 0 && i < years.length - 1 ? i : null;
  }, [years, data.provenance.snapshotMax]);

  const hoverIdx = hover ?? null;
  const hoverYear = hoverIdx === null ? undefined : years[hoverIdx];
  /** 读数卡取值：未 hover 时定格末年（手机端常驻面板的默认态） */
  const readIdx = hoverIdx ?? last;
  const readYear = years[readIdx] ?? data.yearMax;

  return (
    <figure className="mx-auto w-full max-w-5xl">
      <figcaption className="mb-6">
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          {t.chartTitle}
        </h2>
        <p className="mt-2 text-sm text-ink-3">
          {t.chartSub(data.yearMin, data.yearMax)}
        </p>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair touch-none focus:outline-none"
          role="img"
          aria-label={t.chartTitle}
          tabIndex={0}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') step(-1);
            else if (e.key === 'ArrowRight') step(1);
            else if (e.key === 'Escape') setHover(null);
            else return;
            e.preventDefault();
          }}
        >
          <defs>
            {/* 推演区底纹：极淡的斜纹，只在余光里存在——提示口径，不抢曲线 */}
            <pattern
              id="derivedHatch"
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                stroke="#2f6d68"
                strokeWidth={1}
                opacity={0.08}
              />
            </pattern>
          </defs>

          {/* 横向网格 */}
          {[0, 500, 1000, 1500, 2000].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="#e2dbc8"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-ink-3 text-[11px]"
              >
                {v}
              </text>
            </g>
          ))}

          {/*
            推演区：2021 起 GB2260 停止发布逐年全量快照，此后的名册由民政部官方变更法令
            在 2020 名册上逐年推演得出。测量与推演的置信度不同，混在一根线里不作区分，
            就是让读者把推演当测量。故此区间用斜纹底纹显式区隔——线照常画（它经得起查：
            推出的 2026 名册与国家地名信息库实测逐码逐名吻合），但读者有权知道它是怎么来的。
          */}
          {derivedFrom !== null && (
            <g pointerEvents="none">
              <rect
                x={x(derivedFrom)}
                y={PAD.top}
                width={W - PAD.right - x(derivedFrom)}
                height={H - PAD.bottom - PAD.top}
                fill="url(#derivedHatch)"
              />
              <line
                x1={x(derivedFrom)}
                x2={x(derivedFrom)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="#2f6d68"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <text
                x={W - PAD.right - 4}
                y={H - PAD.bottom - 8}
                textAnchor="end"
                className="fill-ink-3 text-[10px]"
              >
                {t.derivedBand}
              </text>
            </g>
          )}

          {/* 里程碑：口径变化(caveat)用暗金虚线 + 明确标注，绝不混同为行政变更 */}
          {data.milestones.map((m, i) => {
            const idx = years.indexOf(m.year);
            if (idx < 0) return null;
            const isCaveat = m.kind === 'caveat';
            return (
              <g key={`${m.year}-${i}`}>
                <line
                  x1={x(idx)}
                  x2={x(idx)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke={isCaveat ? '#a8894e' : '#cfc5ab'}
                  strokeWidth={1}
                  strokeDasharray={isCaveat ? '2 4' : '4 4'}
                />
                {/* 靠右的里程碑向左书写，否则英文长标签会溢出画布被裁掉 */}
                <text
                  x={x(idx) + (x(idx) > W * 0.7 ? -5 : 5)}
                  y={PAD.top + 12 + (i % 2) * 16}
                  textAnchor={x(idx) > W * 0.7 ? 'end' : 'start'}
                  className={`text-[10px] ${isCaveat ? 'fill-gold' : 'fill-ink-3'}`}
                >
                  {lang === 'zh' ? m.label : m.labelEn}
                  {isCaveat ? ` (${t.caveatBadge})` : ''}
                </text>
              </g>
            );
          })}

          {/* 三条曲线 */}
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.width}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="[stroke-dasharray:4000] [stroke-dashoffset:0] motion-safe:animate-[draw_2s_ease-out]"
            />
          ))}

          {/* 命中指示：竖准线 + 三点 */}
          {hoverIdx !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverIdx)}
                x2={x(hoverIdx)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="#8a8474"
                strokeWidth={1}
              />
              {SERIES.map((s) => {
                const v = series[s.key][hoverIdx];
                if (v === undefined) return null;
                return (
                  <circle
                    key={s.key}
                    cx={x(hoverIdx)}
                    cy={y(v)}
                    r={4.5}
                    fill="#faf9f5"
                    stroke={s.color}
                    strokeWidth={2.5}
                  />
                );
              })}
            </g>
          )}

          {/* x 轴年份：常规每 5 年一格；hover 的那一年顶上来，并让紧邻的刻度让位 */}
          {years.map((yr, i) => {
            if (yr % 5 !== 0) return null;
            const near = hoverIdx !== null && Math.abs(i - hoverIdx) <= 1;
            if (near && i !== hoverIdx) return null;
            return (
              <text
                key={yr}
                x={x(i)}
                y={H - PAD.bottom + 20}
                textAnchor="middle"
                className={
                  i === hoverIdx
                    ? 'fill-clay text-[11px] font-semibold'
                    : 'fill-ink-3 text-[11px]'
                }
              >
                {yr}
              </text>
            );
          })}
          {hoverIdx !== null && hoverYear !== undefined && hoverYear % 5 !== 0 && (
            <text
              x={x(hoverIdx)}
              y={H - PAD.bottom + 20}
              textAnchor="middle"
              pointerEvents="none"
              className="fill-clay text-[11px] font-semibold"
            >
              {hoverYear}
            </text>
          )}
        </svg>

        {/*
         * 读数卡。桌面：贴着准线浮动（靠右侧时翻边），纵向落在两条曲线之间的空档。
         * 手机：图太窄，浮卡会盖住曲线 —— 退化为图表下方的常驻面板（默认末年），
         * 同时兼作图例，所以下面那行图例在小屏隐藏。
         * 位移全部走 sm: 前缀的 Tailwind class，inline style 只留 left（static 下自动失效）。
         */}
        <div
          className={`z-10 w-full rounded-lg border border-line-2 bg-paper/95 p-3 shadow-lg backdrop-blur-sm sm:pointer-events-none sm:absolute sm:top-1/2 sm:mt-0 sm:w-44 sm:-translate-y-1/2 ${
            readIdx / last > 0.62
              ? 'sm:-translate-x-[calc(100%+14px)]'
              : 'sm:translate-x-[14px]'
          } ${hoverIdx === null ? 'mt-4 sm:hidden' : 'mt-4'}`}
          style={{ left: `${(x(readIdx) / W) * 100}%` }}
        >
          <div className="font-display text-sm font-semibold tabular-nums text-ink">
            {t.tipYear(readYear)}
          </div>
          <dl className="mt-2 space-y-1.5">
            {SERIES.map((s, si) => {
              const v = series[s.key][readIdx];
              if (v === undefined) return null;
              const prev = readIdx > 0 ? series[s.key][readIdx - 1] : undefined;
              const delta = prev === undefined ? 0 : v - prev;
              return (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <dt className="text-ink-2">{t.tipLabels[si]}</dt>
                  <dd className="ml-auto flex items-baseline gap-1.5">
                    <span className="font-display tabular-nums text-ink">{v}</span>
                    <span className="w-8 text-right font-mono text-[10px] tabular-nums text-ink-3">
                      {delta === 0
                        ? ''
                        : delta > 0
                          ? `+${delta}`
                          : `−${Math.abs(delta)}`}
                    </span>
                  </dd>
                </div>
              );
            })}
            <div className="flex items-center gap-2 border-t border-line pt-1.5 text-xs">
              <dt className="text-ink-3">{t.tipTotal}</dt>
              <dd className="ml-auto font-display tabular-nums text-ink-2">
                {SERIES.reduce((sum, s) => sum + (series[s.key][readIdx] ?? 0), 0)}
              </dd>
            </div>
          </dl>
        </div>

        {/* 图例：定格在末年，作为静态参照——实时读数交给读数卡 */}
        <div className="mt-4 hidden flex-wrap items-center gap-x-6 gap-y-2 text-sm sm:flex">
          {SERIES.map((s) => {
            const label =
              s.key === '县'
                ? t.legendCounty
                : s.key === '区'
                  ? t.legendDistrict
                  : t.legendCity;
            return (
              <span key={s.key} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-ink-2">{label}</span>
                <span className="font-display tabular-nums text-ink">
                  {series[s.key].at(-1)}
                </span>
              </span>
            );
          })}
          <span className="ml-auto font-display text-xs tabular-nums text-ink-3">
            {`${data.yearMin}–${data.yearMax}`}
          </span>
        </div>
      </div>

      <p className="mt-8 border-l-2 border-clay pl-4 font-display text-lg leading-relaxed text-ink-2">
        {t.gapNote(ratio(0), ratio(years.length - 1))}
      </p>

      {/*
        来源分层：读者有权知道这根线的后半段是怎么来的。
        既不隐瞒「它是推演」，也不淡化「它经得起实测校验」——两句都说。
      */}
      <div className="mt-6 space-y-2 border-t border-rule pt-4 text-xs leading-relaxed text-ink-3">
        <p>
          {t.provenanceNote(
            data.provenance.snapshotMax,
            data.provenance.derived.range[1]
          )}
        </p>
        {data.provenance.pending.map((p) => (
          <p key={p.name} className="text-clay">
            {t.pendingNote(p.name, p.date)}
          </p>
        ))}
      </div>
    </figure>
  );
}
