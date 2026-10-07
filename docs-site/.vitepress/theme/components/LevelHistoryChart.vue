<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import KamiFigure from './KamiFigure.vue';
import levelCounts from '../data/generated/level-counts.json';

interface LevelSeries {
  level: number;
  label: string;
  short: string;
  hint: string;
  counts: (number | null)[];
}

interface OmittedYear {
  year: number;
  label: string;
  rows: number;
}

interface ProvinceGap {
  historyCount: number;
  snapshotCount: number;
  fromYear: number;
  toYear: number;
  onlyInHistory: string[];
}

const data = levelCounts as {
  startYear: number;
  endYear: number;
  snapshotYear: number;
  levels: LevelSeries[];
  omitted: OmittedYear[];
  emptyYears: number[];
  provinceGap: ProvinceGap | null;
};

const H = 248;
const padL = 48;
const padR = 8;
const padT = 8;
const padB = 26;
const plotH = H - padT - padB;
const MIN_BAR = 2;
const yearCount = data.endYear - data.startYear + 1;
const defaultIndex = data.snapshotYear - data.startYear;
const omittedByYear = new Map(data.omitted.map((item) => [item.year, item]));

const frameW = ref(768);
const frameEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
const hoverIndex = ref<number | null>(null);
const keyIndex = ref<number | null>(null);
let observer: ResizeObserver | undefined;

const fmt = (n: number) => n.toLocaleString('en-US');

function yearAt(index: number) {
  return data.startYear + index;
}

function totalAt(index: number) {
  let sum = 0;
  let any = false;
  for (const series of data.levels) {
    const count = series.counts[index];
    if (count != null) {
      sum += count;
      any = true;
    }
  }
  return any ? sum : null;
}

function presentValues(counts: (number | null)[]) {
  return counts.filter((count): count is number => count != null);
}

function coverage(counts: (number | null)[]) {
  const parts: string[] = [];
  let index = 0;
  while (index < counts.length) {
    while (index < counts.length && counts[index] == null) index += 1;
    if (index >= counts.length) break;
    const from = yearAt(index);
    let end = index;
    while (end + 1 < counts.length && counts[end + 1] != null) end += 1;
    const to = yearAt(end);
    parts.push(from === to ? `${from}` : `${from}–${to}`);
    index = end + 1;
  }
  return parts.join('、');
}

