/**
 * 分享卡片：把「你的坐标」画成一张 1200×630 的 PNG（OG 标准尺寸）。
 *
 * 传播链路的终点：用户截图/下载 → 发朋友圈、小红书 → 卡片自带站点地址 → 回流。
 * 用 canvas 而非 html2canvas：零依赖、无跨域字体问题、导出即所见。
 */
import { useEffect, useRef, useState } from 'react';
import type { Division } from '../types';
import { COPY, type Lang } from '../i18n';

const CARD_W = 1200;
const CARD_H = 630;
/** 卡片落款站点：部署时用 VITE_SITE_URL 注入真实域名；未配置则回落到仓库地址（不编造域名） */
const SITE = import.meta.env.VITE_SITE_URL ?? 'github.com/tonyc726/china-administrative-division';

interface Props {
  lang: Lang;
  chain: Division[];
  leaf: Division;
}

/** 12 位区划码分段显示：省2 市2 县2 乡3 村3 —— 让编码结构可读 */
function segmentCode(code: string): string {
  if (code.length !== 12) return code;
  return `${code.slice(0, 2)} ${code.slice(2, 4)} ${code.slice(4, 6)} ${code.slice(6, 9)} ${code.slice(9, 12)}`;
}

function draw(canvas: HTMLCanvasElement, chain: Division[], leaf: Division, lang: Lang): void {
  const t = COPY[lang];
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  ctx.scale(dpr, dpr);

  const font = (size: number, weight = '400'): string =>
    `${weight} ${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`;

  // 背景
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 顶部青色渐变条
  const grad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  grad.addColorStop(0, '#22d3ee');
  grad.addColorStop(1, '#a78bfa');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, 6);

  // 网格纹理（数据感）
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < CARD_W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CARD_H);
    ctx.stroke();
  }

  // 标签
  ctx.fillStyle = '#52525b';
  ctx.font = font(20);
  ctx.fillText(t.cardTitle, 72, 100);

  // 主体：末级名称（自适应字号）
  ctx.fillStyle = '#fafafa';
  let size = 92;
  ctx.font = font(size, '600');
  while (ctx.measureText(leaf.name).width > CARD_W - 144 && size > 40) {
    size -= 4;
    ctx.font = font(size, '600');
  }
  ctx.fillText(leaf.name, 72, 190);

  // 上级链路
  ctx.fillStyle = '#a1a1aa';
  ctx.font = font(24);
  const lineage = chain.slice(0, -1).map((d) => d.name).join('  ›  ');
  ctx.fillText(lineage, 72, 240);

  // 区划码：分段 mono
  ctx.fillStyle = '#52525b';
  ctx.font = font(18);
  ctx.fillText(t.cardCode, 72, 330);

  ctx.fillStyle = '#22d3ee';
  ctx.font = `600 56px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(segmentCode(leaf.code), 72, 396);

  // 五级链路条：把 12 位码的层级结构可视化
  const segs = [2, 2, 2, 3, 3];
  let sx = 72;
  const barY = 440;
  const unit = 56;
  segs.forEach((n, i) => {
    const w = n * unit * 0.42;
    ctx.fillStyle = i < chain.length ? '#22d3ee' : '#27272a';
    ctx.globalAlpha = i < chain.length ? 1 - i * 0.14 : 1;
    ctx.fillRect(sx, barY, w - 6, 8);
    ctx.globalAlpha = 1;
    sx += w;
  });

  // 底部品牌
  ctx.fillStyle = '#71717a';
  ctx.font = font(22, '500');
  ctx.fillText(t.brand, 72, CARD_H - 64);

  ctx.fillStyle = '#3f3f46';
  ctx.font = font(20);
  const site = SITE;
  ctx.fillText(site, CARD_W - 72 - ctx.measureText(site).width, CARD_H - 64);
}

export function ShareCard({ lang, chain, leaf }: Props): JSX.Element {
  const t = COPY[lang];
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (c) draw(c, chain, leaf, lang);
  }, [chain, leaf, lang]);

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
        className="w-full rounded-xl border border-zinc-800"
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={download}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-cyan-400"
        >
          {t.download}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700"
        >
          {copied ? t.copied : t.copyCode}
        </button>
      </div>
    </div>
  );
}
