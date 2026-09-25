/**
 * 首屏：一张从 1980 烧到 2020 的中国地图。
 *
 * 每一年，被取消的县名在**它自己的省份**上烧成灰、飘散；新的名字从同一块土地上长出来。
 * 641 这个数字是它的结果，不是它的替代品。
 *
 * 四个决定了它「是不是活的」的实现选择：
 *
 * ① 灰烬必须是粒子，所以是 Canvas 不是 DOM。
 *    SVG 位移滤镜能把字撕碎，但撕碎的像素**留在原地** —— 它没有「飞走」这个概念。
 *    灰要飘起来、被气流带走、在半空冷掉，只能逐粒子模拟：
 *    离屏画一次字 → getImageData 采出笔画像素 → 每个像素变成一粒灰。零依赖。
 *
 * ② 名字的落点靠 ctx.isPointInPath 做拒绝采样，不靠坐标表。
 *    仓库里没有、也不该有县级经纬度（docs/history/项目重构方案.md §6.1 的红线）。
 *    我们只知道它属于哪个省 —— 那就在那个省的多边形里随机取一个点，落在真实版图内。
 *    位置精确到省，不到县。这是诚实的做法，不是妥协。
 *
 * ③ 投影是手写的 Albers 等积圆锥（中国标准投影），15 行。d3-geo 要 30KB，不值。
 *
 * ④ 时间是连续的浮点，不是逐年的整数，而且**绕开 React 直接写 DOM**。
 *    大数字若跟着「第几年」跳就是一顿一顿的计数器；每帧 setState 则会把整棵树重渲染，代价白付。
 *    React 只保管 playing / done 这两个稀疏状态。
 *
 * ⚠️ 地图边界是第三方数据，带**未了结的合规风险**（高德衍生 / 无审图号）。
 *    公开发布前必须解决 —— 见 apps/web/data/PROVENANCE.md。渲染端只认 {provs, jd} 契约，换源不用动这里。
 *
 * 数据自洽：逐年烧掉 826 个县，长出 185 个，826 − 185 = 641，与头条严丝合缝。
 * 后继不明的（如「上饶县」实为更名广信区，词根对不上）就只烧、不长 —— 绝不编造去向。
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import type { Geo, Timeline as TimelineData } from '../types';
import { COPY, type Lang } from '../i18n';
import { Scrubber } from './Scrubber';

interface Props {
  data: TimelineData;
  geo: Geo;
  lang: Lang;
}

/** 一年（毫秒）。41 年约 37 秒 —— 等不及的有时间轴、暂停与「跳到 2020」 */
const DWELL = 900;

/** 一个名字的一生（毫秒，相对它落地的时刻）。顺序即叙事，烧与长之间留 200ms 交叠：灰还在飘，芽已经顶出来了 */
const LIFE = {
  fadeIn: 320,
  burnAt: 960,
  burn: 1500,
  sproutAt: 2260,
  sprout: 1400,
  fadeAt: 5000,
  total: 6000,
} as const;

/** 新生（无前身）的名字不必等一场火，直接发芽 */
const BORN_SPROUT_AT = 240;

/** 灰烬采样步长（px）。1 = 每个笔画像素一粒灰；调成 2 会稀成「掉渣」，不是烧掉 */
const ASH_STEP = 1;

/** styles.css token 的像素镜像（rgba 插值必须拿数值）：ink / ink-3 / clay + 数据色 gold/pine */
const PALETTE = {
  ink: [20, 20, 19],
  ash: [108, 106, 100],
  clay: [204, 120, 92],
  gold: [168, 137, 78],
  pine: [47, 109, 104],
} as const;

