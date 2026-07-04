<script setup lang="ts">
import { computed } from 'vue';
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
const maxLog = Math.log10(Math.max(...rows.map((r) => r.n)));
const bars = computed(() =>
  rows.map((r, i) => ({
    ...r,
    pct: (Math.log10(r.n) / maxLog) * 100,
    share: r.n / total < 0.001 ? '<0.1%' : ((r.n / total) * 100).toFixed(1) + '%',
    highlight: i === rows.length - 1, // 村级：唯一墨蓝
  }))
);
const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<template>
  <KamiFigure
    eyebrow="2023 · NBS 五级全量 · cache.db"
    title="每下探一级，行政单元数量放大近一个数量级——村级独占全量 93%"
    caption="对数刻度（横轴每格 ×10）。总量 665,271 条中村级 620,572 条，占 93.3%；这也是为什么「零爬虫、注水本地 SQLite」的分发方式必要——数据体量集中在最底层。"
  >
    <div class="lsc">
      <!-- 数量级参考线 -->
      <div class="lsc-grid">
        <span v-for="p in [2, 3, 4, 5]" :key="p" class="lsc-gridline" :style="{ left: (p / maxLog) * 100 + '%' }">
          <i>10<sup>{{ p }}</sup></i>
        </span>
      </div>
      <div v-for="b in bars" :key="b.level" class="lsc-row">
        <div class="lsc-label">
          <span class="lsc-level">{{ b.level }}</span>
          <span class="lsc-code">{{ b.code }}</span>
        </div>
        <div class="lsc-track">
          <div class="lsc-bar" :class="{ hi: b.highlight }" :style="{ width: b.pct + '%' }">
            <span class="lsc-value">{{ fmt(b.n) }}</span>
          </div>
          <span class="lsc-share">{{ b.share }}</span>
        </div>
      </div>
    </div>
  </KamiFigure>
</template>

<style scoped>
.lsc {
  position: relative;
  font-variant-numeric: lining-nums tabular-nums;
}
.lsc-grid {
  position: absolute;
  left: 148px;
  right: 46px;
  top: 0;
  bottom: 18px;
  pointer-events: none;
}
.lsc-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px dashed var(--kami-border, #e8e6dc);
}
.lsc-gridline i {
  position: absolute;
  bottom: -16px;
  transform: translateX(-50%);
  font-style: normal;
  font-size: 0.66rem;
  color: var(--kami-stone, #6b6a64);
  font-family: var(--kami-mono);
}
.lsc-row {
  display: grid;
  grid-template-columns: 148px 1fr;
  align-items: center;
  gap: 0;
  margin: 0.5rem 0;
}
.lsc-label {
  display: flex;
  flex-direction: column;
  padding-right: 12px;
}
.lsc-level {
  font-family: var(--kami-serif);
  font-weight: 500;
  font-size: 0.98rem;
  color: var(--kami-near-black, #141413);
}
.lsc-code {
  font-size: 0.68rem;
  color: var(--kami-stone, #6b6a64);
  line-height: 1.2;
}
.lsc-track {
  position: relative;
  display: flex;
  align-items: center;
  padding-right: 46px;
}
.lsc-bar {
  height: 26px;
  min-width: 44px;
  background: var(--kami-sand, #e8e6dc);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.lsc-bar.hi {
  background: var(--kami-brand, #1b365d);
}
.lsc-value {
  padding: 0 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--kami-dark-warm, #3d3d3a);
}
.lsc-bar.hi .lsc-value {
  color: #faf9f5;
}
.lsc-share {
  position: absolute;
  right: 0;
  font-size: 0.74rem;
  color: var(--kami-olive, #504e49);
  width: 42px;
  text-align: right;
}
.dark .lsc-bar {
  background: #33322d;
}
.dark .lsc-bar.hi {
  background: #4a6c96;
}
.dark .lsc-level {
  color: #f2f0e8;
}
@media (max-width: 640px) {
  .lsc-row {
    grid-template-columns: 96px 1fr;
  }
  .lsc-grid {
    left: 96px;
  }
  .lsc-code {
    display: none;
  }
}
</style>
