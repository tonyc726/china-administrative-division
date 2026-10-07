<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import KamiFigure from './KamiFigure.vue';
import levelCounts from '../data/generated/level-counts.json';

interface RankSeries {
  level: number;
  label: string;
  short: string;
  hint: string;
  counts: number[];
}

interface CarriedYear {
  year: number;
  sameAs: number;
}

interface ChartEvent {
  year: number;
  label: string;
}

interface ChartModel {
  adminStart: number;
  adminEnd: number;
  admin: RankSeries[];
  localStart: number;
  localEnd: number;
  local: RankSeries[];
  carried: CarriedYear[];
  events: ChartEvent[];
  publishedAdmin2023: number[];
}

const chart = (levelCounts as { chart: ChartModel }).chart;

type Mode = 'admin' | 'local';

const mode = ref<Mode>('admin');
const hoverIndex = ref<number | null>(null);
const keyIndex = ref<number | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
const tipEl = ref<HTMLElement | null>(null);
const tipX = ref(0);

const fmt = (n: number) => n.toLocaleString('en-US');

const view = computed(() => {
  if (mode.value === 'local') {
    return {
      start: chart.localStart,
      end: chart.localEnd,
      series: chart.local,
    };
  }
  return {
    start: chart.adminStart,
    end: chart.adminEnd,
    series: chart.admin,
  };
});

const yearCount = computed(() => view.value.end - view.value.start + 1);

function yearAt(index: number) {
  return view.value.start + index;
}

function countsAt(index: number) {
  return view.value.series.map((series) => series.counts[index] ?? 0);
}

function totalAt(index: number) {
  return countsAt(index).reduce((sum, count) => sum + count, 0);
}

const maxTotal = computed(() =>
  Math.max(
    1,
    ...Array.from({ length: yearCount.value }, (_, index) => totalAt(index))
  )
);

function tickStep(upper: number) {
  const rough = upper / 4;
  if (!(rough > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * pow);
  return steps.find((step) => step >= rough) ?? steps[steps.length - 1]!;
}

function tickLabel(value: number) {
  if (value === 0) return '0';
  if (value >= 10000 && value % 10000 === 0) return `${value / 10000}万`;
  return fmt(value);
}

const ticks = computed(() => {
  const step = tickStep(maxTotal.value);
  const values: number[] = [];
  for (let value = 0; value <= maxTotal.value; value += step)
    values.push(value);
  return values;
});

const focusSeries = computed(() =>
  mode.value === 'local'
    ? chart.local.find((series) => series.level === 5)!
    : chart.admin.find((series) => series.level === 3)!
);

const engaged = computed(
  () => hoverIndex.value != null || keyIndex.value != null
);

const headline = computed(() => {
  const series = focusSeries.value;
  const index = hoverIndex.value ?? keyIndex.value ?? yearCount.value - 1;
  const value = series.counts[index] ?? 0;
  const year = view.value.start + index;
  const previous = index > 0 ? series.counts[index - 1] : null;
  const delta = previous == null ? null : value - previous;
  const sign = delta == null ? '' : delta > 0 ? '+' : delta < 0 ? '−' : '';
  const deltaText =
    delta == null || previous == null
      ? ''
      : `较 ${year - 1} 年 ${sign}${fmt(Math.abs(delta))}`;
  const first = series.counts[0]!;
  const last = series.counts[series.counts.length - 1]!;
  const spanDelta = last - first;
  const fromYear = view.value.start;
  const toYear = view.value.end;
  const span = toYear - fromYear;
  const verb = spanDelta === 0 ? '持平' : spanDelta > 0 ? '增加' : '减少';
  const change =
    spanDelta === 0 ? '数量持平' : `${verb} ${fmt(Math.abs(spanDelta))} 个`;
  const formatted = fmt(value);
  const glyphs = [...formatted].map((ch, glyphIndex) => ({
    ch,
    key: formatted.length - glyphIndex,
  }));
  return {
    year,
    value,
    unit: series.label,
    glyphs,
    deltaText,
    spoken: deltaText
      ? `${year} 年 · ${formatted} 个${series.label}，${deltaText}`
      : `${year} 年 · ${formatted} 个${series.label}`,
    sentence: `${series.label}从 ${fromYear} 年的 ${fmt(first)} 个到 ${toYear} 年的 ${fmt(last)} 个，${span} 年来${change}。`,
  };
});

function carriedFor(year: number) {
  if (mode.value !== 'admin') return null;
  return chart.carried.find((item) => item.year === year) ?? null;
}

const labeledYears = computed(() => {
  const start = view.value.start;
  const end = view.value.end;
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) {
    const endpoint = year === start || year === end;
    const grid = year % 5 === 0;
    if (!endpoint && !grid) continue;
    if (!endpoint && (year - start < 3 || end - year < 3)) continue;
    years.push(year);
  }
  return new Set(years);
});

