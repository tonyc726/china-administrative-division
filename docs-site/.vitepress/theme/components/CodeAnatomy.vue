<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CODE_EXAMPLES,
  ROTATE_MS,
  examplePhrase,
  type CodeExample,
} from '../data/code-examples';

const cursor = ref(0);
const pinned = ref(4);
const active = ref(4);
const hovering = ref(false);
const focused = ref(false);
const hidden = ref(false);
const announcement = ref('');

const current = computed(
  () => CODE_EXAMPLES[cursor.value] ?? CODE_EXAMPLES[0]!
);
const paused = computed(() => hovering.value || focused.value || hidden.value);

const figureLabel = computed(
  () => `12 位区划码 ${current.value.code}，${current.value.region}`
);
const groupLabel = computed(
  () => `按省、市、县、乡、村拆开的 ${current.value.code}`
);

let timer = 0;

function stop() {
  window.clearInterval(timer);
  timer = 0;
}

function start() {
  stop();
  if (paused.value) return;
  timer = window.setInterval(() => {
    go(cursor.value + 1, true, false);
  }, ROTATE_MS);
}

function go(index: number, announce: boolean, resetTimer = true) {
  const count = CODE_EXAMPLES.length;
  const next = ((index % count) + count) % count;
  if (next === cursor.value) return;
  cursor.value = next;
  if (announce) announcement.value = examplePhrase(current.value);
  if (resetTimer && !paused.value) start();
}

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
  const count = current.value.segments.length;
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
  group?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
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
  const next = event.relatedTarget;
  if (
    !(next instanceof Node) ||
    !(event.currentTarget as HTMLElement).contains(next)
  ) {
    focused.value = false;
  }
}

function dotLabel(example: CodeExample) {
  const village = example.segments[4]?.name ?? example.code;
  return `${example.region}，${village}，${example.code}`;
}

watch(paused, (isPaused) => {
  if (isPaused) stop();
  else start();
});

function onVisibility() {
  hidden.value = document.hidden;
}

onMounted(() => {
  hidden.value = document.hidden;
  document.addEventListener('visibilitychange', onVisibility);
  start();
});

onBeforeUnmount(() => {
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
        v-for="(seg, index) in current.segments"
        :key="seg.rank"
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
        <span class="digits" aria-hidden="true">
          <span
            v-for="(ch, digitIndex) in seg.digits"
            :key="digitIndex"
            class="reel"
          >
            <span
              class="reel-strip"
              :style="{
                transform: `translateY(calc(${ch} * -1em))`,
                transitionDelay: `${digitDelay(index, digitIndex)}ms`,
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
            <span :key="seg.name" class="seg-name-text">{{ seg.name }}</span>
          </Transition>
        </span>
      </button>
    </div>
    <div class="anatomy-nav">
      <button
        type="button"
        class="step"
        aria-label="上一个区划码"
        @click="go(cursor - 1, true)"
      >
        ‹
      </button>
      <div class="dots" role="group" aria-label="选择示例区划码">
        <button
          v-for="(example, index) in CODE_EXAMPLES"
          :key="example.code"
          type="button"
          class="dot"
          :aria-current="index === cursor ? 'true' : undefined"
          :aria-label="dotLabel(example)"
          @click="go(index, true)"
        />
      </div>
      <button
        type="button"
        class="step"
        aria-label="下一个区划码"
        @click="go(cursor + 1, true)"
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
  max-width: 460px;
  margin: 0 auto;
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
  gap: 0.06em;
  height: 1em;
  font-family: var(--vp-font-family-mono);
  font-size: clamp(1.2rem, 6.2cqi, 2.05rem);
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--vp-c-text-1);
}

.reel {
  width: 1ch;
  height: 1em;
  overflow: hidden;
  flex: none;
}

.reel-strip {
  display: flex;
  flex-direction: column;
  transition: transform 0.62s cubic-bezier(0.22, 1, 0.36, 1);
}

.reel-strip span {
  height: 1em;
  line-height: 1;
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
.dot {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.step {
  width: 28px;
  height: 28px;
  flex: none;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  font-size: 18px;
  line-height: 1;
}

.step:hover {
  border-color: var(--vp-cursor-hairline-strong);
  color: var(--vp-c-text-1);
}

.step:focus-visible,
.dot:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.dot {
  width: 18px;
  height: 18px;
  padding: 0;
  display: grid;
  place-items: center;
}

.dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: var(--vp-cursor-hairline-strong);
}

.dot[aria-current='true']::before {
  width: 14px;
  background: var(--vp-c-brand-1);
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
