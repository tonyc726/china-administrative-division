/**
 * 分享卡片：一张 1200×630 的「地名档案卡」（OG 标准尺寸）。
 *
 * 设计语言与站点一致：暖纸、墨字、赤陶橙、衬线——像从县志里裁下来的一页，
 * 而不是一张科技海报。若该县有 1980–2020 的名称变迁，卡片带上那句变迁史，
 * 这是它在朋友圈/小红书里的记忆点。
 *
 * 用 canvas 而非 html2canvas：零依赖、无跨域字体问题、导出即所见。
 */
import { useEffect, useRef, useState } from 'react';
import type { Division, LineageEvent } from '../types';
import { COPY, type Lang } from '../i18n';

const CARD_W = 1200;
const CARD_H = 630;
/** 卡片落款站点：部署时用 VITE_SITE_URL 注入真实域名；未配置则回落到仓库地址（不编造域名） */
const SITE = import.meta.env.VITE_SITE_URL ?? 'github.com/tonyc726/china-administrative-division';

const PAPER = '#f7f2e7'; /* 卡片专用纸色（比纸面深一档，印感），非界面 token */

/** Canvas 2D 不吃 CSS var() —— 从 token 现场解析，与 styles.css 保持单一真相源 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface Props {
  lang: Lang;
  chain: Division[];
  leaf: Division;
  /** 所在县的 1980–2020 变迁事件；空则卡片不写变迁 */
  lineage: LineageEvent[];
  /** 全国同名村数：1=独一无二。0 表示非村级/未知，卡片不显示 */
  dup: number;
}

/** 12 位区划码的五段：省2 市2 县2 乡3 村3 */
function codeSegments(code: string): string[] {
  if (code.length !== 12) return [code];
  return [
    code.slice(0, 2),
    code.slice(2, 4),
    code.slice(4, 6),
    code.slice(6, 9),
    code.slice(9, 12),
  ];
}

/** 变迁史压成卡片上的一行；无变迁返回 null */
function lineageLine(events: LineageEvent[], lang: Lang): string | null {
  if (events.length < 2) return null;
  const last = events[events.length - 1];
  const prev = events[events.length - 2];
  if (!last || !prev) return null;
  return lang === 'zh'
    ? `${last[0]} 年，「${prev[1]}」改为「${last[1]}」`
    : `In ${last[0]}, “${prev[1]}” became “${last[1]}”`;
}