const bars = computed(() =>
  Array.from({ length: yearCount.value }, (_, index) => {
    const year = yearAt(index);
    const counts = countsAt(index);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const carried = carriedFor(year);
    return {
      index,
      year,
      total,
      pct: (total / maxTotal.value) * 100,
      showLabel: labeledYears.value.has(year),
      carried,
      segments: view.value.series.map((series, levelIndex) => ({
        level: series.level,
        short: series.short,
        label: series.label,
        count: counts[levelIndex]!,
      })),
    };
  })
);

const defaultIndex = computed(() => yearCount.value - 1);
const activeIndex = computed(
  () => hoverIndex.value ?? keyIndex.value ?? defaultIndex.value
);
const activeBar = computed(
  () => bars.value[activeIndex.value] ?? bars.value[0]!
);

const activeDelta = computed(() => {
  const index = activeBar.value.index;
  if (index <= 0) return null;
  return activeBar.value.total - (bars.value[index - 1]?.total ?? 0);
});

const events = computed(() => {
  if (mode.value !== 'admin') return [];
  return chart.events.map((event) => {
    const index = event.year - view.value.start;
    return {
      ...event,
      left: ((index + 0.5) / yearCount.value) * 100,
    };
  });
});

const footnote = computed(() => {
  const carried = chart.carried
    .map((item) => `${item.year} 沿用 ${item.sameAs}`)
    .join('，');
  const gbCounty = chart.admin
    .find((series) => series.level === 3)!
    .counts.at(-1)!;
  const published = chart.publishedAdmin2023[2];
  return `GB2260 · ${chart.adminStart}–${chart.adminEnd}（${carried}）。乡、村 NBS · ${chart.localStart}–${chart.localEnd}，${chart.localEnd} 年用已发布 CSV。${chart.adminEnd} 年县级 GB2260 ${fmt(gbCounty)}，五级 CSV ${fmt(published)}，未并入省地县这根轴。`;
});

const readout = computed(() => {
  const bar = activeBar.value;
  const parts = bar.segments.map(
    (segment) => `${segment.label} ${fmt(segment.count)}`
  );
  const delta = activeDelta.value;
  const deltaText =
    delta == null
      ? ''
      : `，较 ${bar.year - 1} 年 ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt(Math.abs(delta))}`;
  const note = bar.carried ? `，当年无变更，沿用 ${bar.carried.sameAs}` : '';
  return `${bar.year} 年，${parts.join('，')}，合计 ${fmt(bar.total)}${deltaText}${note}`;
});

function placeTip() {
  const stage = stageEl.value;
  const scroll = scrollEl.value;
  if (!stage || !scroll) return;
  const column =
    scroll.querySelectorAll<HTMLElement>('.col')[activeIndex.value];
  if (!column) return;
  const stageBox = stage.getBoundingClientRect();
  const columnBox = column.getBoundingClientRect();
  const card = tipEl.value?.offsetWidth ?? 196;
  const center = columnBox.left + columnBox.width / 2 - stageBox.left;
  const raw = center - card / 2;
  tipX.value = Math.min(
    Math.max(raw, 4),
    Math.max(4, stageBox.width - card - 4)
  );
}

function reveal(index: number) {
  const host = scrollEl.value;
  const column = host?.querySelectorAll<HTMLElement>('.col')[index];
  if (!host || !column) return;
  const left = column.offsetLeft;
  const right = left + column.offsetWidth;
  const viewLeft = host.scrollLeft;
  const viewRight = viewLeft + host.clientWidth;
  if (left < viewLeft + 12 || right > viewRight - 12) {
    host.scrollLeft = left - host.clientWidth / 2 + column.offsetWidth / 2;
  }
}

