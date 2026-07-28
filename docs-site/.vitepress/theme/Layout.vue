<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import ChinaMapHero from './components/ChinaMapHero.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <ChinaMapHero />
    </template>
  </Layout>
</template>
