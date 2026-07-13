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

  const x = (i: number): number =>
    PAD.left + (i / (years.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number): number =>
    H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);

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

  const hoverIdx = hover ?? null;

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
          className="w-full touch-none"
          role="img"
          aria-label={t.chartTitle}
          onMouseLeave={() => setHover(null)}
        >
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
                <text
                  x={x(idx) + 5}
                  y={PAD.top + 12 + (i % 2) * 16}
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

          {/* hover 命中区 + 指示 */}
          {years.map((yr, i) => (
            <rect
              key={yr}
              x={x(i) - (W - PAD.left - PAD.right) / years.length / 2}
              y={PAD.top}
              width={(W - PAD.left - PAD.right) / years.length}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hoverIdx !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverIdx)}
                x2={x(hoverIdx)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="#cfc5ab"
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
                    r={4}
                    fill="#faf9f5"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}

          {/* x 轴年份（每 5 年） */}
          {years.map((yr, i) =>
            yr % 5 === 0 ? (
              <text
                key={yr}
                x={x(i)}
                y={H - PAD.bottom + 20}
                textAnchor="middle"
                className="fill-ink-3 text-[11px]"
              >
                {yr}
              </text>
            ) : null
          )}
        </svg>

        {/* 读数面板：hover 时显示当年三项，未 hover 时显示末年 */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {SERIES.map((s) => {
            const arr = series[s.key];
            const v = hoverIdx !== null ? arr[hoverIdx] : arr.at(-1);
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
                <span className="font-display tabular-nums text-ink">{v}</span>
              </span>
            );
          })}
          <span className="ml-auto font-display text-xs tabular-nums text-ink-3">
            {hoverIdx !== null ? years[hoverIdx] : `${data.yearMin}–${data.yearMax}`}
          </span>
        </div>
      </div>

      <p className="mt-8 border-l-2 border-clay pl-4 font-display text-lg leading-relaxed text-ink-2">
        {t.gapNote(ratio(0), ratio(years.length - 1))}
      </p>
    </figure>
  );
}