let touchStart: { x: number; y: number; index: number } | null = null;

function indexFromPointer(event: PointerEvent) {
  const host = scrollEl.value;
  if (!host) return null;
  const columns = host.querySelectorAll<HTMLElement>('.col');
  if (!columns.length) return null;
  const box = host.getBoundingClientRect();
  const x = event.clientX - box.left + host.scrollLeft;
  const width = host.scrollWidth;
  if (width <= 0) return null;
  return Math.min(
    columns.length - 1,
    Math.max(0, Math.floor((x / width) * columns.length))
  );
}

function setFromPointer(event: PointerEvent) {
  const index = indexFromPointer(event);
  if (index == null) return;
  hoverIndex.value = index;
  keyIndex.value = null;
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch') {
    setFromPointer(event);
    return;
  }
  const index = indexFromPointer(event);
  if (index == null) return;
  touchStart = { x: event.clientX, y: event.clientY, index };
  try {
    scrollEl.value?.setPointerCapture(event.pointerId);
  } catch {
    /* 非可信指针或浏览器不支持时，点选仍靠 pointerup 完成。 */
  }
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  setFromPointer(event);
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !touchStart) return;
  const dx = Math.abs(event.clientX - touchStart.x);
  const dy = Math.abs(event.clientY - touchStart.y);
  if (dx <= 12 && dy <= 12) {
    keyIndex.value = indexFromPointer(event) ?? touchStart.index;
    hoverIndex.value = null;
  }
  touchStart = null;
}

function onPointerCancel() {
  touchStart = null;
}

function onPointerLeave() {
  hoverIndex.value = null;
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
  const current = keyIndex.value ?? hoverIndex.value ?? defaultIndex.value;
  const next =
    key === 'ArrowRight'
      ? Math.min(yearCount.value - 1, current + 1)
      : key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : key === 'Home'
          ? 0
          : yearCount.value - 1;
  keyIndex.value = next;
  hoverIndex.value = null;
  reveal(next);
}

function selectMode(next: Mode) {
  if (mode.value === next) return;
  const wasEngaged = engaged.value;
  const year = activeBar.value.year;
  mode.value = next;
  hoverIndex.value = null;
  if (!wasEngaged) {
    keyIndex.value = null;
    return;
  }
  const start = next === 'local' ? chart.localStart : chart.adminStart;
  const end = next === 'local' ? chart.localEnd : chart.adminEnd;
  const clamped = Math.min(end, Math.max(start, year));
  keyIndex.value = clamped - start;
}

const tableRows = computed(() => {
  const rows = [];
  for (let year = chart.adminStart; year <= chart.adminEnd; year += 1) {
    const adminIndex = year - chart.adminStart;
    const localIndex = year - chart.localStart;
    const admin = chart.admin.map((series) => series.counts[adminIndex]!);
    const inLocal = year >= chart.localStart && year <= chart.localEnd;
    const local = inLocal
      ? chart.local.map((series) => series.counts[localIndex]!)
      : [null, null];
    const carried = chart.carried.find((item) => item.year === year) ?? null;
    rows.push({
      year,
      admin,
      adminTotal: admin.reduce((sum, count) => sum + count, 0),
      local,
      localTotal: inLocal
        ? local.reduce((sum, count) => sum + (count ?? 0), 0)
        : null,
      carried,
    });
  }
  return rows;
});

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  const stage = stageEl.value;
  if (!stage) return;
  const apply = () => {
    reveal(activeIndex.value);
    placeTip();
  };
  apply();
  resizeObserver = new ResizeObserver(apply);
  resizeObserver.observe(stage);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

watch([activeIndex, mode, () => yearCount.value], () => {
  requestAnimationFrame(() => {
    reveal(activeIndex.value);
    placeTip();
  });
});
</script>

