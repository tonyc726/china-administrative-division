<script setup lang="ts">
import { ref, computed, shallowRef } from 'vue';

// 真实数据：source-history/data/divisions.csv 逐年 × 逐级聚合（GB2260 三级）
// awk -F, '{c[$5"|"$3]++} END{...}' —— 1980–2020（2021 仅 21 条残缺，剔除）
const startYear = 1980;
const series = [
  {
    key: 'l3',
    label: '县级',
    sub: '县 / 区 / 县级市',
    data: [2761, 2772, 2793, 2775, 2813, 2825, 2831, 2826, 2830, 2829, 2833, 2833, 2833, 2835, 2845, 2849, 2858, 2862, 2863, 2858, 2861, 2861, 2860, 2861, 2862, 2862, 2860, 2859, 2859, 2858, 2856, 2853, 2852, 2853, 2854, 2850, 2851, 2851, 2851, 2846, 2842],
  },
  {
    key: 'l2',
    label: '地级',
    sub: '地级市 / 州 / 盟',
    data: [316, 316, 319, 321, 323, 327, 324, 326, 334, 336, 336, 338, 339, 335, 333, 334, 335, 332, 331, 331, 333, 332, 332, 333, 333, 333, 333, 333, 333, 333, 333, 332, 333, 333, 333, 334, 334, 334, 333, 333, 333],
  },
  {
    key: 'l1',
    label: '省级',
    sub: '省 / 自治区 / 直辖市',
    data: [29, 29, 29, 29, 29, 29, 29, 29, 30, 30, 30, 30, 30, 30, 30, 30, 30, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 34, 34, 34, 34, 34, 34, 34, 34],
  },
] as const;

// 仅收录铁板钉钉的省级里程碑（不臆测 2013 口径变化）
const events: Record<string, { year: number; label: string }[]> = {
  l1: [
    { year: 1988, label: '海南设省' },
    { year: 1997, label: '重庆直辖' },
  ],
};

const sel = ref<'l1' | 'l2' | 'l3'>('l3');
const cur = computed(() => series.find((s) => s.key === sel.value)!);
const n = cur.value.data.length;
const endYear = startYear + n - 1;

// 画布几何
const W = 760;
const H = 300;
const padL = 52;
const padR = 22;
const padT = 22;
const padB = 40;

const yDomain = computed(() => {
  const d = cur.value.data;
  const lo = Math.min(...d);
  const hi = Math.max(...d);
  const pad = Math.max(2, Math.round((hi - lo) * 0.35));
  return [lo - pad, hi + pad];
});
const xOf = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
const yOf = (v: number) => {
  const [lo, hi] = yDomain.value;
  return padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
};

const pts = computed(() => cur.value.data.map((v, i) => [xOf(i), yOf(v)] as const));
const linePath = computed(() => pts.value.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '));
const areaPath = computed(() => `M${padL} ${(H - padB).toFixed(1)} ` + pts.value.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ` L${(W - padR).toFixed(1)} ${H - padB} Z`);

const yTicks = computed(() => {
  const [lo, hi] = yDomain.value;
  const step = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t < hi; t += step) ticks.push(t);
  return ticks;
});
const xTicks = computed(() => {
  const arr: number[] = [];
  for (let y = 1980; y <= endYear; y += 10) arr.push(y);
  if (!arr.includes(endYear)) arr.push(endYear);
  return arr;
});

// —— 交互 ——
const svgEl = shallowRef<SVGSVGElement | null>(null);
const hoverI = ref<number | null>(null);
const activeI = computed(() => hoverI.value ?? n - 1); // 无悬停时读数落在最新年

function onMove(e: PointerEvent) {
  const svg = svgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * W;
  const ratio = (px - padL) / (W - padL - padR);
  const i = Math.round(ratio * (n - 1));
  hoverI.value = Math.min(n - 1, Math.max(0, i));
}
function onLeave() {
  hoverI.value = null;
}

const readout = computed(() => {
  const d = cur.value.data;
  const i = activeI.value;
  const v = d[i];
  const dPrev = i > 0 ? v - d[i - 1] : 0;
  const dBase = v - d[0];
  return { year: startYear + i, v, dPrev, dBase, isHover: hoverI.value !== null };
});
const curEvents = computed(() => events[sel.value] ?? []);
const fmt = (n: number) => n.toLocaleString('en-US');
const sign = (x: number) => (x > 0 ? '+' + x : x < 0 ? '' + x : '±0');
// tooltip 位置（百分比 + 边缘翻转）
const tip = computed(() => {
  if (hoverI.value === null) return null;
  const i = hoverI.value;
  return { leftPct: (xOf(i) / W) * 100, flip: i > n * 0.62, ...readout.value };
});
</script>

