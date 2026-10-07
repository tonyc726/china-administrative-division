<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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

const H = 48;
const plotW = ref(520);
const charts = ref<HTMLElement | null>(null);
const hoverIndex = ref<number | null>(null);
const keyIndex = ref<number | null>(null);
let observer: ResizeObserver | undefined;

const yearCount = data.endYear - data.startYear + 1;
const defaultIndex = data.snapshotYear - data.startYear;
const omittedByYear = new Map(data.omitted.map((item) => [item.year, item]));

const fmt = (n: number) => n.toLocaleString('en-US');

function yearAt(index: number) {
  return data.startYear + index;
}

function xOf(index: number, width: number) {
  if (yearCount <= 1) return width / 2;
  const pad = 8;
  return pad + (index / (yearCount - 1)) * (width - pad * 2);
}

function presentValues(counts: (number | null)[]) {
  return counts.filter((count): count is number => count != null);
}

function yOf(counts: (number | null)[], value: number) {
  const values = presentValues(counts);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padY = 7;
  if (min === max) return H / 2;
  const slack = (max - min) * 0.22;
  const lo = min - slack;
  const hi = max + slack;
  return padY + ((hi - value) / (hi - lo)) * (H - padY * 2);
}

function runs(counts: (number | null)[]) {
  const groups: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  counts.forEach((value, index) => {
    if (value == null) {
      if (current.length) groups.push(current);
      current = [];
      return;
    }
    current.push({ index, value });
  });
  if (current.length) groups.push(current);
  return groups;
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

const rows = computed(() =>
  data.levels.map((series) => {
    const values = presentValues(series.counts);
    let latest: number | null = null;
    for (let index = series.counts.length - 1; index >= 0; index -= 1) {
      if (series.counts[index] != null) {
        latest = series.counts[index]!;
        break;
      }
    }
    const groups = runs(series.counts).map((group) =>
      group.map((point) => ({
        ...point,
        x: xOf(point.index, plotW.value),
        y: yOf(series.counts, point.value),
        year: yearAt(point.index),
      }))
    );
    const lines = groups
      .filter((group) => group.length > 1)
      .map((group) =>
        group
          .map(
            (point, index) =>
              `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
          )
          .join(' ')
      );
    const dots = groups.flatMap((group) => {
      if (group.length === 1) return group;
      return [group[0]!, group[group.length - 1]!].filter(
        (point) => point.year !== data.snapshotYear
      );
    });
    return {
      ...series,
      latest,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      lines,
      dots,
      groups,
    };
  })
);

const activeIndex = computed(
  () => hoverIndex.value ?? keyIndex.value ?? defaultIndex
);
const activeYear = computed(() => yearAt(activeIndex.value));
const guideLeft = computed(
  () => `${(xOf(activeIndex.value, plotW.value) / plotW.value) * 100}%`
);

const ticks = computed(() => {
  const wanted = [1980, 1990, 2000, 2010, 2020, data.endYear];
  const placed: { year: number; left: string }[] = [];
  for (const year of wanted) {
    if (year < data.startYear || year > data.endYear) continue;
    const x = xOf(year - data.startYear, plotW.value);
    const prev = placed[placed.length - 1];
    const prevX = prev
      ? xOf(Number(prev.year) - data.startYear, plotW.value)
      : -Infinity;
    if (prev && x - prevX < 28) {
      if (year === data.endYear) placed.pop();
      else continue;
    }
    placed.push({
      year,
      left: `${(x / plotW.value) * 100}%`,
    });
  }
  return placed;
});

const years = computed(() =>
  Array.from({ length: yearCount }, (_, index) => yearAt(index))
);

const title = computed(() => {
  const spanned = data.levels.filter(
    (series) => presentValues(series.counts).length > 1
  );
  const single = data.levels.filter(
    (series) => presentValues(series.counts).length === 1
  );
  if (!single.length) return '每一级用自己的纵轴，缺的年份留空';
  const singleYears = [
    ...new Set(single.flatMap((series) => coverage(series.counts).split('、'))),
  ].join('、');
  return `${spanned.map((series) => series.short).join('、')}有连续年份，${single.map((series) => series.label).join('、')}只在 ${singleYears} 有数`;
});

const caption = computed(() => {
  const covered = data.levels
    .map((series) => `${series.label} ${coverage(series.counts) || '无'}`)
    .join('；');
  const omitted = data.omitted
    .map(
      (item) =>
        `${item.year} 年文件里有 ${fmt(item.rows)} 条${item.label}残片，没有画上`
    )
    .join('。');
  const empty = data.emptyYears.length
    ? `${data.emptyYears.join('、')} 年没有快照`
    : '';
  const gap = data.provinceGap
    ? `${data.provinceGap.fromYear}–${data.provinceGap.toYear} 年省级是 ${fmt(data.provinceGap.historyCount)}，${data.snapshotYear} 年是 ${fmt(data.provinceGap.snapshotCount)}，多出来的是${data.provinceGap.onlyInHistory.join('、')}`
    : '';
  return [
    '每一级用自己的纵轴。折线只连接相邻且都有数的年份，空年断开，不补 0，也不跨级比较高低。',
    `${covered}。`,
    omitted ? `${omitted}。` : '',
    empty ? `${empty}。` : '',
    gap ? `${gap}。` : '',
  ]
    .filter(Boolean)
    .join('');
});

const readoutLabel = computed(() => {
  const parts = data.levels.map((series) => {
    const count = series.counts[activeIndex.value];
    return `${series.label} ${count == null ? '无' : fmt(count)}`;
  });
  return `${activeYear.value} 年，${parts.join('，')}`;
});

function countAt(series: LevelSeries) {
  const count = series.counts[activeIndex.value];
  return count == null ? '—' : fmt(count);
}

function pointAt(row: (typeof rows.value)[number]) {
  for (const group of row.groups) {
    const point = group.find((item) => item.index === activeIndex.value);
    if (point) return point;
  }
  return null;
}

function setFromPointer(event: PointerEvent) {
  const host = charts.value;
  if (!host || plotW.value <= 0) return;
  const rect = host.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const ratio = rect.width === 0 ? 0 : x / rect.width;
  const index = Math.round(ratio * (yearCount - 1));
  hoverIndex.value = Math.min(Math.max(index, 0), yearCount - 1);
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
}

onMounted(() => {
  const host = charts.value;
  if (!host) return;
  const apply = () => {
    plotW.value = host.clientWidth || plotW.value;
  };
  apply();
  observer = new ResizeObserver(apply);
  observer.observe(host);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <KamiFigure
    :eyebrow="`${data.startYear}–${data.endYear} · 仓库快照里的实数`"
    :title="title"
    :caption="caption"
  >
    <div class="lhc">
      <div class="lhc-legend">
        <span><i class="swatch line" />历年，各自纵轴</span>
        <span><i class="swatch dot" />{{ data.snapshotYear }} 五级全量</span>
      </div>
      <p class="lhc-readout">
        <span class="lhc-year">{{ activeYear }}</span>
        <span
          v-for="series in data.levels"
          :key="series.level"
          class="lhc-chip"
        >
          {{ series.short }} {{ countAt(series) }}
        </span>
      </p>
      <p class="sr-only" aria-live="polite">{{ readoutLabel }}</p>
      <div class="lhc-grid">
        <div class="lhc-labels">
          <div v-for="row in rows" :key="row.level" class="lhc-label">
            <span class="lhc-name">{{ row.label }}</span>
            <span class="lhc-now">{{
              row.latest == null ? '—' : fmt(row.latest)
            }}</span>
            <span
              v-if="row.min != null && row.max != null && row.min !== row.max"
              class="lhc-range"
            >
              {{ fmt(row.min) }}–{{ fmt(row.max) }}
            </span>
          </div>
        </div>
        <div
          ref="charts"
          class="lhc-charts"
          tabindex="0"
          role="group"
          aria-label="按年份查看各级条数，左右方向键切换年份"
          @pointerdown="setFromPointer"
          @pointermove="setFromPointer"
          @pointerleave="hoverIndex = null"
          @keydown="onKey"
        >
          <div class="lhc-guide" :style="{ left: guideLeft }" />
          <svg
            v-for="row in rows"
            :key="row.level"
            class="lhc-svg"
            :viewBox="`0 0 ${plotW} ${H}`"
            :aria-hidden="true"
          >
            <path
              v-for="(line, index) in row.lines"
              :key="index"
              :d="line"
              class="lhc-line"
            />
            <circle
              v-for="dot in row.dots"
              :key="dot.year"
              :cx="dot.x"
              :cy="dot.y"
              :r="dot.year === data.snapshotYear ? 3.6 : 3"
              :class="dot.year === data.snapshotYear ? 'is-now' : 'is-point'"
            />
            <circle
              v-if="(hoverIndex != null || keyIndex != null) && pointAt(row)"
              :cx="pointAt(row)!.x"
              :cy="pointAt(row)!.y"
              r="3.2"
              class="is-hover"
            />
          </svg>
        </div>
        <div class="lhc-axis" aria-hidden="true">
          <span
            v-for="tick in ticks"
            :key="tick.year"
            class="lhc-tick"
            :style="{ left: tick.left }"
            >{{ tick.year }}</span
          >
        </div>
      </div>
      <details class="lhc-details">
        <summary>按年份查看条数</summary>
        <div class="lhc-table-wrap">
          <table>
            <caption class="sr-only">
              {{
                data.startYear
              }}
              到
              {{
                data.endYear
              }}
              年省级、地级、县级、乡级、村级条数。横线表示该年没有这一级。
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="(year, index) in years" :key="year">
                <th scope="row">
                  {{ year }}
                  <abbr
                    v-if="omittedByYear.get(year)"
                    class="lhc-flag"
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
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </KamiFigure>
</template>

<style scoped>
.lhc {
  --lhc-row: 48px;
  font-variant-numeric: lining-nums tabular-nums;
}
.lhc-legend,
.lhc-readout {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 0 0 10px;
  color: var(--kami-olive, #5a5852);
  font-size: 0.78rem;
}
.lhc-legend span,
.lhc-chip,
.lhc-year {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lhc-year {
  font-family: var(--kami-mono);
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.lhc-chip {
  font-family: var(--kami-mono);
  color: var(--kami-near-black, #26251e);
}
.swatch {
  display: inline-block;
  flex: none;
}
.swatch.line {
  width: 16px;
  height: 2px;
  border-radius: 99px;
  background: var(--kami-near-black, #26251e);
}
.swatch.dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--kami-brand, #f54e00);
}
.lhc-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 12px;
  align-items: start;
}
.lhc-labels,
.lhc-charts {
  display: grid;
  row-gap: 8px;
}
.lhc-label {
  height: var(--lhc-row);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 4.5rem;
}
.lhc-name {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--kami-near-black, #26251e);
}
.lhc-now,
.lhc-range {
  font-family: var(--kami-mono);
  font-size: 0.68rem;
  line-height: 1.25;
  color: var(--kami-stone, #807d72);
}
.lhc-now {
  color: var(--kami-near-black, #26251e);
  font-weight: 600;
}
.lhc-charts {
  position: relative;
  min-width: 0;
  outline: none;
  touch-action: pan-y;
  cursor: crosshair;
}
.lhc-charts:focus-visible {
  outline: 2px solid var(--kami-brand, #f54e00);
  outline-offset: 3px;
  border-radius: 6px;
}
.lhc-svg {
  width: 100%;
  height: var(--lhc-row);
  display: block;
  position: relative;
  z-index: 1;
}
.lhc-line {
  fill: none;
  stroke: var(--kami-near-black, #26251e);
  stroke-width: 1.75;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.lhc-svg circle.is-point {
  fill: var(--kami-near-black, #26251e);
}
.lhc-svg circle.is-now,
.lhc-svg circle.is-hover {
  fill: var(--kami-brand, #f54e00);
}
.lhc-guide {
  position: absolute;
  z-index: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--kami-brand, #f54e00);
  opacity: 0.7;
  pointer-events: none;
  transform: translateX(-50%);
}
.lhc-axis {
  grid-column: 2;
  position: relative;
  height: 1.15rem;
  margin-top: 4px;
}
.lhc-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--kami-mono);
  font-size: 0.66rem;
  line-height: 1;
  color: var(--kami-stone, #807d72);
  white-space: nowrap;
}
.lhc-tick:first-child {
  transform: none;
}
.lhc-tick:last-child {
  transform: translateX(-100%);
}
.lhc-details {
  margin-top: 12px;
}
.lhc-details summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.lhc-table-wrap {
  overflow-x: auto;
  margin-top: 8px;
}
.lhc-details table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  font-family: var(--kami-mono);
}
.lhc-details th,
.lhc-details td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--kami-border, #e6e5e0);
  text-align: right;
  white-space: nowrap;
  font-weight: 500;
}
.lhc-details th:first-child,
.lhc-details tbody th {
  text-align: left;
  color: var(--kami-near-black, #26251e);
}
.lhc-flag {
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
  .lhc {
    --lhc-row: 44px;
  }
  .lhc-grid {
    column-gap: 8px;
  }
  .lhc-readout,
  .lhc-legend {
    font-size: 0.72rem;
    gap: 6px 10px;
  }
}
</style>