function tickStep(upper: number) {
  const rough = upper / 4;
  if (!(rough > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * pow);
  return steps.find((step) => step >= rough) ?? steps[steps.length - 1]!;
}

function tickLabel(value: number) {
  if (value === 0) return '0';
  if (value % 10000 === 0) return `${value / 10000}万`;
  return fmt(value);
}

const maxTotal = Math.max(
  1,
  ...Array.from({ length: yearCount }, (_, index) => totalAt(index) ?? 0)
);

const yTicks = computed(() => {
  const step = tickStep(maxTotal);
  const ticks: number[] = [];
  for (let value = 0; value <= maxTotal; value += step) ticks.push(value);
  return ticks;
});

const plotWidth = computed(() => {
  const available = Math.max(0, frameW.value - padL);
  return available >= 520 ? available : 600;
});
const plotPadL = 16;
const slot = computed(() => (plotWidth.value - padR - plotPadL) / yearCount);

function yOf(value: number) {
  return padT + plotH - (value / maxTotal) * plotH;
}

const bars = computed(() => {
  const gap = slot.value;
  const barW = Math.max(3, gap * 0.62);
  return Array.from({ length: yearCount }, (_, index) => {
    const total = totalAt(index);
    const x = plotPadL + index * gap + (gap - barW) / 2;
    const omitted = omittedByYear.get(yearAt(index)) ?? null;
    if (total == null) {
      return {
        index,
        year: yearAt(index),
        total: null as number | null,
        omitted,
        x,
        w: barW,
        segments: [] as {
          level: number;
          short: string;
          label: string;
          count: number;
          y: number;
          h: number;
        }[],
      };
    }
    const natural = (total / maxTotal) * plotH;
    const drawn = Math.max(MIN_BAR, natural);
    const boost = natural > 0 ? drawn / natural : 1;
    let cursor = padT + plotH;
    const segments = data.levels.flatMap((series) => {
      const count = series.counts[index];
      if (count == null || count <= 0) return [];
      const h = (count / maxTotal) * plotH * boost;
      cursor -= h;
      return [
        {
          level: series.level,
          short: series.short,
          label: series.label,
          count,
          y: cursor,
          h,
        },
      ];
    });
    return {
      index,
      year: yearAt(index),
      total,
      omitted,
      x,
      w: barW,
      segments,
    };
  });
});

const xTicks = computed(() => {
  const ticks: { year: number; x: number }[] = [];
  for (let year = data.startYear; year <= data.endYear; year += 1) {
    if ((year - data.startYear) % 5 !== 0) continue;
    const bar = bars.value[year - data.startYear];
    if (!bar) continue;
    ticks.push({ year, x: bar.x + bar.w / 2 });
  }
  return ticks;
});

const activeIndex = computed(
  () => hoverIndex.value ?? keyIndex.value ?? defaultIndex
);
const activeBar = computed(
  () => bars.value[activeIndex.value] ?? bars.value[0]!
);

const title = computed(() => {
  const snap = totalAt(defaultIndex);
  let priorIndex = -1;
  for (let index = defaultIndex - 1; index >= 0; index -= 1) {
    if (totalAt(index) != null) {
      priorIndex = index;
      break;
    }
  }
  if (snap == null || priorIndex < 0) return '纵轴按条数线性堆叠';
  const prior = totalAt(priorIndex)!;
  const ratio = prior > 0 ? snap / prior : 0;
  const rounded = ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1);
  return `${data.snapshotYear} 年五级合计 ${fmt(snap)}，约是 ${yearAt(priorIndex)} 年 ${fmt(prior)} 的 ${rounded} 倍`;
});

function rangesFrom(years: number[]) {
  const parts: string[] = [];
  const sorted = [...years].sort((a, b) => a - b);
  let cursor = 0;
  while (cursor < sorted.length) {
    const from = sorted[cursor]!;
    let end = cursor;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end]! + 1) {
      end += 1;
    }
    const to = sorted[end]!;
    parts.push(from === to ? `${from}` : `${from}–${to}`);
    cursor = end + 1;
  }
  return parts.join('、');
}

const caption = computed(() => {
  const upperOnly: number[] = [];
  const withLower: number[] = [];
  for (let index = 0; index < yearCount; index += 1) {
    const hasUpper = data.levels.some(
      (series) => series.level <= 3 && series.counts[index] != null
    );
    const hasLower = data.levels.some(
      (series) => series.level >= 4 && series.counts[index] != null
    );
    if (hasUpper && !hasLower) upperOnly.push(yearAt(index));
    if (hasLower) withLower.push(yearAt(index));
  }
  const covered = data.levels
    .map((series) => `${series.label} ${coverage(series.counts) || '无'}`)
    .join('；');
  const historyText = upperOnly.length
    ? `${rangesFrom(upperOnly)} 只有省、地、县`
    : '';
  const snapshotText = withLower.length
    ? `乡、村只在 ${rangesFrom(withLower)} 有数`
    : '';
  const omitted = data.omitted
    .map(
      (item) =>
        `${item.year} 年文件里有 ${fmt(item.rows)} 条${item.label}残片，留空，不画柱`
    )
    .join('。');
  const empty = data.emptyYears.length
    ? `${data.emptyYears.join('、')} 年没有快照，同样留空`
    : '';
  const gap = data.provinceGap
    ? `${data.provinceGap.fromYear}–${data.provinceGap.toYear} 年省级是 ${fmt(data.provinceGap.historyCount)}，${data.snapshotYear} 年是 ${fmt(data.provinceGap.snapshotCount)}，多出来的是${data.provinceGap.onlyInHistory.join('、')}`
    : '';
  return [
    `纵轴是线性的，柱高和这一年的合计成比例。真高不到 ${MIN_BAR}px 的年份画成 ${MIN_BAR}px，免得在 ${data.snapshotYear} 年旁边消失；柱里各级仍按实数比例分。`,
    covered ? `${covered}。` : '',
    historyText ? `${historyText}。` : '',
    snapshotText ? `${snapshotText}。` : '',
    omitted ? `${omitted}。` : '',
    empty ? `${empty}。` : '',
    gap ? `${gap}。` : '',
  ]
    .filter(Boolean)
    .join('');
});

