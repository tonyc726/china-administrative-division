<script setup lang="ts">
import { ref } from 'vue';

/**
 * 2023 年五级实码，核对自 @cndiv/source-2023（year = 2023）：
 * 330000000000 浙江省 → 330100000000 杭州市 → 330102000000 上城区
 * → 330102001000 清波街道 → 330102001051 清波门社区。
 * 市级是杭州市，不是「市辖区」占位层。
 */
const segments = [
  { digits: '33', rank: '省', name: '浙江省' },
  { digits: '01', rank: '市', name: '杭州市' },
  { digits: '02', rank: '县', name: '上城区' },
  { digits: '001', rank: '乡', name: '清波街道' },
  { digits: '051', rank: '村', name: '清波门社区' },
] as const;

const resting = segments.length - 1;
const pinned = ref(resting);
const active = ref(resting);

function pin(index: number) {
  pinned.value = index;
  active.value = index;
}

function onKey(event: KeyboardEvent, index: number) {
  const key = event.key;
  if (
    key !== 'ArrowRight' &&
    key !== 'ArrowLeft' &&
    key !== 'Home' &&
    key !== 'End'
  ) {
    return;
  }
  event.preventDefault();
  const count = segments.length;
  const next =
    key === 'ArrowRight'
      ? (index + 1) % count
      : key === 'ArrowLeft'
        ? (index - 1 + count) % count
        : key === 'Home'
          ? 0
          : count - 1;
  pin(next);
  const group = (event.currentTarget as HTMLElement).parentElement;
  const target = group?.querySelectorAll<HTMLButtonElement>('button')[next];
  target?.focus();
}
</script>

<template>
  <figure
    class="anatomy"
    aria-label="12 位区划码 330102001051，2023 年浙江省杭州市上城区清波街道清波门社区。33 是省，01 是市，02 是县，001 是乡，051 是村。"
  >
    <figcaption class="anatomy-head">
      <span class="anatomy-kicker">12 位区划码</span>
      <span class="anatomy-year">2023</span>
    </figcaption>
    <div
      class="anatomy-code"
      role="group"
      aria-label="按省、市、县、乡、村拆开的 330102001051"
    >
      <button
        v-for="(seg, index) in segments"
        :key="seg.digits"
        type="button"
        class="seg"
        :class="{ on: active === index }"
        :aria-pressed="pinned === index"
        :aria-label="`${seg.rank} ${seg.digits} ${seg.name}`"
        @mouseenter="active = index"
        @mouseleave="active = pinned"
        @focus="pin(index)"
        @click="pin(index)"
        @keydown="onKey($event, index)"
      >
        <span class="seg-digits">{{ seg.digits }}</span>
        <span class="seg-stem" aria-hidden="true" />
        <span class="seg-rank">{{ seg.rank }}</span>
        <span class="seg-name">{{ seg.name }}</span>
      </button>
    </div>
  </figure>
</template>

<style scoped>
.anatomy {
  container-type: inline-size;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  box-sizing: border-box;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: clamp(16px, 4.2cqi, 22px) clamp(10px, 2.6cqi, 16px)
    clamp(18px, 4.6cqi, 24px);
  color: var(--vp-c-text-1);
}

.anatomy-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px 2px;
}

.anatomy-kicker {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.anatomy-year {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums lining-nums;
}

.anatomy-code {
  display: grid;
  grid-template-columns: 2fr 2fr 2fr 3.15fr 3.7fr;
  column-gap: clamp(2px, 1cqi, 8px);
  margin-top: clamp(14px, 4cqi, 22px);
}

.seg {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  margin: 0;
  padding: 8px 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.seg:focus {
  outline: none;
}

.seg:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.seg-digits {
  font-family: var(--vp-font-family-mono);
  font-size: clamp(1.2rem, 6.6cqi, 2.125rem);
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--vp-c-text-1);
}

.seg-stem {
  width: 1px;
  height: clamp(18px, 6cqi, 32px);
  margin: 10px 0 8px;
  background: var(--vp-cursor-hairline-strong);
  position: relative;
  flex: none;
}

.seg-stem::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--vp-cursor-hairline-strong);
  transform: translateX(-50%);
}

.seg-rank {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.2;
  color: var(--vp-c-text-3);
}

.seg-name {
  margin-top: 3px;
  max-width: 100%;
  font-size: clamp(11px, 3.15cqi, 13px);
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: -0.01em;
  white-space: nowrap;
  color: var(--vp-c-text-2);
}

.seg.on {
  background: var(--vp-c-brand-soft);
}

.seg.on .seg-digits,
.seg.on .seg-rank {
  color: var(--vp-c-brand-1);
}

.seg.on .seg-name {
  color: var(--vp-c-text-1);
}

.seg.on .seg-stem,
.seg.on .seg-stem::after {
  background: var(--vp-c-brand-1);
}

.seg-digits,
.seg-rank,
.seg-name,
.seg-stem,
.seg-stem::after {
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

@media (prefers-reduced-motion: reduce) {
  .seg-digits,
  .seg-rank,
  .seg-name,
  .seg-stem,
  .seg-stem::after {
    transition: none;
  }
}
</style>
