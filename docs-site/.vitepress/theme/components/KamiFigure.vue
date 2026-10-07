<script setup lang="ts">
// Kami 图表容器：eyebrow（数据出处/口径）+ insight 标题 + 画布 + caption。
// insight 标题必须陈述判断（非「XX 分布图」），caption 给图外信息（Kami anti-pattern #17/#26）。
defineProps<{
  eyebrow?: string;
  title?: string;
  caption?: string;
}>();
</script>

<template>
  <figure class="kami-figure">
    <slot name="header">
      <div v-if="eyebrow" class="kf-eyebrow">{{ eyebrow }}</div>
      <div v-if="title" class="kf-title">{{ title }}</div>
    </slot>
    <div class="kf-canvas"><slot /></div>
    <figcaption v-if="caption" class="kf-caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.kami-figure {
  margin: 2rem 0;
  padding: 1.4rem 1.5rem 1.2rem;
  background: var(--kami-ivory, #ffffff);
  border: 1px solid var(--kami-border, #e6e5e0);
  border-radius: 12px;
  font-variant-numeric: lining-nums tabular-nums;
}
.kf-eyebrow {
  font-family: var(--kami-sans);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kami-stone, #807d72);
  margin-bottom: 0.4rem;
}
.kf-title {
  font-family: var(--kami-sans);
  font-weight: 500;
  font-size: 1.12rem;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--kami-near-black, #26251e);
  margin-bottom: 1.1rem;
}
.kf-caption {
  margin-top: 1rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--kami-border-soft, #efeee8);
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--kami-olive, #5a5852);
}
</style>