const tipLines = computed(() => {
  const bar = activeBar.value;
  return data.levels.map((series) => {
    const count = series.counts[bar.index];
    return {
      level: series.level,
      short: series.short,
      label: series.label,
      text: count == null ? '—' : fmt(count),
    };
  });
});

const tipNote = computed(() => {
  const bar = activeBar.value;
  if (bar.total != null) return '';
  if (bar.omitted) {
    return `${bar.omitted.year} 年只有 ${fmt(bar.omitted.rows)} 条${bar.omitted.label}残片，没有画柱`;
  }
  return `${bar.year} 年没有快照`;
});

const readoutLabel = computed(() => {
  if (tipNote.value) return tipNote.value;
  const parts = tipLines.value.map((line) => `${line.label} ${line.text}`);
  return `${activeBar.value.year} 年，${parts.join('，')}，合计 ${fmt(activeBar.value.total ?? 0)}`;
});

function setFromPointer(event: PointerEvent) {
  const svg = scrollEl.value?.querySelector('svg');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return;
  const viewX = ((event.clientX - rect.left) / rect.width) * plotWidth.value;
  if (viewX < plotPadL || viewX > plotWidth.value - padR) return;
  const index = Math.floor((viewX - plotPadL) / slot.value);
  hoverIndex.value = Math.min(Math.max(index, 0), yearCount - 1);
}

function reveal(index: number) {
  const host = scrollEl.value;
  const svg = host?.querySelector('svg');
  const bar = bars.value[index];
  if (!host || !svg || !bar) return;
  const scale = svg.clientWidth / plotWidth.value;
  const center = (bar.x + bar.w / 2) * scale;
  const left = host.scrollLeft;
  const right = left + host.clientWidth;
  if (center < left + 24 || center > right - 24) {
    host.scrollLeft = center - host.clientWidth / 2;
  }
}

function onKey(event: KeyboardEvent) {
  const key = event.key;
  if (
    key !== 'ArrowLeft' &&
    key !== 'ArrowRight' &&
    key !== 'Home' &&
    key !== 'End'
  ) {
    return;
  }
  event.preventDefault();
  const current = keyIndex.value ?? hoverIndex.value ?? defaultIndex;
  const next =
    key === 'ArrowRight'
      ? Math.min(yearCount - 1, current + 1)
      : key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : key === 'Home'
          ? 0
          : yearCount - 1;
  keyIndex.value = next;
  hoverIndex.value = null;
  reveal(next);
}

const years = computed(() =>
  Array.from({ length: yearCount }, (_, index) => yearAt(index))
);

onMounted(() => {
  const host = frameEl.value;
  if (!host) return;
  const apply = () => {
    frameW.value = host.clientWidth || frameW.value;
  };
  apply();
  observer = new ResizeObserver(apply);
  observer.observe(host);
});

onBeforeUnmount(() => observer?.disconnect());

watch(frameW, () => {
  if (keyIndex.value != null) reveal(keyIndex.value);
});
</script>