<template>
  <figure class="he">
    <div class="he-head">
      <div>
        <div class="he-eyebrow">1980–2020 · GB2260 三级 · SOURCE-HISTORY</div>
        <div class="he-title">四十年里，省级靠数次重大调整跳变，县级缓慢积累又回落——把任一级拖过时间轴，看它逐年怎么变</div>
      </div>
      <div class="he-tabs" role="tablist">
        <button
          v-for="s in series"
          :key="s.key"
          role="tab"
          :aria-selected="sel === s.key"
          :class="{ on: sel === s.key }"
          @click="sel = s.key"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- 读数条 -->
    <div class="he-readout">
      <div class="he-year">
        {{ readout.year }}<span v-if="!readout.isHover" class="he-hint">（悬停/拖动查看某年）</span>
      </div>
      <div class="he-stat">
        <span class="he-n">{{ fmt(readout.v) }}</span><span class="he-unit">个{{ cur.label }}</span>
      </div>
      <div class="he-deltas">
        <span class="he-d" :class="{ up: readout.dPrev > 0, down: readout.dPrev < 0 }">较上年 {{ sign(readout.dPrev) }}</span>
        <span class="he-d" :class="{ up: readout.dBase > 0, down: readout.dBase < 0 }">较 1980 {{ sign(readout.dBase) }}</span>
      </div>
    </div>

    <div class="he-canvas">
      <svg ref="svgEl" :viewBox="`0 0 ${W} ${H}`" @pointermove="onMove" @pointerleave="onLeave"
        @pointerdown="onMove" role="img" :aria-label="`${cur.label}行政区划数量 ${startYear} 至 ${endYear} 年逐年变化`">
        <!-- y 网格 -->
        <g class="he-grid">
          <template v-for="t in yTicks" :key="t">
            <line :x1="padL" :x2="W - padR" :y1="yOf(t)" :y2="yOf(t)" />
            <text :x="padL - 8" :y="yOf(t) + 3" text-anchor="end">{{ fmt(t) }}</text>
          </template>
        </g>
        <!-- 面积 + 折线 -->
        <path :d="areaPath" class="he-area" />
        <path :d="linePath" class="he-line" />
        <!-- 事件标记 -->
        <g v-for="ev in curEvents" :key="ev.year" class="he-event">
          <line :x1="xOf(ev.year - startYear)" :x2="xOf(ev.year - startYear)" :y1="padT" :y2="H - padB" />
          <text :x="xOf(ev.year - startYear)" :y="padT - 6" text-anchor="middle">{{ ev.year }} {{ ev.label }}</text>
        </g>
        <!-- 悬停游标 -->
        <g v-if="hoverI !== null" class="he-cursor">
          <line :x1="xOf(hoverI)" :x2="xOf(hoverI)" :y1="padT" :y2="H - padB" />
          <circle :cx="xOf(hoverI)" :cy="yOf(cur.data[hoverI])" r="4.5" />
        </g>
        <!-- x 刻度 -->
        <g class="he-xaxis">
          <text v-for="yr in xTicks" :key="yr" :x="xOf(yr - startYear)" :y="H - 10" text-anchor="middle">{{ yr }}</text>
        </g>
      </svg>
      <!-- 浮动 tooltip -->
      <div v-if="tip" class="he-tip" :class="{ flip: tip.flip }" :style="{ left: tip.leftPct + '%' }">
        <b>{{ tip.year }}</b> · {{ fmt(tip.v) }} 个
        <i :class="{ up: tip.dPrev > 0, down: tip.dPrev < 0 }">{{ sign(tip.dPrev) }}</i>
      </div>
    </div>

    <figcaption class="he-cap">
      纵轴按当前级别自适应缩放，放大呈现真实波动。<b>省级</b>的每次跳变都对应重大行政调整（海南建省、重庆直辖等），<b>县级</b>四十年净增不足 100 却持续「撤县设区」——总量平稳掩盖结构剧变，正是须按 (code, year) 逐年留存的理由。数据源 source-history。
    </figcaption>
  </figure>
</template>