function draw(
  canvas: HTMLCanvasElement,
  chain: Division[],
  leaf: Division,
  lineage: LineageEvent[],
  dup: number,
  lang: Lang
): void {
  const t = COPY[lang];
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const INK = cssVar('--color-ink', '#141413');
  const INK_SOFT = cssVar('--color-ink-2', '#3d3d3a');
  const INK_FAINT = cssVar('--color-ink-3', '#6c6a64');
  const CLAY = cssVar('--color-clay', '#cc785c');
  const BORDER = cssVar('--color-line-2', '#d5cec0');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  ctx.scale(dpr, dpr);

  const serif = (size: number, weight = '400'): string =>
    `${weight} ${size}px Georgia, "Songti SC", "STSong", serif`;
  const sans = (size: number, weight = '400'): string =>
    `${weight} ${size}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`;

  // 纸面
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 档案卡双线边框
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 20, CARD_W - 40, CARD_H - 40);
  ctx.lineWidth = 0.75;
  ctx.strokeRect(30, 30, CARD_W - 60, CARD_H - 60);

  // 顶部小字标 + 横线
  ctx.fillStyle = CLAY;
  ctx.font = sans(18, '500');
  const header =
    lang === 'zh' ? '地 名 档 案 · PLACE ARCHIVE' : 'PLACE ARCHIVE · 地 名 档 案';
  ctx.fillText(header, 72, 96);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(72, 116);
  ctx.lineTo(CARD_W - 72, 116);
  ctx.stroke();

  // 主体：末级名称（衬线大字 400，自适应字号 —— DESIGN.md：display serif 永不加粗）
  ctx.fillStyle = INK;
  let size = 88;
  ctx.font = serif(size);
  while (ctx.measureText(leaf.name).width > CARD_W - 144 && size > 40) {
    size -= 4;
    ctx.font = serif(size);
  }
  ctx.fillText(leaf.name, 72, 218);

  // 上级链路
  ctx.fillStyle = INK_SOFT;
  ctx.font = serif(26);
  const chainText = chain.slice(0, -1).map((d) => d.name).join(' · ');
  ctx.fillText(chainText, 72, 268);

  // 区划码
  ctx.fillStyle = INK_FAINT;
  ctx.font = sans(17);
  ctx.fillText(t.cardCode, 72, 352);

  // 区划码逐段绘制：下划线按每段的**实际文字宽度**画，与数字严格等宽对齐
  ctx.font = serif(58);
  const segs = codeSegments(leaf.code);
  const gap = ctx.measureText('0').width * 0.55;
  let sx = 72;
  const bounds: { x: number; w: number }[] = [];
  for (const seg of segs) {
    const w = ctx.measureText(seg).width;
    ctx.fillStyle = CLAY;
    ctx.fillText(seg, sx, 418);
    bounds.push({ x: sx, w });
    sx += w + gap;
  }
  // 每段正下方一条等长横线：已确定的层级用赤陶，未及的层级用淡边框
  bounds.forEach((b, i) => {
    ctx.fillStyle = i < chain.length ? CLAY : BORDER;
    ctx.globalAlpha = i < chain.length ? 0.9 - i * 0.1 : 0.5;
    ctx.fillRect(b.x, 434, b.w, 4);
    ctx.globalAlpha = 1;
  });

  // 稀有度徽章（右上）：独一无二 → 赤陶实心印章；有重名 → 淡框
  if (dup > 0) {
    const unique = dup === 1;
    const label = unique ? t.rarityUnique : t.rarityShared(dup);
    ctx.font = sans(20, '500');
    const tw = ctx.measureText(label).width;
    const bx = CARD_W - 72 - tw - 32;
    const by = 150;
    ctx.fillStyle = unique ? CLAY : 'transparent';
    ctx.strokeStyle = unique ? CLAY : BORDER;
    ctx.lineWidth = 1.5;
    if (unique) ctx.fillRect(bx, by, tw + 32, 44);
    else ctx.strokeRect(bx, by, tw + 32, 44);
    ctx.fillStyle = unique ? PAPER : INK_SOFT;
    ctx.fillText(label, bx + 16, by + 29);
  }

  // 县的变迁史（有则写，无则留白——不编造）
  const story = lineageLine(lineage, lang);
  if (story) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = serif(24);
    ctx.fillText(story, 72, 502);
  }

  // 底部：品牌落款（左）与站点（右），压细线
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(72, CARD_H - 108);
  ctx.lineTo(CARD_W - 72, CARD_H - 108);
  ctx.stroke();

  ctx.fillStyle = INK_SOFT;
  ctx.font = serif(22, '500');
  ctx.fillText(t.brand, 72, CARD_H - 68);

  ctx.fillStyle = INK_FAINT;
  ctx.font = sans(18);
  ctx.fillText(SITE, CARD_W - 72 - ctx.measureText(SITE).width, CARD_H - 68);
}

export function ShareCard({ lang, chain, leaf, lineage, dup }: Props): JSX.Element {
  const t = COPY[lang];
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (c) draw(c, chain, leaf, lineage, dup, lang);
  }, [chain, leaf, lineage, dup, lang]);

  const download = (): void => {
    const c = ref.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${leaf.name}-${leaf.code}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const copy = (): void => {
    void navigator.clipboard.writeText(leaf.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="mt-8">
      <canvas
        ref={ref}
        style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
        className="w-full rounded-md border border-line-2 shadow-[0_2px_16px_rgba(20,20,19,0.08)]"
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={download}
          className="h-10 rounded-md bg-clay px-5 text-sm font-medium text-paper outline-none transition hover:bg-clay-2 focus-visible:ring-2 focus-visible:ring-clay/40"
        >
          {t.download}
        </button>
        <button
          type="button"
          onClick={copy}
          className="h-10 rounded-md border border-line-2 px-5 text-sm text-ink-2 outline-none transition hover:border-ink-3 focus-visible:ring-2 focus-visible:ring-clay/40"
        >
          {copied ? t.copied : t.copyCode}
        </button>
      </div>
    </div>
  );
}
