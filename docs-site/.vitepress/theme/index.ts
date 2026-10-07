import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import LevelHistoryChart from './components/LevelHistoryChart.vue';
import HistoryTrendChart from './components/HistoryTrendChart.vue';
import HistoryExplorer from './components/HistoryExplorer.vue';
import KamiFigure from './components/KamiFigure.vue';
import Layout from './Layout.vue';
import './custom.css';

// Cursor 设计系统：暖奶油底 + Cursor Orange + Inter / JetBrains Mono。见仓库 DESIGN.md。
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('LevelHistoryChart', LevelHistoryChart);
    app.component('HistoryTrendChart', HistoryTrendChart);
    app.component('HistoryExplorer', HistoryExplorer);
    app.component('KamiFigure', KamiFigure);
  },
} satisfies Theme;