/** 地图：淡到几乎只是一层底纹 —— 主角是名字，不是省界 */
const MAP = {
  land: '#f0ebde',
  edge: '#d8d0ba',
  /** 南海断续线：国界，画细但必须画 */
  border: '#b9ae93',
} as const;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const rgba = (c: readonly [number, number, number], a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** 确定性随机：同一个名字每次重放都落在同一个地方，否则拖回去看会发现「它换地方了」 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/*
 * Albers 等积圆锥投影（中国标准参数：双标准纬线 25°N / 47°N，中央经线 105°E）。
 * 等积很重要 —— 这张图上「面积」是有意义的（名字落在省里的密度），墨卡托会把新疆撑成两倍。
 */
const D = Math.PI / 180;
const P1 = 25 * D;
const P2 = 47 * D;
const L0 = 105 * D;
const P0 = 35 * D;
const CN = (Math.sin(P1) + Math.sin(P2)) / 2;
const CC = Math.cos(P1) ** 2 + 2 * CN * Math.sin(P1);
const RHO0 = Math.sqrt(CC - 2 * CN * Math.sin(P0)) / CN;

/** 经纬度 → 平面（y 已翻转为「北在上」，可直接当画布坐标用） */
function albers(lon: number, lat: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, CC - 2 * CN * Math.sin(lat * D))) / CN;
  const th = CN * (lon * D - L0);
  return [rho * Math.sin(th), -(RHO0 - rho * Math.cos(th))];
}

/** 把一个名字画到离屏 canvas 上，采出它的笔画像素 —— 这些像素就是它将来的灰 */
function sampleGlyph(
  text: string,
  font: string,
  fs: number
): { pts: { x: number; y: number }[]; w: number; ascent: number } {
  const off = document.createElement('canvas');
  const c = off.getContext('2d', { willReadFrequently: true });
  if (!c) return { pts: [], w: 0, ascent: fs };
  c.font = font;
  const m = c.measureText(text);
  const w = Math.ceil(m.width) + 2;
  const ascent = Math.ceil(m.actualBoundingBoxAscent || fs * 0.85);
  const h = ascent + Math.ceil(m.actualBoundingBoxDescent || fs * 0.2) + 2;
  off.width = w;
  off.height = h;
  c.font = font;
  c.fillStyle = '#000';
  c.textBaseline = 'alphabetic';
  c.fillText(text, 1, ascent + 1);

  const d = c.getImageData(0, 0, w, h).data;
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y += ASH_STEP) {
    for (let x = 0; x < w; x += ASH_STEP) {
      // 40 是抗锯齿边缘的门槛：再低会把一圈虚边也采成灰
      if ((d[(y * w + x) * 4 + 3] ?? 0) > 40) pts.push({ x, y });
    }
  }
  pts.sort((a, b) => a.x - b.x);
  return { pts, w, ascent };
}

/** 一粒灰 */
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 被点燃的时刻（绝对 ms）—— 火线扫到它，它才起飞 */
  lit: number;
  span: number;
  size: number;
  swirl: number;
}

/** 地图上的一株：一个旧名字在这里烧掉，一个新名字在这里长出来（任一可缺席） */
interface Sprig {
  t0: number;
  /** 落点：它所属省份多边形内的一个确定性随机点 */
  x: number;
  y: number;
  from: string;
  to: string;
  ash: { x: number; y: number }[];
  burnt: number;
  ox: number;
  oy: number;
  ow: number;
}

