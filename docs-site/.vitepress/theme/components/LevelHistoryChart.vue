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

interface DuplicateYear {
  year: number;
  sameAs: number;
}

interface ReleaseSources {
  release: string;
  nbsTownshipYears: number[];
  gb2260FilledYears: number[];
  gb2260Extras: { year: number; names: string[] }[];
  csvFragments: OmittedYear[];
  gb2260Duplicates: DuplicateYear[];
  nbsSnapshotSqlite: number[] | null;
}

const data = levelCounts as {
  startYear: number;
  endYear: number;
  snapshotYear: number;
  levels: LevelSeries[];
  omitted: OmittedYear[];
  emptyYears: number[];
  provinceGap: ProvinceGap | null;
  sources?: ReleaseSources;
};

const padL = 48;
const padR = 8;
const padT = 8;
const padB = 26;
const yearCount = data.endYear - data.startYear + 1;
const showLower = ref(false);
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

function sumAt(index: number, include: (level: number) => boolean) {
  let sum = 0;
  let any = false;
  for (const series of data.levels) {
    if (!include(series.level)) continue;
    const count = series.counts[index];
    if (count != null) {
      sum += count;
      any = true;
    }
  }
  return any ? sum : null;
}

function totalAt(index: number) {
  return sumAt(index, () => true);
}

function adminAt(index: number) {
  return sumAt(index, (level) => level <= 3);
}

