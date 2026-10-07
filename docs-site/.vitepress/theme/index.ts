import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import LevelScaleChart from './components/LevelScaleChart.vue';
import HistoryTrendChart from './components/HistoryTrendChart.vue';
import HistoryExplorer from './components/HistoryExplorer.vue';
import KamiFigure from './components/KamiFigure.vue';
import ChinaMapHero from './components/ChinaMapHero.vue';
import Layout from './Layout.vue';
import './custom.css';

// Cursor 设计系统：暖奶油底 + Cursor Orange + Inter / JetBrains Mono。见仓库 DESIGN.md。
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('LevelScaleChart', LevelScaleChart);
    app.component('HistoryTrendChart', HistoryTrendChart);
    app.component('HistoryExplorer', HistoryExplorer);
    app.component('KamiFigure', KamiFigure);
    app.component('ChinaMapHero', ChinaMapHero);
  },
} satisfies Theme;