<template>
  <KamiFigure
    :eyebrow="`${data.startYear}–${data.endYear} · 仓库快照里的实数 · 线性`"
    :title="title"
    :caption="caption"
  >
    <div class="ysc">
      <div class="ysc-legend">
        <span v-for="series in data.levels" :key="series.level">
          <i class="swatch" :class="`seg-${series.level}`" />{{ series.label }}
        </span>
        <span><i class="swatch empty" />无快照</span>
      </div>
      <div class="ysc-tip" role="tooltip">
        <p class="ysc-tip-year">{{ activeBar.year }}</p>
        <template v-if="activeBar.total != null">
          <p v-for="line in tipLines" :key="line.level" class="ysc-tip-row">
            <i class="swatch" :class="`seg-${line.level}`" />
            <span>{{ line.short }}</span>
            <b>{{ line.text }}</b>
          </p>
          <p class="ysc-tip-row total">
            <span>合计</span>
            <b>{{ fmt(activeBar.total) }}</b>
          </p>
        </template>
        <p v-else class="ysc-tip-note">{{ tipNote }}</p>
      </div>
      <p class="sr-only" aria-live="polite">{{ readoutLabel }}</p>
      <div ref="frameEl" class="ysc-body">
        <svg
          class="ysc-axis"
          :viewBox="`0 0 ${padL} ${H}`"
          :width="padL"
          :height="H"
          aria-hidden="true"
        >
          <g class="ysc-grid">
            <text
              v-for="tick in yTicks"
              :key="tick"
              :x="padL - 6"
              :y="yOf(tick) + 3"
              text-anchor="end"
            >
              {{ tickLabel(tick) }}
            </text>
          </g>
        </svg>
        <div
          ref="scrollEl"
          class="ysc-scroll"
          tabindex="0"
          role="group"
          aria-label="1980 到 2023 年堆叠条数，左右方向键切换年份"
          @pointerdown="setFromPointer"
          @pointermove="setFromPointer"
          @pointerleave="hoverIndex = null"
          @keydown="onKey"
        >
          <svg
            class="ysc-svg"
            :viewBox="`0 0 ${plotWidth} ${H}`"
            :width="plotWidth"
            :height="H"
            aria-hidden="true"
          >
            <g class="ysc-grid">
              <template v-for="tick in yTicks" :key="tick">
                <line
                  :x1="0"
                  :x2="plotWidth - padR"
                  :y1="yOf(tick)"
                  :y2="yOf(tick)"
                />
              </template>
            </g>
            <rect
              class="ysc-col"
              :x="activeBar.x - 1"
              :y="padT"
              :width="activeBar.w + 2"
              :height="plotH"
            />
            <template v-for="bar in bars" :key="bar.year">
              <g v-if="bar.total == null" class="ysc-empty">
                <circle
                  :cx="bar.x + bar.w / 2"
                  :cy="padT + plotH - 5"
                  r="2.2"
                />
              </g>
              <g v-else>
                <rect
                  v-for="segment in bar.segments"
                  :key="segment.level"
                  :class="`seg-${segment.level}`"
                  :x="bar.x"
                  :y="segment.y"
                  :width="bar.w"
                  :height="Math.max(segment.h, 0)"
                />
              </g>
            </template>
            <g class="ysc-xaxis">
              <text
                v-for="tick in xTicks"
                :key="tick.year"
                :x="tick.x"
                :y="H - 6"
                text-anchor="middle"
              >
                {{ tick.year }}
              </text>
            </g>
          </svg>
        </div>
      </div>
      <details class="ysc-details">
        <summary>按年份查看条数</summary>
        <div class="ysc-table-wrap">
          <table>
            <caption class="sr-only">
              {{
                data.startYear
              }}
              到
              {{
                data.endYear
              }}
              年省级、地级、县级、乡级、村级条数。横线表示该年没有这一级。无快照的年份没有画柱。
            </caption>
            <thead>
              <tr>
                <th scope="col">年</th>
                <th
                  v-for="series in data.levels"
                  :key="series.level"
                  scope="col"
                >
                  {{ series.label }}
                </th>
                <th scope="col">合计</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(year, index) in years" :key="year">
                <th scope="row">
                  {{ year }}
                  <abbr
                    v-if="omittedByYear.get(year)"
                    class="ysc-flag"
                    :title="`${omittedByYear.get(year)!.rows} 条${omittedByYear.get(year)!.label}残片未计入`"
                    >残缺</abbr
                  >
                </th>
                <td v-for="series in data.levels" :key="series.level">
                  {{
                    series.counts[index] == null
                      ? '—'
                      : fmt(series.counts[index]!)
                  }}
                </td>
                <td>
                  {{ totalAt(index) == null ? '—' : fmt(totalAt(index)!) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </KamiFigure>
</template>

<style scoped>
.ysc {
  --seg-1: #c4c0b4;
  --seg-2: #807d72;
  --seg-3: #5a5852;
  --seg-4: #c08532;
  --seg-5: var(--vp-cursor-primary, #f54e00);
  font-variant-numeric: lining-nums tabular-nums;
}
:global(html.dark) .ysc {
  --seg-1: #6e6b62;
  --seg-2: #9a968a;
  --seg-3: #c9c7bc;
  --seg-4: #e0b56a;
  --seg-5: var(--vp-cursor-primary, #ff6b2c);
}
.ysc-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 0 0 10px;
  color: var(--kami-olive, #5a5852);
  font-size: 0.78rem;
}
.ysc-legend span,
.ysc-tip-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: none;
}
.swatch.empty,
.ysc-empty circle {
  fill: none;
  stroke: var(--kami-stone, #807d72);
  stroke-width: 1.25;
}
.swatch.empty {
  width: 8px;
  height: 8px;
  border: 1.25px solid var(--kami-stone, #807d72);
  border-radius: 99px;
  background: transparent;
  box-sizing: border-box;
}
.seg-1 {
  fill: var(--seg-1);
  background: var(--seg-1);
}
.seg-2 {
  fill: var(--seg-2);
  background: var(--seg-2);
}
.seg-3 {
  fill: var(--seg-3);
  background: var(--seg-3);
}
.seg-4 {
  fill: var(--seg-4);
  background: var(--seg-4);
}
.seg-5 {
  fill: var(--seg-5);
  background: var(--seg-5);
}
.ysc-tip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--kami-border, #e6e5e0);
  border-radius: 8px;
  background: var(--kami-parchment-2, #fafaf7);
  color: var(--kami-near-black, #26251e);
  font-size: 0.78rem;
}
.ysc-tip-year {
  margin: 0;
  font-family: var(--kami-mono);
  font-weight: 600;
}
.ysc-tip-row {
  margin: 0;
  font-family: var(--kami-mono);
}
.ysc-tip-row b {
  font-weight: 600;
}
.ysc-tip-row.total {
  margin-left: auto;
}
.ysc-tip-note {
  margin: 0;
  color: var(--kami-olive, #5a5852);
}
.ysc-body {
  display: flex;
  align-items: flex-start;
}
.ysc-axis {
  flex: none;
  display: block;
}
.ysc-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  outline: none;
  touch-action: pan-x pan-y;
  cursor: crosshair;
}
.ysc-scroll:focus-visible {
  outline: 2px solid var(--kami-brand, #f54e00);
  outline-offset: 3px;
  border-radius: 6px;
}
.ysc-svg {
  display: block;
  max-width: none;
}
.ysc-grid line {
  stroke: var(--kami-border, #e6e5e0);
  stroke-width: 1;
}
.ysc-grid text,
.ysc-xaxis text {
  font-family: var(--kami-mono);
  font-size: 11px;
  fill: var(--kami-stone, #807d72);
}
.ysc-col {
  fill: var(--kami-brand, #f54e00);
  opacity: 0.12;
}
.ysc-details {
  margin-top: 12px;
}
.ysc-details summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.ysc-table-wrap {
  overflow-x: auto;
  margin-top: 8px;
}
.ysc-details table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  font-family: var(--kami-mono);
}
.ysc-details th,
.ysc-details td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--kami-border, #e6e5e0);
  text-align: right;
  white-space: nowrap;
  font-weight: 500;
}
.ysc-details th:first-child,
.ysc-details tbody th {
  text-align: left;
  color: var(--kami-near-black, #26251e);
}
.ysc-flag {
  margin-left: 4px;
  font-family: var(--kami-sans);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0;
  text-decoration: none;
  color: var(--kami-brand, #f54e00);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 640px) {
  .ysc-legend,
  .ysc-tip {
    font-size: 0.72rem;
    gap: 6px 10px;
  }
  .ysc-tip-row.total {
    margin-left: 0;
  }
}
</style>
