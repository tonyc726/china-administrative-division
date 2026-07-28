<template>
  <div class="china-map-hero">
    <canvas ref="canvasEl" role="img" aria-label="中国行政区划地图"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const canvasEl = ref<HTMLCanvasElement | null>(null);
let observer: ResizeObserver | null = null;

interface Province {
  c: string;
  n: string;
  r: number[][];
}

async function draw() {
  const c = canvasEl.value;
  if (!c) return;
  const parent = c.parentElement;
  if (!parent) return;

  const dpr = window.devicePixelRatio || 1;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (!w || !h) return;

  c.width = w * dpr;
  c.height = h * dpr;

  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // Fetch geo JSON from main site (docs is under /docs/ subpath)
  let provs: Province[] = [];
  try {
    // Docs BASE: /china-administrative-division/docs/ → parent: /china-administrative-division/
    const docsBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const parentBase = docsBase.replace(/\/docs$/, '') || '/';
    const resp = await fetch(`${parentBase}/data/geo.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const geo = await resp.json();
    provs = geo.provs || [];
  } catch {
    fallback(ctx, w, h);
    return;
  }
  if (!provs.length) {
    fallback(ctx, w, h);
    return;
  }

  // Compute lat/lng bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of provs) {
    for (const ring of p.r) {
      for (let i = 0; i < ring.length; i += 2) {
        if (ring[i] < minX) minX = ring[i];
        if (ring[i] > maxX) maxX = ring[i];
        if (ring[i + 1] < minY) minY = ring[i + 1];
        if (ring[i + 1] > maxY) maxY = ring[i + 1];
      }
    }
  }

  // Equirectangular projection → canvas space
  const pad = 18;
  const sx = (w - 2 * pad) / (maxX - minX);
  const sy = (h - 2 * pad) / (maxY - minY);
  const s = Math.min(sx, sy);
  const ox = (w - (maxX - minX) * s) / 2 - minX * s;
  const oy = (h - (maxY - minY) * s) / 2 + maxY * s;

  function proj(lng: number, lat: number): [number, number] {
    return [lng * s + ox, h - (lat * s - minY * s + pad)];
  }

  const fill = 'rgba(204,120,92,0.04)';
  const stroke = 'rgba(204,120,92,0.18)';

  for (const p of provs) {
    ctx.beginPath();
    for (const ring of p.r) {
      if (!ring.length) continue;
      const [sx2, sy2] = proj(ring[0], ring[1]);
      ctx.moveTo(sx2, sy2);
      for (let i = 2; i < ring.length; i += 2) {
        const [px, py] = proj(ring[i], ring[i + 1]);
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // South China Sea inset
  insets(ctx, w, h, provs, proj);
}

function insets(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  provs: Province[],
  proj: (lng: number, lat: number) => [number, number]
) {
  const hainan = provs.find(p => p.c === '46');
  if (!hainan) return;

  const r = hainan.r.flat();
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    mnX = Math.min(mnX, r[i]); mxX = Math.max(mxX, r[i]);
    mnY = Math.min(mnY, r[i + 1]); mxY = Math.max(mxY, r[i + 1]);
  }

  const ix = w * 0.11;
  const iy = h * 0.16;
  const rx = w - ix - 14;
  const ry = h - iy - 10;

  const rangeX = mxX - mnX || 1;
  const rangeY = mxY - mnY || 1;
  const ss = Math.min(ix / rangeX, iy / rangeY);

  ctx.save();
  ctx.strokeStyle = 'rgba(204,120,92,0.14)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(rx, ry, ix, iy);

  for (const p of provs) {
    const flat = p.r.flat();
    let inside = false;
    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      if (flat[i] >= 105 && flat[i + 1] <= 23) { inside = true; }
      pMinX = Math.min(pMinX, flat[i]); pMaxX = Math.max(pMaxX, flat[i]);
      pMinY = Math.min(pMinY, flat[i + 1]); pMaxY = Math.max(pMaxY, flat[i + 1]);
    }
    if (!inside) continue;

    ctx.beginPath();
    for (const ring of p.r) {
      if (!ring.length) continue;
      const sx2 = rx + (ring[0] - mnX) * ss;
      const sy2 = ry + (mxY - ring[1]) * ss;
      ctx.moveTo(sx2, sy2);
      for (let i = 2; i < ring.length; i += 2) {
        const px = rx + (ring[i] - mnX) * ss;
        const py = ry + (mxY - ring[i + 1]) * ss;
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(204,120,92,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(204,120,92,0.12)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  ctx.restore();
}

function fallback(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(204,120,92,0.04)';
  ctx.fillRect(0, 0, w, h);
}

onMounted(() => draw());
onUnmounted(() => observer?.disconnect());
</script>

<style scoped>
.china-map-hero {
  width: 100%;
  aspect-ratio: 1;
}
.china-map-hero canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
