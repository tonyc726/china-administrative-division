<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import initialCode from '../data/generated/hero-initial.json';

const RANKS = ['省', '市', '县', '乡', '村'] as const;
const LENGTHS = [2, 2, 2, 3, 3] as const;
const ROTATE_MS = 3500;
const HISTORY_CAP = 40;

interface Entry {
  code: string;
  names: readonly string[];
}

const initialEntry: Entry = {
  code: initialCode.code,
  names: initialCode.names,
};

const history = ref<Entry[]>([initialEntry]);
const index = ref(0);
const pool = ref<Entry[] | null>(null);
const poolReady = ref(false);
const pinned = ref(4);
const active = ref(4);
const hovering = ref(false);
const focused = ref(false);
const hidden = ref(false);
const announcement = ref('');

const current = computed(() => history.value[index.value] ?? initialEntry);
const paused = computed(() => hovering.value || focused.value || hidden.value);
const segments = computed(() => {
  let offset = 0;
  return RANKS.map((rank, segmentIndex) => {
    const length = LENGTHS[segmentIndex]!;
    const digits = current.value.code.slice(offset, offset + length);
    offset += length;
    return {
      rank,
      digits,
      name: current.value.names[segmentIndex] ?? '',
    };
  });
});

const figureLabel = computed(
  () => `12 位区划码 ${current.value.code}，${current.value.names.join('、')}`
);
const groupLabel = computed(
  () => `按省、市、县、乡、村拆开的 ${current.value.code}`
);

let timer = 0;
let alive = true;

function stop() {
  window.clearInterval(timer);
  timer = 0;
}

function start() {
  stop();
  if (paused.value || !poolReady.value) return;
  timer = window.setInterval(() => {
    next();
  }, ROTATE_MS);
}

function phrase(entry: Entry) {
  return `${entry.code}，${entry.names.join('、')}`;
}

function pick(exclude: string) {
  const list = pool.value;
  if (!list || list.length < 2) return null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const choice = list[Math.floor(Math.random() * list.length)]!;
    if (choice.code !== exclude) return choice;
  }
  return list.find((entry) => entry.code !== exclude) ?? null;
}

function push(entry: Entry) {
  const nextHistory = history.value.slice(0, index.value + 1);
  nextHistory.push(entry);
  let nextIndex = nextHistory.length - 1;
  while (nextHistory.length > HISTORY_CAP) {
    nextHistory.shift();
    nextIndex -= 1;
  }
  history.value = nextHistory;
  index.value = Math.max(0, nextIndex);
}

function next() {
  if (!poolReady.value) return;
  if (index.value < history.value.length - 1) {
    index.value += 1;
    announcement.value = phrase(current.value);
    return;
  }
  const entry = pick(current.value.code);
  if (!entry) return;
  push(entry);
  announcement.value = phrase(entry);
}

function prev() {
  if (index.value <= 0) return;
  index.value -= 1;
  announcement.value = phrase(current.value);
}

function shuffle() {
  if (!poolReady.value) return;
  const entry = pick(current.value.code);
  if (!entry) return;
  history.value = history.value.slice(0, index.value + 1);
  push(entry);
  announcement.value = phrase(entry);
}

function goNext() {
  next();
  if (!paused.value) start();
}

function goPrev() {
  prev();
  if (!paused.value) start();
}

function goShuffle() {
  shuffle();
  if (!paused.value) start();
}

function pin(level: number) {
  pinned.value = level;
  active.value = level;
}

function onKey(event: KeyboardEvent, level: number) {
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
  const count = segments.value.length;
  const nextLevel =
    key === 'ArrowRight'
      ? (level + 1) % count
      : key === 'ArrowLeft'
        ? (level - 1 + count) % count
        : key === 'Home'
          ? 0
          : count - 1;
  pin(nextLevel);
  const group = (event.currentTarget as HTMLElement).parentElement;
  group?.querySelectorAll<HTMLButtonElement>('button')[nextLevel]?.focus();
}

function digitDelay(segmentIndex: number, digitIndex: number) {
  const starts = [0, 2, 4, 6, 9];
  return ((starts[segmentIndex] ?? 0) + digitIndex) * 45;
}

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  hovering.value = true;
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  hovering.value = false;
}

function onFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget;
  if (
    !(nextTarget instanceof Node) ||
    !(event.currentTarget as HTMLElement).contains(nextTarget)
  ) {
    focused.value = false;
  }
}

watch([paused, poolReady], () => {
  if (paused.value || !poolReady.value) stop();
  else start();
});

function onVisibility() {
  hidden.value = document.hidden;
}

onMounted(() => {
  hidden.value = document.hidden;
  document.addEventListener('visibilitychange', onVisibility);
  fetch(withBase('/data/hero-codes.json'))
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ codes?: string[][] }>;
    })
    .then((data) => {
      if (!alive) return;
      const entries = (data.codes ?? [])
        .filter((row) => row.length >= 6 && /^\d{12}$/.test(row[0] ?? ''))
        .map((row) => ({ code: row[0]!, names: row.slice(1, 6) }));
      if (entries.length < 2) return;
      pool.value = entries;
      poolReady.value = true;
    })
    .catch(() => {
      // 抽样没加载到就停在 SSR 的那一条实码上。
    });
});

onBeforeUnmount(() => {
  alive = false;
  document.removeEventListener('visibilitychange', onVisibility);
  stop();
});
</script>