function localAt(index: number) {
  return sumAt(index, (level) => level >= 4);
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

function ticksFor(upper: number) {
  const step = tickStep(upper);
  const ticks: number[] = [];
  for (let value = 0; value <= upper; value += step) ticks.push(value);
  return ticks;
}

const adminMax = Math.max(
  1,
  ...Array.from({ length: yearCount }, (_, index) => adminAt(index) ?? 0)
);
const localMax = Math.max(
  1,
  ...Array.from({ length: yearCount }, (_, index) => localAt(index) ?? 0)
);
const adminTicks = ticksFor(adminMax);
const localTicks = ticksFor(localMax);

const geom = computed(() => {
  if (!showLower.value) {
    const adminH = 214;
    return {
      H: padT + adminH + padB,
      adminTop: padT,
      adminH,
      adminBase: padT + adminH,
      localTop: padT,
      localH: 0,
      localBase: padT,
      gap: 0,
    };
  }
  const localH = 128;
  const gap = 22;
  const adminH = 86;
  const adminTop = padT + localH + gap;
  return {
    H: adminTop + adminH + padB,
    adminTop,
    adminH,
    adminBase: adminTop + adminH,
    localTop: padT,
    localH,
    localBase: padT + localH,
    gap,
  };
});

const plotWidth = computed(() => {
  const available = Math.max(0, frameW.value - padL);
  return available >= 520 ? available : 600;
});
const plotPadL = 16;
const slot = computed(() => (plotWidth.value - padR - plotPadL) / yearCount);

function yAdmin(value: number) {
  const g = geom.value;
  return g.adminBase - (value / adminMax) * g.adminH;
}

function yLocal(value: number) {
  const g = geom.value;
  return g.localBase - (value / localMax) * g.localH;
}

const bars = computed(() => {
  const gap = slot.value;
  const barW = Math.max(3, gap * 0.62);
  const g = geom.value;
  const split = showLower.value;
  return Array.from({ length: yearCount }, (_, index) => {
    const adminTotal = adminAt(index);
    const localTotal = localAt(index);
    const x = plotPadL + index * gap + (gap - barW) / 2;
    const omitted = omittedByYear.get(yearAt(index)) ?? null;
    const segments: {
      level: number;
      short: string;
      label: string;
      count: number;
      y: number;
      h: number;
    }[] = [];
    if (adminTotal != null) {
      let cursor = g.adminBase;
      for (const series of data.levels) {
        if (series.level > 3) continue;
        const count = series.counts[index];
        if (count == null || count <= 0) continue;
        const h = (count / adminMax) * g.adminH;
        cursor -= h;
        segments.push({
          level: series.level,
          short: series.short,
          label: series.label,
          count,
          y: cursor,
          h,
        });
      }
    }
    if (split && localTotal != null) {
      let cursor = g.localBase;
      for (const series of data.levels) {
        if (series.level < 4) continue;
        const count = series.counts[index];
        if (count == null || count <= 0) continue;
        const h = (count / localMax) * g.localH;
        cursor -= h;
        segments.push({
          level: series.level,
          short: series.short,
          label: series.label,
          count,
          y: cursor,
          h,
        });
      }
    }
    const drawn = split
      ? adminTotal != null || localTotal != null
      : adminTotal != null;
    return {
      index,
      year: yearAt(index),
      adminTotal,
      localTotal,
      omitted,
      drawn,
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
  const snapAdmin = adminAt(defaultIndex);
  let priorIndex = -1;
  for (let index = defaultIndex - 1; index >= 0; index -= 1) {
    if (adminAt(index) != null) {
      priorIndex = index;
      break;
    }
  }
  const prior = priorIndex >= 0 ? adminAt(priorIndex) : null;
  const adminLine =
    snapAdmin != null && prior != null
      ? `${data.snapshotYear} 年省、地、县 ${fmt(snapAdmin)}，${yearAt(priorIndex)} 年 ${fmt(prior)}`
      : '省、地、县按条数线性堆叠';
  if (!showLower.value) return adminLine;
  const snap = totalAt(defaultIndex);
  return snap == null
    ? adminLine
    : `${data.snapshotYear} 年五级合计 ${fmt(snap)}。上轴是乡、村，下轴是省、地、县`;
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
    const hasUpper = adminAt(index) != null;
    const hasLower = localAt(index) != null;
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
    ? `乡、村在 ${rangesFrom(withLower)} 有数`
    : '';
  const ratio = adminMax > 0 ? Math.round(localMax / adminMax) : 0;
  const scaleText = showLower.value
    ? `上轴是乡、村（0 到 ${fmt(localMax)}），下轴是省、地、县（0 到 ${fmt(adminMax)}）。两段各自线性，中间断开。`
    : `现在只画省、地、县，纵轴 0 到 ${fmt(adminMax)}，柱高和这三级的合计成比例。乡、村的峰值大约是这根轴的 ${ratio} 倍，打开「包含乡、村」后分到上面一根轴，而不是压成底线上的一条线。`;
  const fragments = (data.sources?.csvFragments ?? [])
    .map(
      (item) =>
        `${item.year} 年历史 CSV 里有 ${fmt(item.rows)} 条${item.label}残片，没有用；这一年的省、地、县来自 GB2260 年度库`
    )
    .join('。');
  const duplicates = (data.sources?.gb2260Duplicates ?? [])
    .map((item) => {
      const plotted = adminAt(item.year - data.startYear) != null;
      return plotted
        ? `${item.year} 年的 GB2260 库与 ${item.sameAs} 字节相同`
        : `${item.year} 年的 GB2260 库与 ${item.sameAs} 字节相同，省、地、县不另画，乡、村仍用这一年的 NBS 库`;
    })
    .join('。');
  const extras = (data.sources?.gb2260Extras ?? [])
    .map((item) => {
      const count = data.levels[0]?.counts[item.year - data.startYear];
      if (count == null) return '';
      return `${item.year} 年省级是 ${fmt(count)}，多出来的是${item.names.join('、')}`;
    })
    .filter(Boolean)
    .join('。');
  const gap = data.provinceGap
    ? `${data.provinceGap.fromYear}–${data.provinceGap.toYear} 年省级是 ${fmt(data.provinceGap.historyCount)}，${data.snapshotYear} 年是 ${fmt(data.provinceGap.snapshotCount)}，多出来的是${data.provinceGap.onlyInHistory.join('、')}`
    : '';
  const sqlite = data.sources?.nbsSnapshotSqlite;
  let placeholder = '';
  if (sqlite) {
    const csvSum = totalAt(defaultIndex) ?? 0;
    const sqliteSum = sqlite.reduce((sum, count) => sum + count, 0);
    const delta = sqliteSum - csvSum;
    if (delta > 0) {
      placeholder = `${data.snapshotYear} 年五级用的是已发布 CSV，比 NBS sqlite 少 ${fmt(delta)} 条自指向占位`;
    }
  }
  return [
    scaleText,
    covered ? `${covered}。` : '',
    historyText ? `${historyText}。` : '',
    snapshotText ? `${snapshotText}。` : '',
    '乡、村来自 NBS 年度库。1980–2021 的省、地、县来自 GB2260，和 NBS 的县级口径不一样，没有合成一条县级曲线。',
    fragments ? `${fragments}。` : '',
    duplicates ? `${duplicates}。` : '',
    gap ? `${gap}。` : '',
    extras ? `${extras}。` : '',
    placeholder ? `${placeholder}。` : '',
  ]
    .filter(Boolean)
    .join('');
});

const tipLines = computed(() => {
  const bar = activeBar.value;
  return data.levels
    .filter((series) => showLower.value || series.level <= 3)
    .map((series) => {
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
  if (bar.drawn) return '';
  const duplicate = data.sources?.gb2260Duplicates?.find(
    (item) => item.year === bar.year
  );
  if (duplicate) {
    return `${bar.year} 年没有独立的省、地、县快照，GB2260 库与 ${duplicate.sameAs} 字节相同`;
  }
  if (bar.omitted) {
    return `${bar.omitted.year} 年只有 ${fmt(bar.omitted.rows)} 条${bar.omitted.label}残片，没有画柱`;
  }
  return `${bar.year} 年没有快照`;
});

function missingAdmin(year: number) {
  const item = data.sources?.gb2260Duplicates?.find(
    (entry) => entry.year === year
  );
  if (!item || adminAt(year - data.startYear) != null) return null;
  return item;
}

const eyebrow = computed(() =>
  showLower.value
    ? `${data.startYear}–${data.endYear} · 两段各自线性`
    : `${data.startYear}–${data.endYear} · 省、地、县线性`
);

const readoutLabel = computed(() => {
  if (tipNote.value) return tipNote.value;
  const bar = activeBar.value;
  const parts = tipLines.value.map((line) => `${line.label} ${line.text}`);
  const totals = [
    bar.adminTotal != null ? `省地县 ${fmt(bar.adminTotal)}` : '',
    showLower.value && bar.localTotal != null
      ? `乡村 ${fmt(bar.localTotal)}`
      : '',
  ].filter(Boolean);
  return `${bar.year} 年，${parts.join('，')}${totals.length ? `，${totals.join('，')}` : ''}`;
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
  <KamiFigure :eyebrow="eyebrow" :title="title" :caption="caption">
    <div class="ysc">
      <div class="ysc-legend">
        <span
          v-for="series in data.levels"
          :key="series.level"
          :class="{ 'is-dim': !showLower && series.level >= 4 }"
        >
          <i class="swatch" :class="`seg-${series.level}`" />{{ series.label }}
        </span>
        <span><i class="swatch empty" />无省地县快照</span>
        <button
          type="button"
          class="ysc-toggle"
          :aria-pressed="showLower"
          @click="showLower = !showLower"
        >
          包含乡、村
        </button>
      </div>
      <div class="ysc-tip" role="tooltip">
        <p class="ysc-tip-year">{{ activeBar.year }}</p>
        <template v-if="activeBar.drawn">
          <p v-for="line in tipLines" :key="line.level" class="ysc-tip-row">
            <i class="swatch" :class="`seg-${line.level}`" />
            <span>{{ line.short }}</span>
            <b>{{ line.text }}</b>
          </p>
          <p v-if="activeBar.adminTotal != null" class="ysc-tip-row total">
            <span>省地县</span>
            <b>{{ fmt(activeBar.adminTotal) }}</b>
          </p>
          <p
            v-if="showLower && activeBar.localTotal != null"
            class="ysc-tip-row total"
          >
            <span>乡村</span>
            <b>{{ fmt(activeBar.localTotal) }}</b>
          </p>
        </template>
        <p v-else class="ysc-tip-note">{{ tipNote }}</p>
      </div>
      <p class="sr-only" aria-live="polite">{{ readoutLabel }}</p>
      <div ref="frameEl" class="ysc-body">
        <svg
          class="ysc-axis"
          :viewBox="`0 0 ${padL} ${geom.H}`"
          :width="padL"
          :height="geom.H"
          aria-hidden="true"
        >
          <g class="ysc-grid">
            <text
              v-for="tick in adminTicks"
              :key="`a-${tick}`"
              :x="padL - 6"
              :y="yAdmin(tick) + 3"
              text-anchor="end"
            >
              {{ tickLabel(tick) }}
            </text>
            <template v-if="showLower">
              <text
                v-for="tick in localTicks"
                :key="`l-${tick}`"
                :x="padL - 6"
                :y="yLocal(tick) + 3"
                text-anchor="end"
              >
                {{ tick === 0 ? '' : tickLabel(tick) }}
              </text>
            </template>
          </g>
          <g v-if="showLower" class="ysc-break" aria-hidden="true">
            <line
              :x1="padL - 16"
              :x2="padL - 4"
              :y1="geom.localBase + 6"
              :y2="geom.adminTop - 4"
            />
            <line
              :x1="padL - 16"
              :x2="padL - 4"
              :y1="geom.localBase + 11"
              :y2="geom.adminTop + 1"
            />
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
            :viewBox="`0 0 ${plotWidth} ${geom.H}`"
            :width="plotWidth"
            :height="geom.H"
            aria-hidden="true"
          >
            <g class="ysc-grid">
              <line
                v-for="tick in adminTicks"
                :key="`a-${tick}`"
                :x1="0"
                :x2="plotWidth - padR"
                :y1="yAdmin(tick)"
                :y2="yAdmin(tick)"
              />
              <template v-if="showLower">
                <line
                  v-for="tick in localTicks"
                  :key="`l-${tick}`"
                  :x1="0"
                  :x2="plotWidth - padR"
                  :y1="yLocal(tick)"
                  :y2="yLocal(tick)"
                />
              </template>
            </g>
            <rect
              class="ysc-col"
              :x="activeBar.x - 1"
              :y="showLower ? geom.localTop : geom.adminTop"
              :width="activeBar.w + 2"
              :height="
                geom.adminBase - (showLower ? geom.localTop : geom.adminTop)
              "
            />
            <template v-for="bar in bars" :key="bar.year">
              <g v-if="!bar.drawn || (showLower && bar.adminTotal == null)">
                <g class="ysc-empty">
                  <circle
                    :cx="bar.x + bar.w / 2"
                    :cy="geom.adminBase - 5"
                    r="2.2"
                  />
                </g>
              </g>
              <g v-if="bar.segments.length">
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
                :y="geom.H - 6"
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
              年省级、地级、县级、乡级、村级条数。横线表示该年没有这一级。省、地、县来自
              GB2260，乡、村来自 NBS，合计是这两格相加。
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
                    v-if="missingAdmin(year)"
                    class="ysc-flag"
                    :title="`GB2260.${year} 与 ${missingAdmin(year)!.sameAs} 字节相同，省、地、县不另画`"
                    >无省地县</abbr
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
.ysc-legend span.is-dim {
  opacity: 0.4;
}
.ysc-toggle {
  margin-left: auto;
  border: 1px solid var(--kami-border, #e6e5e0);
  background: transparent;
  color: var(--kami-near-black, #26251e);
  border-radius: 999px;
  padding: 3px 12px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.ysc-toggle[aria-pressed='true'] {
  background: var(--kami-brand, #f54e00);
  border-color: transparent;
  color: #fff;
}
.ysc-break line {
  stroke: var(--kami-stone, #807d72);
  stroke-width: 1.25;
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
