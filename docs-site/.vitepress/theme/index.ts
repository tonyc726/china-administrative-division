import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import LevelScaleChart from './components/LevelScaleChart.vue';
import HistoryTrendChart from './components/HistoryTrendChart.vue';
import HistoryExplorer from './components/HistoryExplorer.vue';
import KamiFigure from './components/KamiFigure.vue';
import './custom.css';

// Kami 设计语言（紙）：暖羊皮纸底 + 唯一墨蓝强调 + 衬线扛层级。
// 全局注册图表组件，供 Markdown 直接引用。
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LevelScaleChart', LevelScaleChart);
    app.component('HistoryTrendChart', HistoryTrendChart);
    app.component('HistoryExplorer', HistoryExplorer);
    app.component('KamiFigure', KamiFigure);
  },
} satisfies Theme;
