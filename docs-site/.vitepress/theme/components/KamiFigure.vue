<script setup lang="ts">
// Kami 图表容器：eyebrow（数据出处/口径）+ insight 标题 + 画布 + caption。
// insight 标题必须陈述判断（非「XX 分布图」），caption 给图外信息（Kami anti-pattern #17/#26）。
defineProps<{
  eyebrow?: string;
  title: string;
  caption?: string;
}>();
</script>

<template>
  <figure class="kami-figure">
    <div v-if="eyebrow" class="kf-eyebrow">{{ eyebrow }}</div>
    <div class="kf-title">{{ title }}</div>
    <div class="kf-canvas"><slot /></div>
    <figcaption v-if="caption" class="kf-caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.kami-figure {
  margin: 2rem 0;
  padding: 1.4rem 1.5rem 1.2rem;
  background: var(--kami-ivory, #faf9f5);
  border: 1px solid var(--kami-border, #e8e6dc);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(60, 56, 44, 0.06);
  font-variant-numeric: lining-nums tabular-nums;
}
.kf-eyebrow {
  font-family: var(--kami-sans);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kami-stone, #6b6a64);
  margin-bottom: 0.4rem;
}
.kf-title {
  font-family: var(--kami-serif);
  font-weight: 500;
  font-size: 1.12rem;
  line-height: 1.35;
  color: var(--kami-near-black, #141413);
  margin-bottom: 1.1rem;
}
.kf-caption {
  margin-top: 1rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--kami-border-soft, #e5e3d8);
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--kami-olive, #504e49);
}
.dark .kami-figure {
  background: #201f1d;
  border-color: #3a3931;
}
.dark .kf-title {
  color: #f2f0e8;
}
</style>