export function Hero({ data, geo, lang }: Props): JSX.Element {
  const t = COPY[lang];
  const { years, series } = data;
  const last = years.length - 1;

  const [playing, setPlaying] = useState(!reducedMotion());
  const [done, setDone] = useState(reducedMotion());

  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const yearEl = useRef<HTMLSpanElement>(null);
  const numEl = useRef<HTMLSpanElement>(null);
  const dials = useRef<(HTMLElement | null)[]>([]);
  /** 时间轴的游标与轨道：也归这一条 rAF 管，不能让它自己再起一套时钟 */
  const head = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  /** 连续的年份坐标（浮点）—— 数字与游标的连续性全靠它，别退回整数 */
  const pos = useRef(0);
  const playRef = useRef(true);
  /** 已经播种到哪一年，避免同一年重复下种 */
  const sown = useRef(-1);
  /** 供 rAF 读取的 seek 请求（拖时间轴时用，避免每帧 setState） */
  const seekTo = useRef<number | null>(null);

  useEffect(() => {
    playRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = cvs.current;
    const wrap = box.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const still = reducedMotion();
    const byYear = new Map(data.changes.map((c) => [c.y, c]));
    const font = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-display')
      .trim();

    let W = 0;
    let H = 0;
    let fs = 14;
    let maxLive = 8;
    let perYear = 2;
    /**
     * 命中测试专用的 context：恒等变换。
     * ctx.isPointInPath 的点**不受当前变换影响**，而主 ctx 带着 dpr 缩放 ——
     * 拿 CSS px 的点去测一个被放大 2 倍的 Path2D，几乎必然落空（曾经全军覆没，一个名字都种不出来）。
     * 单开一个不做任何变换的 context，两种解释就重合了。
     */
    const hit = document.createElement('canvas').getContext('2d');

    /** 省码 → 已投影的多边形（拒绝采样就打在它上面） */
    const paths = new Map<string, Path2D>();
    const bbox = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    /** 地图是静止的：画一次，之后每帧只是把它贴回来 */
    let base: HTMLCanvasElement | null = null;
    let sprigs: Sprig[] = [];
    let embers: Ember[] = [];
    let raf = 0;
    let alive = true;

    const face = (): string => `${fs}px ${font}`;

    const layout = (): void => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      fs = W < 420 ? 11 : W < 620 ? 12 : 14;

      // 先把全部经纬度投影一遍，量出图幅，再等比铺满画布
      const all: number[][] = [...geo.provs.flatMap((p) => p.r), ...geo.jd];
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const ring of all) {
        for (let i = 0; i < ring.length; i += 2) {
          const [px, py] = albers(ring[i]!, ring[i + 1]!);
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
      const k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.98;
      const ox = (W - (x1 - x0) * k) / 2 - x0 * k;
      const oy = (H - (y1 - y0) * k) / 2 - y0 * k;
      const put = (lon: number, lat: number): [number, number] => {
        const [px, py] = albers(lon, lat);
        return [px * k + ox, py * k + oy];
      };

      paths.clear();
      bbox.clear();
      base = document.createElement('canvas');
      base.width = canvas.width;
      base.height = canvas.height;
      const bc = base.getContext('2d');
      if (!bc) return;
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);

      const ringToPath = (p: Path2D, ring: number[]): void => {
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = put(ring[i]!, ring[i + 1]!);
          if (i === 0) p.moveTo(x, y);
          else p.lineTo(x, y);
        }
        p.closePath(); // 环是开环存的，闭合在这里
      };

      for (const prov of geo.provs) {
        const p = new Path2D();
        let bx0 = Infinity;
        let by0 = Infinity;
        let bx1 = -Infinity;
        let by1 = -Infinity;
        for (const ring of prov.r) {
          ringToPath(p, ring);
          for (let i = 0; i < ring.length; i += 2) {
            const [x, y] = put(ring[i]!, ring[i + 1]!);
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
        }
        paths.set(prov.c, p);
        bbox.set(prov.c, { x0: bx0, y0: by0, x1: bx1, y1: by1 });
        bc.fillStyle = MAP.land;
        bc.fill(p);
        bc.strokeStyle = MAP.edge;
        bc.lineWidth = 0.7;
        bc.stroke(p);
      }
      // 南海断续线：十段，一段都不能少 —— 它是国界，不是装饰
      bc.strokeStyle = MAP.border;
      bc.lineWidth = 1.4;
      bc.lineCap = 'round';
      for (const seg of geo.jd) {
        const p = new Path2D();
        ringToPath(p, seg);
        bc.stroke(p);
      }

      /*
       * 同屏能站多少个名字，由图幅面积反推；每年下几粒，再由「站得下多少」反推。
       * 稳态并发 ≈ perYear × LIFE.total / DWELL，必须 ≤ maxLive，否则 sow 会被 maxLive 卡住、
       * 变成有的年份种得下有的种不下 —— 节奏会一顿一顿的。
       */
      maxLive = Math.max(4, Math.min(14, Math.round((W * H) / 28000)));
      perYear = Math.max(1, Math.min(3, Math.round((maxLive * DWELL) / LIFE.total)));
      sprigs = [];
      embers = [];
      sown.current = -1;
    };

    /**
     * 在一个省的版图内找一个落点：bbox 里撒点，用 isPointInPath 判是否真的在省内。
     * 随机数由「省+名字+年」派生 —— 同一个名字每次重放都落在同一个地方。
     */
    const place = (prov: string, key: string): { x: number; y: number } | null => {
      const p = paths.get(prov);
      const b = bbox.get(prov);
      if (!p || !b || !hit) return null;
      const rnd = mulberry32(hash(key));
      const gap = fs * 4.5;
      for (let i = 0; i < 60; i++) {
        const x = b.x0 + rnd() * (b.x1 - b.x0);
        const y = b.y0 + rnd() * (b.y1 - b.y0);
        if (!hit.isPointInPath(p, x, y)) continue;
        // 别撞在一起：名字要读得出，不是堆在一起的墨团
        if (sprigs.some((s) => Math.hypot(s.x - x, s.y - y) < gap)) continue;
        return { x, y };
      }
      return null;
    };

    const sow = (yi: number, now: number): void => {
      const y = years[yi];
      if (y === undefined) return;
      const c = byYear.get(y);
      if (!c) return;
      const events = [
        ...c.out.map(([prov, from, to]) => ({ prov, from, to })),
        ...c.in.map(([prov, name]) => ({ prov, from: '', to: name })),
      ];
      /*
       * 必须洗牌再取。事件是按编码排序的，直接取前 N 条 = 永远取到 11(北京)、13(河北) ——
       * 整整四十年只有华北在烧，而真相是全国都在烧。用「年份」做种子，洗法确定，重放一致。
       */
      const rnd = mulberry32(hash(`sow${y}`));
      for (let i = events.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const a = events[i]!;
        events[i] = events[j]!;
        events[j] = a;
      }
      let planted = 0;
      for (const e of events) {
        if (planted >= perYear || sprigs.length >= maxLive) break;
        const at = place(e.prov, `${y}|${e.prov}|${e.from || e.to}`);
        if (!at) continue; // 这个省这一刻挤不下了，就换一个 —— 名册是抽样，不是清单
        planted++;
        /*
         * 落点在省内，但**标签**是以落点为中心画的 ——「普洱哈尼族彝族自治县」比海南岛还宽。
         * 把中心夹回画布内，否则长名字会被画布边缘齐刷刷切掉半截。
         * 夹的是标签的中心，不是落点的省份归属：它仍然在这个省的版图上起火。
         */
        ctx.font = face();
        const wide = Math.max(ctx.measureText(e.from).width, ctx.measureText(e.to).width);
        const half = wide / 2 + 4;
        sprigs.push({
          t0: now,
          x: Math.min(Math.max(at.x, half), W - half),
          y: at.y,
          from: e.from,
          to: e.to,
          ash: [],
          burnt: 0,
          ox: 0,
          oy: 0,
          ow: 0,
        });
      }
    };

    /** 火线扫过旧名：扫到哪里，哪里的笔画就焦掉、离地，变成灰 */
    const burn = (s: Sprig, age: number, now: number, alpha: number): void => {
      if (s.ash.length === 0) {
        const g = sampleGlyph(s.from, face(), fs);
        s.ash = g.pts;
        s.ow = g.w;
        s.ox = s.x - g.w / 2;
        s.oy = s.y - g.ascent - 1;
      }
      const p = clamp01((age - LIFE.burnAt) / LIFE.burn);
      const front = p * s.ow;

      /*
       * 字只画一次，填充色是一道**横向渐变**：火线左边透明（已烧尽）、火线处焦褐、右边仍是墨。
       * 这比「沿火线裁切」自然得多 —— 裁切是刀切，边缘是直的、冷的；
       * 燃烧的纸不是被切开的，它先焦、再脆、再没有。这道渐变就是那条焦边。
       */
      const g = ctx.createLinearGradient(s.ox + front - 15, 0, s.ox + front + 3, 0);
      g.addColorStop(0, rgba(PALETTE.ink, 0));
      g.addColorStop(0.42, rgba(PALETTE.clay, 0.5 * alpha));
      g.addColorStop(1, rgba(PALETTE.ink, alpha));
      ctx.fillStyle = g;
      ctx.font = face();
      ctx.fillText(s.from, s.ox + 1, s.y);

      while (s.burnt < s.ash.length) {
        const pt = s.ash[s.burnt];
        if (!pt || pt.x > front) break;
        s.burnt++;
        embers.push({
          x: s.ox + pt.x,
          y: s.oy + pt.y,
          // 散开，不要队列：方向、速度、寿命都各是各的，齐整的灰不是灰
          vx: (Math.random() - 0.5) * 0.03,
          vy: -0.006 - Math.random() * 0.02,
          lit: now,
          span: 1600 + Math.random() * 1800,
          size: Math.random() < 0.75 ? 1 : 1.6,
          swirl: Math.random() * Math.PI * 2,
        });
      }
    };

    /**
     * 新名字：先抽一茎，再自基线向上舒展，颜色由松绿收成墨色 —— 长出来的，不是淡入的。
     * 「淡入」是整个字一起变浓；「长出来」是字从下往上被揭开，而且它一开始是活的（松绿），
     * 定型之后才沉成墨。这是整张图上唯一的绿。
     */
    const sprout = (s: Sprig, age: number, alpha: number): void => {
      const startAt = s.from ? LIFE.sproutAt : BORN_SPROUT_AT;
      const p = clamp01((age - startAt) / LIFE.sprout);
      if (p <= 0) return;
      // smoothstep：慢起、加速、稳稳落定 —— 植物就是这么长的，不是弹出来的
      const e = p * p * (3 - 2 * p);

      ctx.font = face();
      const w = ctx.measureText(s.to).width;
      const gx = s.x - w / 2;
      const gy = s.y + (1 - e) * 3;
      const asc = fs * 0.86;

      const grow = clamp01(p * 3);
      const stemA = (1 - clamp01((p - 0.45) / 0.35)) * 0.55 * alpha;
      if (stemA > 0.01) {
        ctx.strokeStyle = rgba(PALETTE.pine, stemA);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + fs * 0.75);
        ctx.lineTo(s.x, s.y + fs * 0.75 - fs * 0.7 * grow);
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(gx - 2, gy - asc * e, w + 4, asc * e + fs * 0.3);
      ctx.clip();
      // 颜色比形状慢一拍（p**1.9）：字已经长齐了还带着一层青，然后才沉成墨
      const k = p ** 1.9;
      ctx.fillStyle = `rgba(${Math.round(lerp(PALETTE.pine[0], PALETTE.ink[0], k))},${Math.round(
        lerp(PALETTE.pine[1], PALETTE.ink[1], k)
      )},${Math.round(lerp(PALETTE.pine[2], PALETTE.ink[2], k))},${alpha})`;
      ctx.fillText(s.to, gx, gy);
      ctx.restore();
    };

    const draw = (now: number, dt: number): void => {
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0, W, H);
      ctx.textBaseline = 'alphabetic';

      sprigs = sprigs.filter((s) => now - s.t0 <= LIFE.total);
      for (const s of sprigs) {
        const age = now - s.t0;
        const alpha =
          age < LIFE.fadeIn
            ? age / LIFE.fadeIn
            : age > LIFE.fadeAt
              ? 1 - (age - LIFE.fadeAt) / (LIFE.total - LIFE.fadeAt)
              : 1;

        if (s.from) {
          if (age < LIFE.burnAt) {
            ctx.fillStyle = rgba(PALETTE.ink, alpha);
            ctx.font = face();
            ctx.fillText(s.from, s.x - ctx.measureText(s.from).width / 2, s.y);
          } else if (age < LIFE.burnAt + LIFE.burn + 40) {
            burn(s, age, now, alpha);
          }
        }
        if (s.to) sprout(s, age, alpha);
      }

      // 灰：浮力把它抬起来，气流把它带偏，冷掉之后就散了
      const keep: Ember[] = [];
      for (const e of embers) {
        const age = (now - e.lit) / e.span;
        if (age >= 1) continue;
        e.vy -= 0.0000185 * dt;
        e.vx += Math.sin(now * 0.0016 + e.swirl) * 0.000014 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const a = (age < 0.25 ? 1 : 1 - (age - 0.25) / 0.75) * 0.9;
        const [from, to, m] =
          age < 0.3
            ? [PALETTE.clay, PALETTE.gold, age / 0.3]
            : [PALETTE.gold, PALETTE.ash, clamp01((age - 0.3) / 0.4)];
        ctx.fillStyle = `rgba(${Math.round(lerp(from[0], to[0], m))},${Math.round(
          lerp(from[1], to[1], m)
        )},${Math.round(lerp(from[2], to[2], m))},${a})`;
        ctx.fillRect(e.x, e.y, e.size, e.size);
        keep.push(e);
      }
      embers = keep;
    };

    /** 表盘 + 时间轴游标：每帧直接写 DOM。走 setState 会把整棵树每帧重渲染一次，代价白付 */
    const readout = (): void => {
      const p = pos.current;
      const i = Math.min(last, Math.floor(p));
      const f = p - i;
      const at = (k: '县' | '区' | '市'): number => {
        const a = series[k][i] ?? 0;
        const b = series[k][Math.min(last, i + 1)] ?? a;
        return lerp(a, b, f);
      };
      const county = at('县');
      const base0 = series['县'][0] ?? 0;
      if (yearEl.current) yearEl.current.textContent = String(years[i] ?? data.yearMin);
      if (numEl.current) numEl.current.textContent = String(Math.round(base0 - county));
      const d = [county, at('区'), at('市')];
      dials.current.forEach((el, k) => {
        if (el) el.textContent = String(Math.round(d[k] ?? 0));
      });
      // 游标用百分比定位，与像素宽度无关；aria 跟着一起走，不能只动像素
      if (head.current) head.current.style.left = `${(p / last) * 100}%`;
      track.current?.setAttribute('aria-valuenow', String(years[i] ?? data.yearMin));
    };

    /** 静止的一帧：给不要动画的人一张长好的图，而不是一个空框 */
    const drawStill = (): void => {
      layout();
      pos.current = last;
      readout();
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0, W, H);
      ctx.font = face();
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(PALETTE.ink, 0.85);
      for (const c of data.changes.slice(-8)) {
        for (const [prov, , to] of c.out) {
          if (!to) continue;
          const at = place(prov, `${c.y}|${prov}|${to}`);
          if (!at) continue;
          sprigs.push({ t0: 0, x: at.x, y: at.y, from: '', to, ash: [], burnt: 0, ox: 0, oy: 0, ow: 0 });
          ctx.fillText(to, at.x - ctx.measureText(to).width / 2, at.y);
        }
      }
    };

    if (still) {
      drawStill();
      return;
    }

    let prev = performance.now();
    const tick = (now: number): void => {
      if (!alive) return;
      const dt = Math.min(now - prev, 50); // 切走标签页再回来，不能让灰瞬移
      prev = now;

      const jump = seekTo.current;
      if (jump !== null) {
        seekTo.current = null;
        pos.current = jump;
        sown.current = Math.floor(jump) - 1;
      }
      if (playRef.current && pos.current < last) {
        pos.current = Math.min(last, pos.current + dt / DWELL);
        if (pos.current >= last) setDone(true);
      }
      const yi = Math.floor(pos.current);
      if (playRef.current && yi > sown.current) {
        for (let k = sown.current + 1; k <= yi; k++) sow(k, now);
        sown.current = yi;
      }
      readout();
      draw(now, dt);
      raf = requestAnimationFrame(tick);
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    // 字没加载完就去量宽度，会量到回退字体，采出来的灰是错位的
    void document.fonts.ready.then(() => {
      if (alive) layout();
    });
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // 只挂一次：整台机器活在 ref 里，重挂会把地图铲平
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, geo, last]);

  /** 时间轴与按钮都走这一个入口：只放下请求，由 rAF 在下一帧统一执行 */
  const seek = (to: number, keepPlaying = false): void => {
    seekTo.current = to;
    if (!keepPlaying) setPlaying(false);
    setDone(to >= last);
  };

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-24">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[19rem_1fr]">
        {/* ---------- 表盘 ---------- */}
        <div className="lg:row-start-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <p className="font-mono text-sm tracking-[0.2em] text-clay">
              {data.yearMin} <span className="text-ink-3">→</span>{' '}
              <span ref={yearEl} className="tabular-nums text-ink">
                {data.yearMin}
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                if (done) {
                  seek(0, true);
                  setPlaying(true);
                } else setPlaying((p) => !p);
              }}
              className="rounded px-2 py-0.5 text-xs text-ink-3 transition hover:bg-paper-2 hover:text-ink-2"
            >
              {done ? `↻ ${t.heroReplay}` : playing ? `❙❙ ${t.heroPause}` : `▶ ${t.heroResume}`}
            </button>
            {!done && (
              <button
                type="button"
                onClick={() => seek(last)}
                className="rounded px-2 py-0.5 text-xs text-ink-3 transition hover:bg-paper-2 hover:text-ink-2"
              >
                {t.heroSkip(data.yearMax)}
              </button>
            )}
          </div>

          <h1 className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span
              ref={numEl}
              className="font-display text-[clamp(4rem,11vw,7rem)] leading-none tracking-tight tabular-nums text-clay"
            >
              0
            </span>
            <span className="font-display text-xl text-ink sm:text-2xl">
              {t.heroSuffix}
            </span>
          </h1>

          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-l-2 border-line pl-5 font-mono text-sm">
            {[
              { label: t.heroDialCounty, color: 'text-clay' },
              { label: t.heroDialDistrict, color: 'text-pine' },
              { label: t.heroDialCity, color: 'text-gold' },
            ].map((d, i) => (
              <div key={d.label} className="flex items-baseline gap-2">
                <dt className="text-ink-3">{d.label}</dt>
                <dd
                  ref={(el) => {
                    dials.current[i] = el;
                  }}
                  className={`font-display text-xl tabular-nums ${d.color}`}
                >
                  0
                </dd>
              </div>
            ))}
          </dl>

        </div>

        {/* ---------- 地图：名字烧在它自己的省份上 ---------- */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div ref={box} className="relative aspect-square w-full">
            <canvas ref={cvs} className="h-full w-full" role="img" aria-label={t.heroField} />
          </div>
          <p className="mt-1 text-right text-[10px] text-ink-3">{t.heroGeoNote}</p>
        </div>

        {/*
         * 结论：机器停下才说话。
         * DOM 顺序排在地图**之后** —— 它虽然透明但占位，若排在地图之前，
         * 窄屏上会在表盘和地图之间撑出一大块空白。桌面端靠显式落位仍回到左下角。
         */}
        <div
          className={`self-end transition-opacity duration-1000 lg:col-start-1 lg:row-start-2 ${
            done ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="font-display text-base leading-loose text-ink-2">
            {t.heroLead(
              data.headline.countyLost,
              data.headline.districtGained,
              data.headline.cityGained
            )}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">{t.heroNote}</p>
        </div>
      </div>

      {/* ---------- 时间轴：不是一条进度条，是四十年的形状 ---------- */}
      <div className="mt-8">
        <Scrubber
          data={data}
          lang={lang}
          posRef={pos}
          headRef={head}
          trackRef={track}
          onSeek={(p) => seek(p)}
        />
      </div>
    </section>
  );
}
