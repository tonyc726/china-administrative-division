/**
 * 政区信息面板(规格 2026-07-18-place-info-panel-design.md §7)。
 *
 * 当前为降级版:仅展示坐标 + 高德链接。数据源:
 *   - 村级(L5)来自 coords/shards/<县级码>.json(该县下村/社区坐标)
 *   - 省/市/县级(L1-L3)来自 coords/upper.json(21200/21300/21400 join NBS 码)
 *   - 乡级(L4)暂无数据源,降级隐藏(规格 §7.5)
 * 百科摘要/面积/人口待百科抓取(place-info-panel §8.2)后补。
 *
 * 坐标系:存储 CGCS2000(≈WGS84),跳转高德前转 GCJ-02(规格 §7.4)。
 */
import { useEffect, useState } from 'react';
import type { Division } from '../types';

const BASE = import.meta.env.BASE_URL;

interface CoordRow {
  code: string;
  name: string;
  coord: [number, number];
  placeTypeCode: string;
  source: string;
}

/** upper.json:省/市/县自身坐标(降级时为占位或无 counties 键,故数组可缺省) */
interface UpperFile {
  provinces?: CoordRow[];
  cities?: CoordRow[];
  counties?: CoordRow[];
}

interface Props {
  leaf: Division;
}

// upper.json ~400KB,会话内只 fetch/解析一次(多节点点击复用);
// 失败不缓存,下次点击重试
let upperPromise: Promise<UpperFile> | null = null;
function loadUpper(): Promise<UpperFile> {
  if (!upperPromise) {
    upperPromise = fetch(`${BASE}data/coords/upper.json`)
      .then((r) => (r.ok ? (r.json() as Promise<UpperFile>) : {}))
      .catch(() => {
        upperPromise = null;
        return {} as UpperFile;
      });
  }
  return upperPromise;
}

// ── WGS84 -> GCJ-02(规格 §7.4,高德 URI API 接收 GCJ-02) ──
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret =
    300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS84/CGCS2000 -> GCJ-02(大陆境内偏移修正,高德 URI 需要) */
export function wgs84ToGcj02(lon: number, lat: number): [number, number] {
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lon + dLon, lat + dLat];
}

/** 生成高德地图跳转链接(URI API,合规,无需 API Key,规格 §7.4) */
export function getAmapLink(name: string, coord: [number, number]): string {
  const [lon, lat] = coord;
  const [glon, glat] = wgs84ToGcj02(lon, lat);
  return `https://uri.amap.com/marker?position=${glon},${glat}&name=${encodeURIComponent(name)}`;
}

export function InfoPanel({ leaf }: Props): JSX.Element | null {
  const [coord, setCoord] = useState<CoordRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCoord(null);
    // 村级(level 5):fetch 该县分片,找 leaf.code 的坐标
    if (leaf.level === 5 && leaf.code.length === 12) {
      const county12 = leaf.code.slice(0, 6) + '000000';
      fetch(`${BASE}data/coords/shards/${county12}.json`)
        .then((r) => (r.ok ? r.json() : Promise.resolve([])))
        .then((rows: CoordRow[]) => {
          if (cancelled) return;
          setCoord(rows.find((r) => r.code === leaf.code) ?? null);
        })
        .catch(() => {
          if (!cancelled) setCoord(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (leaf.level >= 1 && leaf.level <= 3) {
      // 省/市/县级(level 1-3):upper.json 各级数组按码查
      loadUpper()
        .then((u) => {
          if (cancelled) return;
          const rows =
            leaf.level === 1 ? u.provinces : leaf.level === 2 ? u.cities : u.counties;
          setCoord((rows ?? []).find((r) => r.code === leaf.code) ?? null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      // 乡级(level 4)暂无坐标数据源,降级隐藏(规格 §7.5)
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [leaf.code, leaf.level]);

  // 降级:无坐标隐藏地图区块(规格 §7.5)
  if (loading || !coord) return null;

  const [lon, lat] = coord.coord;
  return (
    <div className="mt-6 border-t border-line pt-4">
      <p className="flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-widest text-ink-3">坐标</span>
        <span className="font-display text-lg text-ink-2">
          {lon.toFixed(4)}°E, {lat.toFixed(4)}°N
        </span>
      </p>
      <p className="mt-1 text-xs text-ink-3">CGCS2000 · 来源:中国·国家地名信息库</p>
      <a
        href={getAmapLink(leaf.name, coord.coord)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm text-clay hover:text-clay-2"
      >
        在高德地图中查看 →
      </a>
    </div>
  );
}
