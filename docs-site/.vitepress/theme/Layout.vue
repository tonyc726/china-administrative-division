<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import CodeAnatomy from './components/CodeAnatomy.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <CodeAnatomy />
    </template>
  </Layout>
</template>
