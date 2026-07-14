/**
 * 时间轴 —— 不是一条进度条，是四十年的**形状**。
 *
 * 一条进度条只回答「走到哪了」。但这四十年根本不是匀速的：1983 撤地设市一年烧掉几十个县，
 * 90 年代初几乎不动。把每一年消失的县数画成柱，时间轴自己就说出了这件事 ——
 * 你在拖动之前就已经知道该往哪拖。这是把数据放进控件里，而不是在控件旁边再摆一张图。
 *
 * 里程碑钉在它发生的那一年上；口径变化（kind='caveat'）用暗金标出，与真实行政变更分开 ——
 * 不能让读者把「统计口径改了」读成「行政区划变了」。
 *
 * 两个实现上的坑，改的时候别踩回去：
 *  1. SVG 用 preserveAspectRatio="none" 横向拉满，所以里面**只能放矩形和竖线**（拉伸无害）。
 *     文字与圆点一旦放进去就会被拉扁 —— 它们是绝对定位的 HTML，用 left:% 定位。
 *  2. 游标不归 React 管：Hero 的那一条 rAF 每帧直接写它的 style.left（见 headRef）。
 *     每帧 setState 会把整棵树重渲染一次，代价白付。
 */
import { useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { Timeline as TimelineData } from '../types';
import { COPY, type Lang } from '../i18n';

interface Props {
  data: TimelineData;
  lang: Lang;
  /** 连续的年份坐标（浮点）—— 键盘操作要读它的当前值 */
  posRef: MutableRefObject<number>;
  /** 游标：Hero 的 rAF 每帧写它的 style.left */
  headRef: RefObject<HTMLDivElement>;
  /** 轨道：Hero 的 rAF 每帧写它的 aria-valuenow —— 无障碍也得跟着走，不能只动像素 */
  trackRef: RefObject<HTMLDivElement>;
  onSeek: (pos: number) => void;
}

/** 柱区的视口高度（横向被拉满，纵向是真实的） */
const VH = 44;

export function Scrubber({ data, lang, posRef, headRef, trackRef, onSeek }: Props): JSX.Element {
  const t = COPY[lang];
  const { years, milestones } = data;
  const last = years.length - 1;
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);

  /** 每一年消失了多少个县 —— 时间轴的形状就是它 */
  const vol = new Map<number, number>(data.changes.map((c) => [c.y, c.out.length]));
  const peak = Math.max(1, ...vol.values());

  /** 第 i 年在轨道上的百分比位置 */
  const pct = (i: number): number => (i / last) * 100;
  const bw = (100 / (last + 1)) * 0.62;

  const seekAt = (clientX: number): void => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * last);
  };

  const key = (e: React.KeyboardEvent): void => {
    const p = posRef.current;
    const step =
      e.key === 'ArrowLeft'
        ? -1
        : e.key === 'ArrowRight'
          ? 1
          : e.key === 'PageDown'
            ? -5
            : e.key === 'PageUp'
              ? 5
              : 0;
    if (step !== 0) {
      e.preventDefault();
      onSeek(Math.min(last, Math.max(0, Math.round(p) + step)));
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      onSeek(e.key === 'Home' ? 0 : last);
    }
  };

  const hy = hover === null ? undefined : years[hover];
  const hv = hy === undefined ? 0 : (vol.get(hy) ?? 0);
  const hm = hy === undefined ? [] : milestones.filter((m) => m.year === hy);

  return (
    <div className="select-none">
      {/* 读数条：hover 时给准确数字。柱子只负责让人看见形状，数字由它说 */}
      <div className="mb-1.5 flex min-h-5 flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="text-ink-2">
          {hy !== undefined && (
            <>
              <span className="font-mono tabular-nums text-clay">{hy}</span>
              <span className="ml-2">{t.scrubVol(hv)}</span>
              {hm.map((m) => (
                <span
                  key={m.label}
                  className={`ml-2 ${m.kind === 'caveat' ? 'text-gold' : 'text-pine'}`}
                >
                  · {lang === 'zh' ? m.label : m.labelEn}
                  {m.kind === 'caveat' ? `（${t.scrubCaveat}）` : ''}
                </span>
              ))}
            </>
          )}
        </span>
        <span className="shrink-0 text-ink-3">{t.scrubHint}</span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t.heroScrub}
        aria-valuemin={data.yearMin}
        aria-valuemax={data.yearMax}
        aria-valuenow={data.yearMin}
        className="relative cursor-pointer touch-none rounded outline-none ring-clay/40 focus-visible:ring-2"
        onKeyDown={key}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekAt(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * last));
          if (dragging.current) seekAt(e.clientX);
        }}
        onPointerLeave={() => {
          dragging.current = false;
          setHover(null);
        }}
      >
        {/* 柱区：只有矩形与竖线，横向拉伸对它们无害 */}
        <svg
          viewBox={`0 0 100 ${VH}`}
          preserveAspectRatio="none"
          className="block h-11 w-full overflow-visible"
          aria-hidden
        >
          {years.map((y, i) =>
            y % 10 === 0 ? (
              <line
                key={`d${y}`}
                x1={pct(i)}
                x2={pct(i)}
                y1={0}
                y2={VH}
                stroke="var(--color-line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}
          {years.map((y, i) => {
            const v = vol.get(y) ?? 0;
            const h = (v / peak) * (VH - 3);
            return (
              <rect
                key={y}
                x={pct(i) - bw / 2}
                y={VH - Math.max(h, v > 0 ? 1.5 : 0)}
                width={bw}
                height={Math.max(h, v > 0 ? 1.5 : 0)}
                fill={hover === i ? 'var(--color-clay)' : 'var(--color-line-2)'}
                className="transition-[fill] duration-150"
              />
            );
          })}
          <line
            x1={0}
            x2={100}
            y1={VH}
            y2={VH}
            stroke="var(--color-line-2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* 里程碑：钉在它发生的那一年。暗金 = 口径变化，不是行政变更 */}
        <div className="relative h-4">
          {milestones.map((m) => {
            const i = years.indexOf(m.year);
            if (i < 0) return null;
            return (
              <span
                key={`${m.year}-${m.label}`}
                title={`${m.year} ${lang === 'zh' ? m.label : m.labelEn}`}
                style={{ left: `${pct(i)}%` }}
                className={`absolute top-1.5 -ml-[3px] h-[5px] w-[5px] rounded-full ${
                  m.kind === 'caveat' ? 'bg-gold' : 'bg-pine'
                }`}
              />
            );
          })}
        </div>

        {/* 年代刻度 */}
        <div className="relative h-4 font-mono text-[11px] tabular-nums text-ink-3">
          {years.map((y, i) =>
            y % 10 === 0 ? (
              <span
                key={`l${y}`}
                style={{
                  left: `${pct(i)}%`,
                  transform: i === 0 ? 'none' : i === last ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
                className="absolute top-0"
              >
                {y}
              </span>
            ) : null
          )}
        </div>

        {/* 游标：rAF 每帧写 style.left，不经过 React */}
        <div
          ref={headRef}
          style={{ left: '0%' }}
          className="pointer-events-none absolute top-0 h-[3.75rem] w-px bg-clay"
        >
          <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-clay" />
        </div>
      </div>
    </div>
  );
}
