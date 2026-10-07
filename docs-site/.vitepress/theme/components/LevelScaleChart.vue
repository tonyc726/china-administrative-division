<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import KamiFigure from './KamiFigure.vue';

// 真实数据：cache.db（hydrate 2023，NBS 五级全量）
// SELECT level, count(*) FROM divisions WHERE year=2023 GROUP BY level;
interface Row {
  level: string;
  code: string;
  n: number;
}
const rows: Row[] = [
  { level: '省级', code: '省/自治区/直辖市', n: 31 },
  { level: '地级', code: '地级市/州/盟', n: 342 },
  { level: '县级', code: '县/区/县级市', n: 2975 },
  { level: '乡级', code: '乡/镇/街道', n: 41351 },
  { level: '村级', code: '村委会/居委会', n: 620572 },
];

const total = rows.reduce((s, r) => s + r.n, 0);
const max = Math.max(...rows.map((r) => r.n));
const fmt = (n: number) => n.toLocaleString('en-US');

function shareOf(n: number) {
  return n / total < 0.001 ? '<0.1%' : ((n / total) * 100).toFixed(1) + '%';
}

function tickStep(upper: number) {
  const rough = upper / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  return steps.find((step) => step >= rough) ?? steps[steps.length - 1]!;
}

const step = tickStep(max);
const ticks: number[] = [];
for (let value = 0; value <= max; value += step) ticks.push(value);

function tickLabel(value: number) {
  if (value === 0) return '0';
  if (value % 10000 === 0) return `${value / 10000}万`;
  return fmt(value);
}

// 先按文档栏的常见宽度判断；挂载后用真实轨道宽度再分一次内外标签。
const plotWidth = ref(480);
const root = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

onMounted(() => {
  const track = root.value?.querySelector<HTMLElement>('.lsc-track');
  if (!track) return;
  const apply = () => {
    plotWidth.value = track.clientWidth;
  };
  apply();
  observer = new ResizeObserver(apply);
  observer.observe(track);
});

onBeforeUnmount(() => observer?.disconnect());

function labelText(n: number) {
  return `${fmt(n)}  ${shareOf(n)}`;
}

function fitsInside(n: number, ratio: number, track: number) {
  const barPx = Math.max(2, ratio * track);
  // 0.78rem 表格数字大约 8px 宽，再留出内边距。
  const needed = labelText(n).length * 8 + 20;
  return barPx >= needed;
}

const bars = computed(() =>
  rows.map((row, index) => {
    const ratio = row.n / max;
    return {
      ...row,
      ratio,
      pct: ratio * 100,
      share: shareOf(row.n),
      text: labelText(row.n),
      inside: fitsInside(row.n, ratio, plotWidth.value),
      highlight: index === rows.length - 1,
    };
  })
);

const village = rows[rows.length - 1]!;
const caption = `横轴是线性的：条宽 = 这一级的条数 / 最多的一级。一共 ${fmt(total)} 条，村和社区 ${fmt(village.n)} 条，占 ${shareOf(village.n)}。`;
</script>

<template>
  <KamiFigure
    eyebrow="2023 年"
    title="从 31 个省级单位，到 62 万个村和社区"
    :caption="caption"
  >
    <div ref="root" class="lsc">
      <div class="lsc-grid" aria-hidden="true">
        <span
          v-for="(tick, index) in ticks"
          :key="tick"
          class="lsc-gridline"
          :class="{
            first: index === 0,
            last: index === ticks.length - 1,
          }"
          :style="{ left: (tick / max) * 100 + '%' }"
        >
          <i>{{ tickLabel(tick) }}</i>
        </span>
      </div>
      <div v-for="bar in bars" :key="bar.level" class="lsc-row">
        <div class="lsc-label">
          <span class="lsc-level">{{ bar.level }}</span>
          <span class="lsc-code">{{ bar.code }}</span>
        </div>
        <div class="lsc-track">
          <div
            class="lsc-bar"
            :class="{ hi: bar.highlight }"
            :style="{ width: `max(2px, ${bar.pct}%)` }"
          >
            <span v-if="bar.inside" class="lsc-in">
              <span class="lsc-count">{{ fmt(bar.n) }}</span>
              <span class="lsc-share">{{ bar.share }}</span>
            </span>
          </div>
          <span
            v-if="!bar.inside"
            class="lsc-out"
            :style="{ left: `max(2px, ${bar.pct}%)` }"
          >
            <span class="lsc-count">{{ fmt(bar.n) }}</span>
            <span class="lsc-share">{{ bar.share }}</span>
          </span>
        </div>
      </div>
    </div>
  </KamiFigure>
</template>

<style scoped>
.lsc {
  position: relative;
  padding-bottom: 1.15rem;
  font-variant-numeric: lining-nums tabular-nums;
}
.lsc-grid {
  position: absolute;
  left: 148px;
  right: 0;
  top: 0;
  bottom: 1.15rem;
  pointer-events: none;
}
.lsc-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px dashed var(--vp-cursor-hairline-strong, #cfcdc4);
}
.lsc-gridline i {
  position: absolute;
  bottom: -1.05rem;
  left: 0;
  transform: translateX(-50%);
  font-style: normal;
  font-size: 0.66rem;
  line-height: 1;
  color: var(--kami-stone, #807d72);
  font-family: var(--kami-mono);
  white-space: nowrap;
}
.lsc-gridline.first i {
  transform: none;
}
.lsc-gridline.last i {
  transform: translateX(-100%);
}
.lsc-row {
  display: grid;
  grid-template-columns: 148px 1fr;
  align-items: center;
  margin: 0.55rem 0;
}
.lsc-label {
  display: flex;
  flex-direction: column;
  padding-right: 12px;
}
.lsc-level {
  font-family: var(--kami-sans);
  font-weight: 600;
  font-size: 0.98rem;
  color: var(--kami-near-black, #26251e);
}
.lsc-code {
  font-size: 0.68rem;
  color: var(--kami-stone, #807d72);
  line-height: 1.2;
}
.lsc-track {
  position: relative;
  height: 26px;
}
.lsc-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 26px;
  min-width: 2px;
  background: var(--kami-olive, #5a5852);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.lsc-bar.hi {
  background: var(--kami-brand, #f54e00);
}
.lsc-in,
.lsc-out {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: lining-nums tabular-nums;
}
.lsc-in {
  padding: 0 8px;
  color: var(--kami-ivory, #ffffff);
}
.lsc-bar.hi .lsc-in {
  color: var(--kami-on-brand, #ffffff);
}
.lsc-out {
  position: absolute;
  top: 0;
  height: 26px;
  align-items: center;
  margin-left: 6px;
  padding: 0 4px;
  z-index: 1;
  color: var(--kami-near-black, #26251e);
  background: var(--kami-ivory, #ffffff);
}
.lsc-out .lsc-share {
  color: var(--kami-olive, #5a5852);
  font-weight: 500;
}
.lsc-in .lsc-share {
  font-weight: 500;
  opacity: 0.9;
}
@media (max-width: 640px) {
  .lsc-row {
    grid-template-columns: 72px 1fr;
  }
  .lsc-grid {
    left: 72px;
  }
  .lsc-code {
    display: none;
  }
  .lsc-level {
    font-size: 0.92rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lsc-bar {
    transition: none;
  }
}
</style>