<style scoped>
.he {
  margin: 2rem 0;
  padding: 1.4rem 1.5rem 1.2rem;
  background: var(--kami-ivory, #faf9f5);
  border: 1px solid var(--kami-border, #e8e6dc);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(60, 56, 44, 0.06);
  font-variant-numeric: lining-nums tabular-nums;
}
.he-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.he-eyebrow {
  font-family: var(--kami-sans);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--kami-stone, #6b6a64);
  margin-bottom: 0.4rem;
}
.he-title {
  font-family: var(--kami-serif);
  font-weight: 500;
  font-size: 1.08rem;
  line-height: 1.4;
  color: var(--kami-near-black, #141413);
  max-width: 40em;
}
.he-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: var(--kami-parchment-2, #efeee6);
  border-radius: 8px;
  flex-shrink: 0;
}
.he-tabs button {
  font-family: var(--kami-sans);
  font-size: 0.86rem;
  font-weight: 500;
  padding: 5px 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--kami-olive, #504e49);
  cursor: pointer;
  transition: all 0.18s ease;
}
.he-tabs button.on {
  background: var(--kami-brand, #1b365d);
  color: #faf9f5;
}
.he-readout {
  display: flex;
  align-items: baseline;
  gap: 1.2rem;
  flex-wrap: wrap;
  margin: 1rem 0 0.4rem;
  padding-bottom: 0.6rem;
}
.he-year {
  font-family: var(--kami-mono);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--kami-brand, #1b365d);
}
.he-hint {
  font-family: var(--kami-sans);
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--kami-stone, #6b6a64);
  margin-left: 0.4rem;
}
.he-n {
  font-family: var(--kami-serif);
  font-size: 1.9rem;
  font-weight: 500;
  color: var(--kami-near-black, #141413);
}
.he-unit {
  font-size: 0.86rem;
  color: var(--kami-olive, #504e49);
  margin-left: 0.3rem;
}
.he-deltas {
  display: inline-flex;
  gap: 0.6rem;
}
.he-d {
  font-family: var(--kami-mono);
  font-size: 0.78rem;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--kami-parchment-2, #efeee6);
  color: var(--kami-stone, #6b6a64);
}
.he-d.up {
  background: var(--kami-tag, #e4ecf5);
  color: var(--kami-brand, #1b365d);
}
.he-d.down {
  background: var(--kami-breaking-bg, #f0e0d8);
  color: var(--kami-breaking-fg, #8b4513);
}
.he-canvas {
  position: relative;
}
.he svg {
  width: 100%;
  height: auto;
  display: block;
  touch-action: none;
  cursor: crosshair;
}
.he-grid line {
  stroke: var(--kami-border, #e8e6dc);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.he-grid text,
.he-xaxis text {
  font-family: var(--kami-mono);
  font-size: 11px;
  fill: var(--kami-stone, #6b6a64);
}
.he-area {
  fill: var(--kami-tint, #eef2f7);
  opacity: 0.85;
}
.he-line {
  fill: none;
  stroke: var(--kami-brand, #1b365d);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: none;
}
.he-event line {
  stroke: var(--kami-stone, #6b6a64);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  opacity: 0.6;
}
.he-event text {
  font-family: var(--kami-sans);
  font-size: 10px;
  fill: var(--kami-olive, #504e49);
}
.he-cursor line {
  stroke: var(--kami-brand, #1b365d);
  stroke-width: 1;
  opacity: 0.4;
}
.he-cursor circle {
  fill: var(--kami-brand, #1b365d);
  stroke: var(--kami-ivory, #faf9f5);
  stroke-width: 2;
}
.he-tip {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  background: var(--kami-near-black, #141413);
  color: #faf9f5;
  font-size: 0.76rem;
  padding: 4px 9px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  font-variant-numeric: lining-nums tabular-nums;
}
.he-tip.flip {
  transform: translateX(-90%);
}
.he-tip b {
  font-family: var(--kami-mono);
}
.he-tip i {
  font-style: normal;
  margin-left: 4px;
  opacity: 0.85;
}
.he-tip i.up {
  color: #9bd0a0;
}
.he-tip i.down {
  color: #e0a878;
}
.he-cap {
  margin-top: 1rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--kami-border-soft, #e5e3d8);
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--kami-olive, #504e49);
}
.he-cap b {
  color: var(--kami-brand, #1b365d);
  font-weight: 600;
}

.dark .he {
  background: #201f1d;
  border-color: #3a3931;
}
.dark .he-title,
.dark .he-n {
  color: #f2f0e8;
}
.dark .he-tabs {
  background: #141413;
}
.dark .he-tabs button.on {
  background: #4a6c96;
}
.dark .he-area {
  fill: rgba(126, 163, 207, 0.14);
}
.dark .he-line,
.dark .he-cursor line,
.dark .he-cursor circle {
  stroke: #7ea3cf;
}
.dark .he-cursor circle {
  fill: #7ea3cf;
  stroke: #201f1d;
}
.dark .he-grid line {
  stroke: #33322d;
}
.dark .he-d.up {
  background: rgba(126, 163, 207, 0.18);
  color: #9bbbde;
}

@media (max-width: 640px) {
  .he-head {
    flex-direction: column;
  }
  .he-title {
    font-size: 1rem;
  }
}
</style>
