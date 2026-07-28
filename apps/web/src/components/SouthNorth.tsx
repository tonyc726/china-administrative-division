/**
 * 南塘北屯 —— 地名通名的语言地理。
 *
 * 这里的数据是**二维交叉频次**（10 个通名 × 31 个省），热力图是它的正解：
 * 矩阵结构本身就是要看的东西 —— 分野是一条对角线，不是十条独立的条形。
 * （反过来，上一节的「村名 TOP20」是一维频次，用热力图反而读不出量差，所以那里用条形。）
 *
 * 两个统计决定，都不是随手做的：
 *
 * 1. 归一化到「每万村」。直接比原始村数，读到的只是「哪个省村多」——河北 5 万村，
 *    海南 2 千村，任何字在河北的绝对数都高。省份体量是混淆变量，必须除掉。
 *    界面上留了开关，切到「原始村数」就能亲眼看见这个陷阱（这是本页最值钱的一次交互）。
 *
 * 2. 行内归一化上色。要回答的是「这个字**集中在**哪儿」——那是一个行内条件分布问题，
 *    所以每一行按自己的最大值上色；跨行的量级差异由行首的总数列承担，不靠颜色。
 *    否则「垅」（118 个村）整行会黑成一片，什么也读不出来。
 *
 * 3. 省份的排序不是我们指定的：按「北方通名密度 − 南方通名密度」排（seriation），
 *    从北到南的谱是数据自己排出来的。不画地图（规避地图审核），矩阵一样能说清。
 */
import { useMemo, useState } from 'react';
import type { Names } from '../types';
import { COPY, type Lang } from '../i18n';

interface Props {
  data: Names;
  lang: Lang;
}

type Mode = 'rate' | 'raw';

interface Cell {
  count: number;
  /** 每万村 */
  rate: number;
}

