/**
 * 向后兼容层 - vite-plugin-ssr 现在使用 renderer/_default.page.client.tsx
 */
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

function getPrerenderedData() {
  const script = document.getElementById('__PRERENDERED_DATA__');
  if (!script) return undefined;

  try {
    return JSON.parse(script.textContent || '{}');
  } catch {
    return undefined;
  }
}

const prerendered = getPrerenderedData();

hydrateRoot(
  document.getElementById('root')!,
  <App prerendered={prerendered} />
);