<template>
  <figure
    class="anatomy"
    :aria-label="figureLabel"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <figcaption class="anatomy-head">
      <span class="anatomy-kicker">12 位区划码</span>
      <span class="anatomy-year">2023</span>
    </figcaption>
    <div class="anatomy-code" role="group" :aria-label="groupLabel">
      <button
        v-for="(seg, segmentIndex) in segments"
        :key="seg.rank"
        type="button"
        class="seg"
        :class="{ on: active === segmentIndex }"
        :aria-pressed="pinned === segmentIndex"
        :aria-label="`${seg.rank} ${seg.digits} ${seg.name}`"
        @mouseenter="active = segmentIndex"
        @mouseleave="active = pinned"
        @focus="pin(segmentIndex)"
        @click="pin(segmentIndex)"
        @keydown="onKey($event, segmentIndex)"
      >
        <span class="digits" aria-hidden="true">
          <span
            v-for="(ch, digitIndex) in seg.digits"
            :key="digitIndex"
            class="reel"
          >
            <span
              class="reel-strip"
              :style="{
                transform: `translate3d(0, calc(${ch} * -1em), 0)`,
                transitionDelay: `${digitDelay(segmentIndex, digitIndex)}ms`,
              }"
            >
              <span v-for="n in 10" :key="n">{{ n - 1 }}</span>
            </span>
          </span>
        </span>
        <span class="seg-stem" aria-hidden="true" />
        <span class="seg-rank">{{ seg.rank }}</span>
        <span class="seg-name">
          <Transition name="namefade">
            <span :key="`${seg.rank}-${seg.name}`" class="seg-name-text">{{
              seg.name
            }}</span>
          </Transition>
        </span>
      </button>
    </div>
    <div class="anatomy-nav">
      <button
        type="button"
        class="step"
        :disabled="index === 0"
        aria-label="上一个区划码"
        @click="goPrev"
      >
        ‹
      </button>
      <button
        type="button"
        class="shuffle"
        :disabled="!poolReady"
        aria-label="随机换一个区划码"
        @click="goShuffle"
      >
        换一个
      </button>
      <button
        type="button"
        class="step"
        :disabled="!poolReady"
        aria-label="下一个区划码"
        @click="goNext"
      >
        ›
      </button>
    </div>
  </figure>
</template>

<style scoped>
.anatomy {
  container-type: inline-size;
  position: relative;
  width: 100%;
  max-width: none;
  margin: 0;
  box-sizing: border-box;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: clamp(16px, 4.2cqi, 22px) clamp(10px, 2.6cqi, 16px)
    clamp(14px, 3.4cqi, 18px);
  color: var(--vp-c-text-1);
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  padding: 8px 0 6px;
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

.digits {
  display: inline-flex;
  gap: 0;
  height: 1em;
  overflow: hidden;
  font-family: var(--vp-font-family-mono);
  font-size: clamp(1.05rem, 7.4cqi, 2.05rem);
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
  font-variant-ligatures: none;
  font-feature-settings:
    'liga' 0,
    'calt' 0;
  color: var(--vp-c-text-1);
}

.reel {
  position: relative;
  width: 1ch;
  height: 1em;
  line-height: 1;
  overflow: hidden;
  overflow: clip;
  flex: none;
  contain: paint;
  font-variant-ligatures: none;
}

.reel-strip {
  display: flex;
  flex-direction: column;
  width: 1ch;
  will-change: transform;
  transition: transform 0.62s cubic-bezier(0.22, 1, 0.36, 1);
}

.reel-strip span {
  display: grid;
  place-items: center;
  width: 1ch;
  height: 1em;
  min-height: 1em;
  flex: 0 0 1em;
  line-height: 1;
  overflow: hidden;
  font-variant-ligatures: none;
  font-feature-settings:
    'liga' 0,
    'calt' 0;
}

.seg-stem {
  width: 1px;
  height: clamp(18px, 6cqi, 28px);
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
  display: grid;
  width: 100%;
  margin-top: 3px;
  overflow: hidden;
  font-size: clamp(10px, 2.7cqi, 13px);
  line-height: 1.35;
  height: calc(1.35em * 2);
}

.seg-name-text {
  grid-area: 1 / 1;
  width: 100%;
  font-size: 1em;
  font-weight: 500;
  line-height: inherit;
  letter-spacing: -0.01em;
  text-align: center;
  color: var(--vp-c-text-2);
}

.namefade-enter-active,
.namefade-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}

.namefade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.namefade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.seg.on {
  background: var(--vp-c-brand-soft);
}

.seg.on .digits,
.seg.on .seg-rank {
  color: var(--vp-c-brand-1);
}

.seg.on .seg-name-text {
  color: var(--vp-c-text-1);
}

.seg.on .seg-stem,
.seg.on .seg-stem::after {
  background: var(--vp-c-brand-1);
}

.digits,
.seg-rank,
.seg-name-text,
.seg-stem,
.seg-stem::after {
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.anatomy-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  min-height: 28px;
  padding: 0 2px;
}

.step,
.shuffle {
  appearance: none;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.step {
  width: 28px;
  height: 28px;
  flex: none;
  font-size: 18px;
  line-height: 1;
}

.shuffle {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}

.step:hover,
.shuffle:hover {
  border-color: var(--vp-cursor-hairline-strong);
  color: var(--vp-c-text-1);
}

.step:focus-visible,
.shuffle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.step:disabled,
.shuffle:disabled {
  opacity: 0.38;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .reel-strip {
    transition: none;
  }

  .namefade-enter-active,
  .namefade-leave-active {
    transition: opacity 0.18s linear;
  }

  .namefade-enter-from,
  .namefade-leave-to {
    transform: none;
  }

  .digits,
  .seg-rank,
  .seg-name-text,
  .seg-stem,
  .seg-stem::after {
    transition: none;
  }
}
</style>