export function SouthNorth({ data, lang }: Props): JSX.Element {
  const t = COPY[lang];
  const { north, south, stats, provTotals } = data.marks;
  const marks = useMemo(() => [...north, ...south], [north, south]);

  const [mode, setMode] = useState<Mode>('rate');
  const [hover, setHover] = useState<{ mark: string; prov: string } | null>(null);

  /** 矩阵 + 省份排序（一次算完，mode 只影响取哪个字段与上色） */
  const { provs, matrix } = useMemo(() => {
    const m = new Map<string, Map<string, Cell>>();
    for (const mk of marks) {
      const row = new Map<string, Cell>();
      for (const [prov, count] of stats[mk]?.provs ?? []) {
        const total = provTotals[prov] ?? 0;
        row.set(prov, { count, rate: total > 0 ? (count / total) * 10000 : 0 });
      }
      m.set(mk, row);
    }
    const rateOf = (mk: string, p: string): number => m.get(mk)?.get(p)?.rate ?? 0;
    // 村数过少的省（如港澳台占位）不参与——分母太小，密度会失真
    const list = Object.keys(provTotals).filter((p) => (provTotals[p] ?? 0) >= 500);
    list.sort((a, b) => {
      const score = (p: string): number =>
        north.reduce((s, mk) => s + rateOf(mk, p), 0) -
        south.reduce((s, mk) => s + rateOf(mk, p), 0);
      return score(b) - score(a);
    });
    return { provs: list, matrix: m };
  }, [marks, north, south, stats, provTotals]);

  /** 行内最大值：颜色回答「这个字集中在哪」，不回答「哪个字多」 */
  const rowMax = useMemo(() => {
    const out = new Map<string, number>();
    for (const mk of marks) {
      let mx = 0;
      for (const p of provs) {
        const c = matrix.get(mk)?.get(p);
        const v = c ? (mode === 'rate' ? c.rate : c.count) : 0;
        if (v > mx) mx = v;
      }
      out.set(mk, mx || 1);
    }
    return out;
  }, [marks, provs, matrix, mode]);

  const active = hover ? matrix.get(hover.mark)?.get(hover.prov) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="font-display text-2xl text-ink sm:text-3xl">
        {t.marksTitle}
      </h2>
      <p className="mt-2 text-sm text-ink-3">{t.marksSub}</p>

      {/* 归一化开关 —— 这一页最值钱的一次交互：亲手把混淆变量摘掉 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 rounded-md border border-line bg-paper-2/60 p-0.5 text-xs">
          {(['rate', 'raw'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded px-2.5 py-1 transition ${
                mode === m
                  ? 'bg-ink text-paper'
                  : 'text-ink-3 hover:bg-paper-3 hover:text-ink-2'
              }`}
            >
              {m === 'rate' ? t.marksModeRate : t.marksModeRaw}
            </button>
          ))}
        </div>
        {/* 读数条：hover 时给准确数字，颜色只负责让人看见形状 */}
        <p className="min-h-5 flex-1 text-xs text-ink-2">
          {hover && active
            ? t.marksCell(
                hover.prov,
                hover.mark,
                active.count,
                active.rate.toFixed(active.rate >= 100 ? 0 : 1)
              )
            : ''}
        </p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-paper-2/0" />
              <th />
              {provs.map((p) => (
                <th
                  key={p}
                  scope="col"
                  className={`h-20 px-0 align-bottom font-normal transition-colors ${
                    hover?.prov === p ? 'text-ink' : 'text-ink-3'
                  }`}
                >
                  <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl]">
                    {p.replace(/(省|市|自治区|壮族|回族|维吾尔|特别行政区)/g, '')}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {marks.map((mk, i) => {
              const isNorth = i < north.length;
              const mx = rowMax.get(mk) ?? 1;
              return (
                <tr key={mk} className={i === north.length ? 'border-t' : ''}>
                  <th
                    scope="row"
                    className={`w-8 pr-2 text-right font-display text-2xl font-normal ${
                      isNorth ? 'text-ink' : 'text-clay'
                    } ${i === north.length ? 'pt-3' : ''}`}
                  >
                    {mk}
                  </th>
                  <td
                    className={`w-14 pr-3 text-right font-mono text-[10px] tabular-nums text-ink-3 ${
                      i === north.length ? 'pt-3' : ''
                    }`}
                  >
                    {(stats[mk]?.total ?? 0).toLocaleString()}
                  </td>
                  {provs.map((p) => {
                    const c = matrix.get(mk)?.get(p);
                    const v = c ? (mode === 'rate' ? c.rate : c.count) : 0;
                    // sqrt：线性映射会让中低段全糊成一片浅色，看不出梯度
                    const k = Math.sqrt(v / mx);
                    const on = hover?.mark === mk || hover?.prov === p;
                    return (
                      <td
                        key={p}
                        className={`p-px ${i === north.length ? 'pt-3' : ''}`}
                        onMouseEnter={() => setHover({ mark: mk, prov: p })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <span
                          title={t.marksCell(
                            p,
                            mk,
                            c?.count ?? 0,
                            (c?.rate ?? 0).toFixed(1)
                          )}
                          className="block h-6 w-full min-w-[1.1rem] rounded-[2px] transition-[opacity,box-shadow]"
                          style={{
                            backgroundColor: isNorth
                              ? `rgba(20, 20, 19, ${0.04 + k * 0.9})`
                              : `rgba(204, 120, 92, ${0.04 + k * 0.92})`,
                            boxShadow: on ? 'inset 0 0 0 1px rgba(20,20,19,.45)' : undefined,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/80" />
          {t.marksNorth}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-clay/80" />
          {t.marksSouth}
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-ink-3">
        {t.marksColorNote}
      </p>
      <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-ink-3">
        {t.marksModeNote}
      </p>
      <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-ink-3">
        {t.marksAxisProv}
      </p>

      <p className="mt-8 max-w-3xl border-l-2 border-clay pl-4 font-display text-lg leading-loose text-ink-2">
        {t.marksLead}
      </p>
    </div>
  );
}