<template>
  <KamiFigure>
    <template #header>
      <div class="ysc-head">
        <div class="ysc-lead">
          <p class="ysc-kicker">
            {{
              mode === 'local'
                ? `${chart.localStart}–${chart.localEnd}`
                : `${chart.adminStart}–${chart.adminEnd}`
            }}
            · {{ headline.unit }}
          </p>
          <p class="ysc-num">
            <span class="sr-only">{{ headline.spoken }}</span>
            <span class="ysc-num-visual" aria-hidden="true">
              <span class="ysc-year">{{ headline.year }} 年</span>
              <span class="ysc-sep">·</span>
              <span class="ysc-roll">
                <span
                  v-for="glyph in headline.glyphs"
                  :key="glyph.key"
                  class="reel"
                  :class="{ mark: glyph.ch === ',' }"
                >
                  <span v-if="glyph.ch === ','" class="reel-mark">,</span>
                  <span
                    v-else
                    class="reel-strip"
                    :style="{
                      transform: `translate3d(0, calc(${glyph.ch} * -1em), 0)`,
                    }"
                  >
                    <span v-for="digit in 10" :key="digit">{{
                      digit - 1
                    }}</span>
                  </span>
                </span>
              </span>
              <span class="ysc-unit">个{{ headline.unit }}</span>
            </span>
          </p>
          <p class="ysc-delta" :class="{ 'is-empty': !headline.deltaText }">
            <template v-if="headline.deltaText">{{
              headline.deltaText
            }}</template>
          </p>
          <p v-if="!engaged" class="ysc-insight">{{ headline.sentence }}</p>
        </div>
        <div class="ysc-switch" role="tablist" aria-label="切换统计口径">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'admin'"
            @click="selectMode('admin')"
          >
            省·地·县
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'local'"
            @click="selectMode('local')"
          >
            乡·村 (2009–2023)
          </button>
        </div>
      </div>
    </template>

    <div class="ysc">
      <div class="ysc-legend">
        <span v-for="series in view.series" :key="series.level">
          <i class="swatch" :data-level="series.level" />{{ series.label }}
        </span>
      </div>

      <div ref="stageEl" class="ysc-stage">
        <div class="ysc-tip-lane">
          <div
            ref="tipEl"
            class="ysc-tip"
            :style="{ transform: `translateX(${tipX}px)` }"
          >
            <div class="ysc-tip-top">
              <p class="ysc-tip-year">{{ activeBar.year }}</p>
              <p v-if="activeDelta != null" class="ysc-tip-delta">
                较 {{ activeBar.year - 1 }}
                <b
                  >{{ activeDelta > 0 ? '+' : activeDelta < 0 ? '−' : ''
                  }}{{ fmt(Math.abs(activeDelta)) }}</b
                >
              </p>
            </div>
            <p v-if="activeBar.carried" class="ysc-tip-note">
              当年无变更，沿用 {{ activeBar.carried.sameAs }}
            </p>
            <p
              v-for="segment in activeBar.segments"
              :key="segment.level"
              class="ysc-tip-row"
            >
              <i class="swatch" :data-level="segment.level" />
              <span>{{ segment.short }}</span>
              <b>{{ fmt(segment.count) }}</b>
            </p>
            <p class="ysc-tip-row total">
              <span>合计</span>
              <b>{{ fmt(activeBar.total) }}</b>
            </p>
          </div>
        </div>

        <p class="sr-only" aria-live="polite">{{ readout }}</p>

        <div class="ysc-body">
          <div
            class="ysc-y"
            :class="{ 'has-anno': events.length > 0 }"
            aria-hidden="true"
          >
            <span
              v-for="tick in ticks"
              :key="tick"
              :style="{ bottom: `${(tick / maxTotal) * 100}%` }"
              >{{ tickLabel(tick) }}</span
            >
          </div>
          <div
            ref="scrollEl"
            class="ysc-scroll"
            tabindex="0"
            role="group"
            :aria-label="`${view.start} 到 ${view.end} 年条数，左右方向键切换年份`"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerCancel"
            @pointerleave="onPointerLeave"
            @scroll="placeTip"
            @keydown="onKey"
          >
            <div class="ysc-plot" :style="{ minWidth: `${yearCount * 14}px` }">
              <div v-if="events.length" class="ysc-annos" aria-hidden="true">
                <div
                  v-for="event in events"
                  :key="event.year"
                  class="ysc-anno"
                  :style="{ left: `${event.left}%` }"
                >
                  <span>{{ event.label }}</span>
                </div>
              </div>
              <div class="ysc-bars">
                <i
                  v-for="tick in ticks"
                  :key="`g-${tick}`"
                  class="ysc-grid"
                  :class="{ zero: tick === 0 }"
                  :style="{ bottom: `${(tick / maxTotal) * 100}%` }"
                />
                <div
                  v-for="bar in bars"
                  :key="bar.year"
                  class="col"
                  :class="{ 'is-hot': bar.index === activeIndex }"
                >
                  <div class="stack" :style="{ height: `${bar.pct}%` }">
                    <i
                      v-for="segment in bar.segments"
                      :key="segment.level"
                      class="seg"
                      :data-level="segment.level"
                      :style="{ flexGrow: segment.count }"
                    />
                  </div>
                </div>
              </div>
              <div class="ysc-x" aria-hidden="true">
                <span v-for="bar in bars" :key="bar.year">{{
                  bar.showLabel ? bar.year : ''
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p class="ysc-source">{{ footnote }}</p>

      <details class="ysc-details">
        <summary>按年份查看条数</summary>
        <div class="ysc-table-wrap">
          <table>
            <caption class="sr-only">
              {{
                chart.adminStart
              }}
              到
              {{
                chart.adminEnd
              }}
              年省级、地级、县级来自 GB2260。 乡级、村级从
              {{
                chart.localStart
              }}
              年起，来自 NBS。2008 年沿用 2007，2022 年沿用 2021。
            </caption>
            <thead>
              <tr>
                <th scope="col">年</th>
                <th scope="col">省</th>
                <th scope="col">地</th>
                <th scope="col">县</th>
                <th scope="col">省地县</th>
                <th scope="col">乡</th>
                <th scope="col">村</th>
                <th scope="col">乡村</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.year">
                <th scope="row">
                  {{ row.year }}
                  <abbr
                    v-if="row.carried"
                    class="ysc-flag"
                    :title="`当年无变更，沿用 ${row.carried.sameAs}`"
                    >沿用</abbr
                  >
                </th>
                <td>{{ fmt(row.admin[0]!) }}</td>
                <td>{{ fmt(row.admin[1]!) }}</td>
                <td>{{ fmt(row.admin[2]!) }}</td>
                <td>{{ fmt(row.adminTotal) }}</td>
                <td>{{ row.local[0] == null ? '—' : fmt(row.local[0]) }}</td>
                <td>{{ row.local[1] == null ? '—' : fmt(row.local[1]) }}</td>
                <td>
                  {{ row.localTotal == null ? '—' : fmt(row.localTotal) }}
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
.ysc-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 1.15rem;
}
.ysc-kicker {
  margin: 0 0 6px;
  font-family: var(--kami-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--kami-stone, #807d72);
}
.ysc-num {
  margin: 0;
  font-family: var(--kami-sans);
  font-size: clamp(2.15rem, 4.4vw, 3.05rem);
  font-weight: 600;
  letter-spacing: -0.045em;
  line-height: 1;
  color: var(--kami-near-black, #26251e);
  font-variant-numeric: lining-nums tabular-nums;
}
.ysc-num-visual {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.22em 0.28em;
  max-width: 100%;
}
.ysc-year,
.ysc-sep,
.ysc-unit {
  font-size: 0.46em;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.2;
  color: var(--kami-olive, #5a5852);
}
.ysc-roll {
  display: inline-flex;
  align-items: flex-end;
  height: 1em;
  font-variant-ligatures: none;
  font-feature-settings:
    'liga' 0,
    'calt' 0;
}
.reel {
  height: 1em;
  line-height: 1;
  overflow: hidden;
  overflow: clip;
  flex: none;
  contain: paint;
}
.reel:not(.mark) {
  width: 1ch;
}
.reel-strip {
  display: flex;
  flex-direction: column;
  width: 1ch;
  transition: transform 0.62s cubic-bezier(0.22, 1, 0.36, 1);
}
.reel-strip span,
.reel-mark {
  display: grid;
  place-items: center;
  height: 1em;
  min-height: 1em;
  line-height: 1;
  flex: 0 0 1em;
  font-variant-ligatures: none;
}
.reel-mark {
  width: 0.35em;
}
.ysc-delta {
  min-height: 1.2em;
  margin: 8px 0 0;
  font-family: var(--kami-mono);
  font-size: 12px;
  line-height: 1.2;
  color: var(--kami-stone, #807d72);
}
.ysc-delta.is-empty {
  visibility: hidden;
}
.ysc-insight {
  margin: 8px 0 0;
  max-width: 38rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--kami-olive, #5a5852);
}
.ysc-switch {
  display: inline-flex;
  flex: none;
  padding: 3px;
  border-radius: 999px;
  background: var(--vp-cursor-hairline-soft, #efeee8);
  gap: 2px;
}
.ysc-switch button {
  border: 0;
  background: transparent;
  color: var(--kami-olive, #5a5852);
  border-radius: 999px;
  padding: 7px 12px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
}
.ysc-switch button[aria-selected='true'] {
  background: #fff;
  color: var(--kami-near-black, #26251e);
  box-shadow: 0 1px 2px rgba(38, 37, 30, 0.08);
}
.ysc-switch button:focus-visible {
  outline: 2px solid var(--kami-brand, #f54e00);
  outline-offset: 2px;
}
.ysc {
  --ink-1: rgba(38, 37, 30, 0.2);
  --ink-2: rgba(38, 37, 30, 0.42);
  --ink-3: rgba(38, 37, 30, 0.82);
  --ink-4: rgba(38, 37, 30, 0.28);
  --ink-5: rgba(38, 37, 30, 0.82);
  --hot-1: rgba(245, 78, 0, 0.38);
  --hot-2: rgba(245, 78, 0, 0.66);
  --hot-3: #f54e00;
  --hot-4: rgba(245, 78, 0, 0.42);
  --hot-5: #f54e00;
  font-variant-numeric: lining-nums tabular-nums;
}
:global(html.dark) .ysc {
  --ink-1: rgba(247, 247, 244, 0.22);
  --ink-2: rgba(247, 247, 244, 0.42);
  --ink-3: rgba(247, 247, 244, 0.82);
  --ink-4: rgba(247, 247, 244, 0.3);
  --ink-5: rgba(247, 247, 244, 0.82);
  --hot-1: rgba(255, 107, 44, 0.42);
  --hot-2: rgba(255, 107, 44, 0.7);
  --hot-3: #ff6b2c;
  --hot-4: rgba(255, 107, 44, 0.45);
  --hot-5: #ff6b2c;
}
:global(html.dark) .ysc-switch button[aria-selected='true'] {
  background: var(--vp-cursor-ink, #f7f7f4);
  color: #1a1914;
}
.ysc-legend {
  display: flex;
  gap: 14px;
  margin: 0 0 8px;
  color: var(--kami-stone, #807d72);
  font-size: 0.75rem;
}
.ysc-legend span,
.ysc-tip-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--ink-3);
  flex: none;
}
.swatch[data-level='1'] {
  background: var(--ink-1);
}
.swatch[data-level='2'] {
  background: var(--ink-2);
}
.swatch[data-level='3'] {
  background: var(--ink-3);
}
.swatch[data-level='4'] {
  background: var(--ink-4);
}
.swatch[data-level='5'] {
  background: var(--ink-5);
}
.ysc-stage {
  position: relative;
}
.ysc-tip-lane {
  position: relative;
  height: 148px;
}
.ysc-tip {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: max-content;
  max-width: min(280px, calc(100% - 8px));
  padding: 8px 10px 7px;
  border: 1px solid var(--kami-border, #e6e5e0);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(38, 37, 30, 0.07);
  pointer-events: none;
}
:global(html.dark) .ysc-tip {
  background: rgba(38, 37, 30, 0.94);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}
.ysc-tip-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ysc-tip-year,
.ysc-tip-delta,
.ysc-tip-note,
.ysc-tip-row {
  margin: 0;
}
.ysc-tip-year {
  font-family: var(--kami-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.ysc-tip-delta {
  font-family: var(--kami-mono);
  font-size: 10px;
  color: var(--kami-stone, #807d72);
}
.ysc-tip-delta b {
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.ysc-tip-note {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--kami-olive, #5a5852);
}
.ysc-tip-row {
  display: flex;
  margin-top: 3px;
  font-family: var(--kami-mono);
  font-size: 11px;
  color: var(--kami-olive, #5a5852);
}
.ysc-tip-row b {
  margin-left: auto;
  font-weight: 600;
  color: var(--kami-near-black, #26251e);
}
.ysc-tip-row.total {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid var(--kami-border-soft, #efeee8);
}
.ysc-body {
  display: flex;
  align-items: stretch;
}
.ysc-y {
  position: relative;
  width: 46px;
  flex: none;
  height: 228px;
  margin-top: 0;
}
.ysc-y.has-anno {
  margin-top: 26px;
}
.ysc-y span {
  position: absolute;
  right: 8px;
  transform: translateY(50%);
  font-family: var(--kami-mono);
  font-size: 10px;
  line-height: 1;
  color: var(--kami-stone, #807d72);
}
.ysc-scroll {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  outline: none;
  cursor: crosshair;
  touch-action: pan-x pan-y;
}
.ysc-scroll:focus-visible {
  outline: 2px solid var(--kami-brand, #f54e00);
  outline-offset: 4px;
  border-radius: 6px;
}
.ysc-plot {
  position: relative;
}
.ysc-annos {
  position: relative;
  height: 26px;
}
.ysc-anno {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--kami-olive, #5a5852);
  white-space: nowrap;
  pointer-events: none;
}
.ysc-anno::after {
  content: '';
  display: block;
  width: 1px;
  height: 8px;
  margin: 3px auto 0;
  background: var(--kami-border, #e6e5e0);
}
.ysc-bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 228px;
}
.ysc-grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--kami-border-soft, #efeee8);
  pointer-events: none;
}
.ysc-grid.zero {
  background: var(--kami-border, #e6e5e0);
}
.col {
  position: relative;
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  min-width: 0;
  opacity: 0.72;
  transition: opacity 180ms ease;
}
.col.is-hot {
  opacity: 1;
  z-index: 1;
}
.col.is-hot::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: color-mix(in srgb, var(--hot-3) 28%, transparent);
  pointer-events: none;
}
.stack {
  display: flex;
  flex-direction: column-reverse;
  width: 7px;
  border-radius: 3px 3px 0 0;
  overflow: hidden;
  transition: height 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.seg {
  display: block;
  flex-basis: 0;
  min-height: 0;
  width: 100%;
}
.seg[data-level='1'] {
  background: var(--ink-1);
}
.seg[data-level='2'] {
  background: var(--ink-2);
}
.seg[data-level='3'] {
  background: var(--ink-3);
}
.seg[data-level='4'] {
  background: var(--ink-4);
}
.seg[data-level='5'] {
  background: var(--ink-5);
}
.col.is-hot .seg[data-level='1'] {
  background: var(--hot-1);
}
.col.is-hot .seg[data-level='2'] {
  background: var(--hot-2);
}
.col.is-hot .seg[data-level='3'] {
  background: var(--hot-3);
}
.col.is-hot .seg[data-level='4'] {
  background: var(--hot-4);
}
.col.is-hot .seg[data-level='5'] {
  background: var(--hot-5);
}
.ysc-x {
  display: flex;
  height: 22px;
  margin-top: 6px;
}
.ysc-x span {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-family: var(--kami-mono);
  font-size: 10px;
  line-height: 22px;
  color: var(--kami-stone, #807d72);
}
.ysc-source {
  margin: 12px 0 0;
  font-family: var(--kami-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--kami-stone, #807d72);
}
.ysc-details {
  margin-top: 14px;
}
.ysc-details summary {
  cursor: pointer;
  font-size: 0.8rem;
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
  font-family: var(--kami-mono);
  font-size: 11px;
}
.ysc-details th,
.ysc-details td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--kami-border-soft, #efeee8);
  text-align: right;
  white-space: nowrap;
  font-weight: 500;
  color: var(--kami-olive, #5a5852);
}
.ysc-details th:first-child,
.ysc-details tbody th {
  text-align: left;
  color: var(--kami-near-black, #26251e);
}
.ysc-flag {
  margin-left: 4px;
  font-family: var(--kami-sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  text-decoration: none;
  color: var(--kami-stone, #807d72);
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
@media (prefers-reduced-motion: reduce) {
  .stack,
  .col,
  .reel-strip {
    transition: none;
  }
}
@media (max-width: 720px) {
  .ysc-head {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .ysc-switch {
    width: 100%;
  }
  .ysc-switch button {
    flex: 1;
  }
  .ysc-tip-lane {
    height: 168px;
  }
}
</style>
