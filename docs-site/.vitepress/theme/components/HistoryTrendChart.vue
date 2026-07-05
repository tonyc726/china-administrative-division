<script setup lang="ts">
import { computed } from 'vue';
import KamiFigure from './KamiFigure.vue';

// 真实数据：source-history/data/divisions.csv 逐年聚合（GB2260 三级：省/市/县）
// 2021 仅 21 条（残缺年）故止于 2020。
const startYear = 1980;
const data = [
  3106, 3117, 3141, 3125, 3165, 3181, 3184, 3181, 3194, 3195, 3199, 3201,
  3202, 3200, 3208, 3213, 3223, 3225, 3225, 3220, 3225, 3224, 3223, 3225,
  3226, 3226, 3224, 3223, 3223, 3222, 3220, 3216, 3216, 3220, 3221, 3218,
  3219, 3219, 3218, 3213, 3209,
];

// 画布几何
const W = 720;
const H = 240;
const padL = 48;
const padR = 20;
const padT = 18;
const padB = 30;
const yMin = 3080;
const yMax = 3240;
const endYear = startYear + data.length - 1;

const xOf = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
const yOf = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB);

const pts = computed(() => data.map((v, i) => [xOf(i), yOf(v)] as const));
const linePath = computed(() => pts.value.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '));
const areaPath = computed(
  () => `M${padL} ${yOf(data[0]).toFixed(1)} ` + pts.value.slice(1).map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ` L${xOf(data.length - 1).toFixed(1)} ${H - padB} L${padL} ${H - padB} Z`
);

const yTicks = [3100, 3150, 3200];
const xTicks = [1980, 1990, 2000, 2010, 2020];

const minV = Math.min(...data);
const maxV = Math.max(...data);
const minI = data.indexOf(minV);
const maxI = data.indexOf(maxV);
const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<template>
  <KamiFigure
    eyebrow="1980–2020 · GB2260 三级 · source-history"
    title="县级行政区划总数四十年稳定在 ~3,200——变的是结构（撤县设区），不是数量"
    caption="纵轴放大到 3,080–3,240：四十年净变化 <120（<4%）。总量的平稳掩盖了底层大量「撤县设区/县改市」的结构调整——这正是需要按 (code, year) 版本化、而非只存一版全量的原因。2021 为残缺年（仅 21 条）故止于 2020。"
  >
    <div class="htc">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="GB2260 县级行政区划总数 1980 至 2020 年趋势">
        <!-- y 网格 + 刻度 -->
        <g class="htc-grid">
          <template v-for="t in yTicks" :key="t">
            <line :x1="padL" :x2="W - padR" :y1="yOf(t)" :y2="yOf(t)" />
            <text :x="padL - 8" :y="yOf(t) + 3" text-anchor="end">{{ fmt(t) }}</text>
          </template>
        </g>
        <!-- 面积 + 折线 -->
        <path :d="areaPath" class="htc-area" />
        <path :d="linePath" class="htc-line" />
        <!-- 极值点标注 -->
        <g class="htc-mark">
          <circle :cx="xOf(minI)" :cy="yOf(minV)" r="3.5" />
          <text :x="xOf(minI)" :y="yOf(minV) + 18">{{ startYear + minI }} · {{ fmt(minV) }}</text>
          <circle :cx="xOf(maxI)" :cy="yOf(maxV)" r="3.5" class="hi" />
          <text :x="xOf(maxI)" :y="yOf(maxV) - 10" text-anchor="middle">{{ startYear + maxI }} · {{ fmt(maxV) }} 峰值</text>
        </g>
        <!-- x 刻度 -->
        <g class="htc-xaxis">
          <text v-for="yr in xTicks" :key="yr" :x="xOf(yr - startYear)" :y="H - 8" text-anchor="middle">{{ yr }}</text>
        </g>
      </svg>
    </div>
  </KamiFigure>
</template>

<style scoped>
.htc {
  width: 100%;
  font-variant-numeric: lining-nums tabular-nums;
}
.htc svg {
  width: 100%;
  height: auto;
  display: block;
}
.htc-grid line {
  stroke: var(--kami-border, #e8e6dc);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.htc-grid text,
.htc-xaxis text {
  font-family: var(--kami-mono);
  font-size: 11px;
  fill: var(--kami-stone, #6b6a64);
}
.htc-area {
  fill: var(--kami-tint, #eef2f7);
  opacity: 0.9;
}
.htc-line {
  fill: none;
  stroke: var(--kami-brand, #1b365d);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.htc-mark circle {
  fill: var(--kami-olive, #504e49);
}
.htc-mark circle.hi {
  fill: var(--kami-brand, #1b365d);
}
.htc-mark text {
  font-family: var(--kami-mono);
  font-size: 10.5px;
  fill: var(--kami-olive, #504e49);
}
.dark .htc-area {
  fill: rgba(126, 163, 207, 0.14);
}
.dark .htc-line {
  stroke: #7ea3cf;
}
.dark .htc-grid line {
  stroke: #33322d;
}
.dark .htc-mark circle.hi {
  fill: #7ea3cf;
}
</style>
