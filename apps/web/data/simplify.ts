/** 一次性脚本：把 DataV 的省级边界简化成首屏能背得动的体量，产出提交进仓库的 china-bounds.json */
type Ring = [number, number][];

/** Douglas–Peucker：保形状、砍点数。eps 单位是度 */
function dp(pts: Ring, eps: number): Ring {
  if (pts.length < 3) return pts;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxD = 0;
  let idx = 0;
  const [x1, y1] = first;
  const [x2, y2] = last;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const d = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [first, last];
  return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)];
}

/**
 * 闭环不能直接喂给 DP：首尾是同一个点，基准线长度为 0，所有垂距恒等于 0，
 * 整个环会一口气塌成 2 个点。先从「离起点最远的那个点」把闭环剖成两条开链，各自简化再接回去。
 */
function dpRing(r: Ring, eps: number): Ring {
  const a = r[0]!;
  const z = r[r.length - 1]!;
  const pts = a[0] === z[0] && a[1] === z[1] ? r.slice(0, -1) : r.slice();
  if (pts.length < 5) return pts;
  const p0 = pts[0]!;
  let k = 1;
  let best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]![0] - p0[0], pts[i]![1] - p0[1]);
    if (d > best) { best = d; k = i; }
  }
  const head = dp(pts.slice(0, k + 1), eps);
  const tail = dp([...pts.slice(k), p0], eps);
  return [...head.slice(0, -1), ...tail.slice(0, -1)]; // 开环存储，闭合由渲染端 closePath 负责
}

const ringArea = (r: Ring): number => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]);
  }
  return Math.abs(a / 2);
};

const g = JSON.parse(await Bun.file('cn.json').text());
const EPS = Number(process.argv[2] ?? 0.035);
const MIN_AREA = Number(process.argv[3] ?? 0.03);

const flat = (r: Ring): number[] => r.flatMap(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);

const provs: { c: string; n: string; r: number[][] }[] = [];
let jd: number[][] = [];
let total = 0;

for (const f of g.features) {
  const code: string = String(f.properties.adcode);
  const isJd = code === '100000_JD';
  const polys: Ring[][] =
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings: Ring[] = [];
  for (const poly of polys) {
    const outer = poly[0];   // 只取外环：内环（飞地/湖）在这个尺度上看不见
    if (!outer) continue;
    rings.push(outer as Ring);
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  const kept: number[][] = [];
  rings.forEach((r, i) => {
    // 九段线一根都不能少，也不做简化 —— 它是国界，不是装饰。点本来就少，省不出什么
    if (isJd) { total += r.length; kept.push(flat(r)); return; }
    // 最大的那个环永远保留（否则一个省可能整个消失）；小岛按面积门槛砍
    if (i > 0 && ringArea(r) < MIN_AREA) return;
    // 容差随环的尺度走：一刀切会把澳门这种小要素整个抹平（5km 容差 > 澳门本身）
    const scaled = Math.min(EPS, Math.sqrt(ringArea(r)) / 30);
    const s = dpRing(r, scaled);
    const final = s.length < 4 ? r : s; // 兜底：宁可不简化，也不能让一个行政区消失
    total += final.length;
    kept.push(flat(final));
  });
  if (isJd) jd = kept;
  else provs.push({ c: code.slice(0, 2), n: String(f.properties.name).replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔)/g, ''), r: kept });
}

const out = { provs, jd };
const json = JSON.stringify(out);
await Bun.write('china-bounds.json', json);
console.log('eps', EPS, '| 省级要素', provs.length, '| 九段线环', jd.length, '| 总点数', total, '| 原始大小', (json.length / 1024).toFixed(1), 'KB');
console.log('gzip', (Bun.gzipSync(Buffer.from(json)).length / 1024).toFixed(1), 'KB');
